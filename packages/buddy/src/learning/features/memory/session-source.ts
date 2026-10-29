import { createHash } from "node:crypto"
import z from "zod"
import type { MessageWithParts, Part, ToolPart } from "@buddy/transcript-contract/message"
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

function jsonText<TValue>(value: TValue): string | undefined {
  const parsed = z.string().safeParse(value)
  if (parsed.success) return parsed.data
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

function toolStateText(part: ToolPart): string | undefined {
  if (part.sourceText !== undefined) return part.sourceText
  const state = part.state
  switch (state.status) {
    case "pending":
      return state.raw
    case "running":
      return jsonText(state.input)
    case "completed":
      return [
        state.output,
        ...(state.attachments ?? []).map((file) =>
          [file.filename, file.mime, file.url].filter(Boolean).join(" "),
        ),
      ]
        .filter(Boolean)
        .join("\n")
    case "error":
      return state.error
  }
}

function assistantPartText(part: Part): string | undefined {
  switch (part.type) {
    case "text":
      return part.text
    case "tool":
      return toolStateText(part)
    default:
      return undefined
  }
}

function userMessageText(message: MessageWithParts): string {
  if (message.info.role !== "user") return ""
  const textParts = message.parts.filter((part) => part.type === "text")
  const text =
    textParts.length === 0
      ? (message.info.sourceText ?? "")
      : textParts
          .flatMap((part) =>
            !part.synthetic && !part.ignored && !isScaffoldText(part.text) ? [part.text] : [],
          )
          .join("")
  return [
    isScaffoldText(text) ? undefined : text,
    ...message.parts.flatMap((part) => {
      if (part.type !== "file") return []
      return [
        [
          part.filename,
          part.mime,
          part.source?.type === "uri" ? part.source.uri : undefined,
          part.sourceText ?? part.source?.text?.value,
        ]
          .filter(Boolean)
          .join("\n"),
      ]
    }),
    ...message.parts.flatMap((part) =>
      part.type === "agent"
        ? [[part.name, part.sourceText ?? part.source?.value].filter(Boolean).join("\n")]
        : [],
    ),
  ]
    .filter(Boolean)
    .join("\n")
}

function filteredMessage(message: MessageWithParts): FilteredSessionMessage | undefined {
  if (message.info.role === "assistant" && message.info.kind) return undefined
  const rawText =
    message.info.role === "user"
      ? userMessageText(message)
      : message.parts.flatMap((part) => assistantPartText(part) ?? []).join("\n")
  const text = redactSecrets(rawText.trim())
  if (!text) return undefined
  const outputTokens =
    message.info.role === "assistant" && message.info.usageRecorded !== false
      ? message.info.tokens.output + message.info.tokens.reasoning
      : undefined
  return Object.assign(
    {
      id: message.info.id,
      role: message.info.role,
      createdAt: new Date(message.info.time.created).toISOString(),
      text,
      toolNames:
        message.info.role === "assistant"
          ? message.parts.flatMap((part) => (part.type === "tool" ? [part.tool] : []))
          : [],
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
  messages: readonly MessageWithParts[]
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
