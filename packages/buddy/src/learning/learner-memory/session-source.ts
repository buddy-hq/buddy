import { createHash } from "node:crypto"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
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

function partText(part: MessageV2.Part): string | undefined {
  switch (part.type) {
    case "text":
      if (part.ignored || part.synthetic || isScaffoldText(part.text)) return undefined
      return part.text
    case "tool":
      if (part.state.status === "completed") return part.state.output
      if (part.state.status === "error") return part.state.error
      return undefined
    case "subtask":
      return [part.description, part.prompt].filter(Boolean).join("\n")
    case "agent":
      return [part.name, part.source?.value].filter(Boolean).join("\n")
    case "file":
      return [part.filename, part.source?.text.value].filter(Boolean).join("\n")
    case "patch":
      return part.files.join("\n")
    case "step-finish":
      return `finish=${part.reason} tokens=${part.tokens.total ?? part.tokens.input + part.tokens.output + part.tokens.reasoning}`
    case "reasoning":
    case "snapshot":
    case "step-start":
    case "retry":
    case "compaction":
      return undefined
  }
}

function messageToolNames(message: MessageV2.WithParts): string[] {
  return message.parts.flatMap((part) => (part.type === "tool" ? [part.tool] : []))
}

function assistantOutputTokens(info: MessageV2.Assistant): number {
  return info.tokens.total ?? info.tokens.output + info.tokens.reasoning
}

function messageCreatedAt(info: MessageV2.Info): string {
  return new Date(info.time.created).toISOString()
}

function filteredMessage(message: MessageV2.WithParts): FilteredSessionMessage | undefined {
  if (message.info.role !== "user" && message.info.role !== "assistant") return undefined
  const text = redactSecrets(
    message.parts
      .flatMap((part) => partText(part) ?? [])
      .join("\n")
      .trim(),
  )
  if (!text) return undefined

  return {
    id: message.info.id,
    role: message.info.role,
    createdAt: messageCreatedAt(message.info),
    text,
    toolNames: messageToolNames(message),
    ...(message.info.role === "assistant"
      ? { outputTokens: assistantOutputTokens(message.info) }
      : {}),
  }
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
      messages: input.messages.map((message) => ({
        id: message.id,
        role: message.role,
        createdAt: message.createdAt,
        text: message.text,
        toolNames: message.toolNames,
        ...(message.outputTokens !== undefined ? { outputTokens: message.outputTokens } : {}),
      })),
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
  messages: readonly MessageV2.WithParts[]
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
