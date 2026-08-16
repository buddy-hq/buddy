import { createHash } from "node:crypto"
import { DateTime } from "effect"
import type { SessionV2 } from "@buddy/opencode-adapter/session-v2"
import type { LearnerEvent } from "./types"
import { redactSecrets } from "./redaction"
import { truncateHeadTail, type TruncatedText } from "./text-budget"
import { LEARNER_MEMORY_SESSION_SOURCE_TUNING } from "./tuning"

const SYNTHETIC_LEARNER_CONTEXT_MARKER =
  LEARNER_MEMORY_SESSION_SOURCE_TUNING.syntheticLearnerContextMarker
const USER_INSTRUCTIONS_MARKER = LEARNER_MEMORY_SESSION_SOURCE_TUNING.userInstructionsMarker
const SKILL_INSTRUCTIONS_MARKER = LEARNER_MEMORY_SESSION_SOURCE_TUNING.skillInstructionsMarker

type FilteredSessionMessage = {
  id: string
  role: "user" | "assistant"
  createdAt: string
  text: string
  toolNames: string[]
  outputTokens?: number
}

type FilteredSessionSource = {
  messages: FilteredSessionMessage[]
  learningEvents: LearnerEvent[]
  sourceUpdatedAt: string
  sourceMessageCount: number
  sourceFingerprint: string
  transcript: string
}

type TruncatedSessionSource = FilteredSessionSource & {
  transcript: string
  truncation: TruncatedText
}

function isScaffoldText(value: string): boolean {
  return (
    value.includes(USER_INSTRUCTIONS_MARKER) ||
    value.includes(SKILL_INSTRUCTIONS_MARKER) ||
    value.includes(SYNTHETIC_LEARNER_CONTEXT_MARKER)
  )
}

type AssistantToolContent = Extract<SessionV2.Assistant["content"][number], { type: "tool" }>
type ToolOutputContent = Extract<
  AssistantToolContent["state"],
  { status: "completed" }
>["content"][number]

function jsonText(value: unknown): string | undefined {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function toolOutputContentText(content: ToolOutputContent): string {
  if (content.type === "text") return content.text

  return [content.name, content.mime, content.uri].filter(Boolean).join(" ")
}

function toolStateText(state: AssistantToolContent["state"]): string | undefined {
  switch (state.status) {
    case "pending":
      return state.input
    case "running":
    case "completed":
      return [...state.content.map(toolOutputContentText), jsonText(state.structured)]
        .filter(Boolean)
        .join("\n")
    case "error":
      return [
        state.error.message,
        ...state.content.map(toolOutputContentText),
        jsonText(state.structured),
      ]
        .filter(Boolean)
        .join("\n")
  }
}

function assistantContentText(content: SessionV2.Assistant["content"][number]): string | undefined {
  switch (content.type) {
    case "text":
      return content.text
    case "reasoning":
      return undefined
    case "tool":
      return toolStateText(content.state)
  }
}

function userMessageText(message: SessionV2.User): string {
  return [
    isScaffoldText(message.text) ? undefined : message.text,
    ...(message.files ?? []).map((file) =>
      [file.name, file.mime, file.uri, file.source?.text].filter(Boolean).join("\n"),
    ),
    ...(message.agents ?? []).map((agent) =>
      [agent.name, agent.source?.text].filter(Boolean).join("\n"),
    ),
  ]
    .filter(Boolean)
    .join("\n")
}

function assistantMessageText(message: SessionV2.Assistant): string {
  return message.content.flatMap((content) => assistantContentText(content) ?? []).join("\n")
}

function messageToolNames(message: SessionV2.Message): string[] {
  if (message.type !== "assistant") return []
  return message.content.flatMap((content) => (content.type === "tool" ? [content.name] : []))
}

function assistantOutputTokens(message: SessionV2.Assistant): number | undefined {
  if (!message.tokens) return undefined
  return message.tokens.output + message.tokens.reasoning
}

function messageCreatedAt(message: SessionV2.Message): string {
  return new Date(DateTime.toEpochMillis(message.time.created)).toISOString()
}

function filteredMessage(message: SessionV2.Message): FilteredSessionMessage | undefined {
  if (message.type !== "user" && message.type !== "assistant") return undefined
  const rawText = message.type === "user" ? userMessageText(message) : assistantMessageText(message)
  const text = redactSecrets(rawText.trim())
  if (!text) return undefined

  const outputTokens = message.type === "assistant" ? assistantOutputTokens(message) : undefined
  return Object.assign(
    {
      id: message.id,
      role: message.type,
      createdAt: messageCreatedAt(message),
      text,
      toolNames: messageToolNames(message),
    },
    outputTokens !== undefined ? { outputTokens } : undefined,
  )
}

function sourceUpdatedAt(messages: readonly FilteredSessionMessage[]): string {
  const latest = messages
    .map((message) => new Date(message.createdAt).getTime())
    .filter(Number.isFinite)
    .toSorted((left, right) => right - left)[0]
  return new Date(latest ?? Date.now()).toISOString()
}

function fingerprintSource(input: {
  messages: readonly FilteredSessionMessage[]
  learningEvents: readonly LearnerEvent[]
}): string {
  const hash = createHash("sha256")
  for (const message of input.messages) {
    hash.update(message.id)
    hash.update(message.createdAt)
    hash.update(message.text)
  }
  for (const event of input.learningEvents) {
    hash.update(event.id)
    hash.update(event.createdAt)
    hash.update(event.searchableText)
  }
  return hash.digest("hex")
}

function renderStructuredSource(input: {
  messages: readonly FilteredSessionMessage[]
  learningEvents: readonly LearnerEvent[]
}): string {
  return JSON.stringify(
    {
      kind: "buddy_learner_memory_extraction_source",
      messages: input.messages.map((message) =>
        Object.assign(
          {
            id: message.id,
            role: message.role,
            createdAt: message.createdAt,
            text: message.text,
            toolNames: message.toolNames,
          },
          message.outputTokens !== undefined ? { outputTokens: message.outputTokens } : undefined,
        ),
      ),
      learningEvents: input.learningEvents.map((event) => ({
        id: event.id,
        type: event.type,
        sourceKind: event.sourceKind,
        createdAt: event.createdAt,
        text: redactSecrets(event.searchableText),
      })),
    },
    null,
    2,
  )
}

function buildFilteredSessionSource(input: {
  messages: readonly SessionV2.Message[]
  learningEvents: readonly LearnerEvent[]
}): FilteredSessionSource {
  const messages = input.messages.flatMap((message) => {
    const filtered = filteredMessage(message)
    return filtered ? [filtered] : []
  })
  const learningEvents = [...input.learningEvents]
  const transcript = renderStructuredSource({ messages, learningEvents })

  return {
    messages,
    learningEvents,
    sourceUpdatedAt: sourceUpdatedAt(messages),
    sourceMessageCount: messages.length,
    sourceFingerprint: fingerprintSource({ messages, learningEvents }),
    transcript,
  }
}

function truncateSessionSource(input: {
  source: FilteredSessionSource
  tokenBudget: number
}): TruncatedSessionSource {
  const truncation = truncateHeadTail({
    text: input.source.transcript,
    tokenBudget: input.tokenBudget,
  })
  return {
    ...input.source,
    transcript: truncation.text,
    truncation,
  }
}

export { buildFilteredSessionSource, truncateSessionSource }
export type { FilteredSessionMessage, FilteredSessionSource, TruncatedSessionSource }
