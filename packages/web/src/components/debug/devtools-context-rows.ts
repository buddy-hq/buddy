import type { MessageInfo, MessagePart, MessageWithParts } from "@/state/chat-types"
import type { DevToolsRowTokenSummary, DevToolsTokenValue } from "./devtools-context-format"
import {
  estimateDevToolsTokensFromText,
  estimateDevToolsTokensFromUnknown,
} from "./devtools-context-breakdown"

export type DevToolsContextRowKind = "message" | "tool" | "step"

export type DevToolsContextRow = {
  key: string
  kind: DevToolsContextRowKind
  label: string
  id: string
  detail: string
  status?: string
  createdAt?: number
  tokens: DevToolsRowTokenSummary
  json: unknown
  nested: boolean
}

const TOOL_PART_TYPE = "tool"
const STEP_FINISH_PART_TYPE = "step-finish"
const TEXT_PART_TYPE = "text"
const FILE_PART_TYPE = "file"
const AGENT_PART_TYPE = "agent"
const TOOL_STATUS_PENDING = "pending"
const TOOL_STATUS_RUNNING = "running"
const TOOL_STATUS_COMPLETED = "completed"
const TOOL_STATUS_ERROR = "error"
const TOKEN_TOTAL_FALLBACK_INPUT = 0
const TOKEN_TOTAL_FALLBACK_OUTPUT = 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringField(value: Record<string, unknown>, key: string) {
  const entry = value[key]
  return typeof entry === "string" ? entry : undefined
}

function numberField(value: Record<string, unknown>, key: string) {
  const entry = value[key]
  return typeof entry === "number" && Number.isFinite(entry) ? entry : undefined
}

function recordField(value: Record<string, unknown>, key: string) {
  const entry = value[key]
  return isRecord(entry) ? entry : undefined
}

function tokenValue(value: number, estimated: boolean): DevToolsTokenValue {
  return {
    value: Math.max(0, value),
    estimated,
  }
}

function exactTokenValue(value: number): DevToolsTokenValue {
  return tokenValue(value, false)
}

function estimatedTokenValue(value: number | undefined): DevToolsTokenValue | undefined {
  return value === undefined ? undefined : tokenValue(value, true)
}

function assistantTokens(message: Extract<MessageInfo, { role: "assistant" }>) {
  return {
    input: exactTokenValue(message.tokens.input),
    output: exactTokenValue(message.tokens.output),
  }
}

function fileText(part: Record<string, unknown>) {
  const source = recordField(part, "source")
  const text = source ? recordField(source, "text") : undefined
  return text ? stringField(text, "value") : undefined
}

function agentText(part: Record<string, unknown>) {
  const source = recordField(part, "source")
  return source ? stringField(source, "value") : undefined
}

function estimateUserInputTokens(message: MessageWithParts) {
  const partsTokens = message.parts.reduce((sum, part) => {
    if (part.type === TEXT_PART_TYPE) {
      return sum + (typeof part.text === "string" ? estimateDevToolsTokensFromText(part.text) : 0)
    }
    if (!isRecord(part)) return sum
    if (part.type === FILE_PART_TYPE) {
      const text = fileText(part)
      return sum + (text ? estimateDevToolsTokensFromText(text) : 0)
    }
    if (part.type === AGENT_PART_TYPE) {
      const text = agentText(part)
      return sum + (text ? estimateDevToolsTokensFromText(text) : 0)
    }
    return sum
  }, 0)

  const systemTokens =
    message.info.role === "user" && message.info.system
      ? estimateDevToolsTokensFromText(message.info.system)
      : 0

  return partsTokens + systemTokens
}

function messageTokens(message: MessageWithParts): DevToolsRowTokenSummary {
  if (message.info.role === "assistant") return assistantTokens(message.info)

  const inputTokens = estimateUserInputTokens(message)
  return {
    input: inputTokens > 0 ? estimatedTokenValue(inputTokens) : undefined,
  }
}

function toolInputTokens(state: Record<string, unknown>) {
  return estimatedTokenValue(estimateDevToolsTokensFromUnknown(recordField(state, "input")))
}

function toolOutputTokens(state: Record<string, unknown>) {
  const status = stringField(state, "status")
  if (status === TOOL_STATUS_PENDING) {
    return estimatedTokenValue(estimateDevToolsTokensFromUnknown(stringField(state, "raw")))
  }
  if (status === TOOL_STATUS_RUNNING) return undefined
  if (status === TOOL_STATUS_COMPLETED) {
    return estimatedTokenValue(estimateDevToolsTokensFromUnknown(stringField(state, "output")))
  }
  if (status === TOOL_STATUS_ERROR) {
    return estimatedTokenValue(estimateDevToolsTokensFromUnknown(stringField(state, "error")))
  }
  return undefined
}

function toolTokens(part: MessagePart): DevToolsRowTokenSummary {
  if (!isRecord(part)) return {}
  const state = recordField(part, "state")
  if (!state) return {}

  return {
    input: toolInputTokens(state),
    output: toolOutputTokens(state),
  }
}

function stepTokens(part: MessagePart): DevToolsRowTokenSummary {
  if (!isRecord(part)) return {}
  const tokens = recordField(part, "tokens")
  if (!tokens) return {}

  return {
    input: exactTokenValue(numberField(tokens, "input") ?? TOKEN_TOTAL_FALLBACK_INPUT),
    output: exactTokenValue(numberField(tokens, "output") ?? TOKEN_TOTAL_FALLBACK_OUTPUT),
  }
}

function messageRow(message: MessageWithParts): DevToolsContextRow {
  return {
    key: `message:${message.info.id}`,
    kind: "message",
    label: message.info.id,
    id: message.info.id,
    detail: "",
    status: message.info.role,
    createdAt: message.info.time.created,
    tokens: messageTokens(message),
    json: {
      message: message.info,
      parts: message.parts,
    },
    nested: false,
  }
}

function toolRow(message: MessageWithParts, part: MessagePart): DevToolsContextRow | undefined {
  if (part.type !== TOOL_PART_TYPE) return undefined
  if (!isRecord(part)) return undefined

  const tool = stringField(part, "tool") ?? "tool"
  const callID = stringField(part, "callID") ?? part.id
  const state = recordField(part, "state")
  const status = state ? stringField(state, "status") : undefined

  return {
    key: `tool:${part.id}`,
    kind: "tool",
    label: tool,
    id: callID,
    detail: status ?? "",
    status,
    createdAt: message.info.time.created,
    tokens: toolTokens(part),
    json: part,
    nested: true,
  }
}

function stepRow(message: MessageWithParts, part: MessagePart): DevToolsContextRow | undefined {
  if (part.type !== STEP_FINISH_PART_TYPE) return undefined
  if (!isRecord(part)) return undefined

  const reason = stringField(part, "reason")
  return {
    key: `step:${part.id}`,
    kind: "step",
    label: part.id,
    id: part.id,
    detail: reason ?? "",
    status: reason,
    createdAt: message.info.time.created,
    tokens: stepTokens(part),
    json: part,
    nested: true,
  }
}

function verboseRowsForMessage(message: MessageWithParts) {
  const rows: DevToolsContextRow[] = [messageRow(message)]
  for (const part of message.parts) {
    const tool = toolRow(message, part)
    if (tool) rows.push(tool)

    const step = stepRow(message, part)
    if (step) rows.push(step)
  }
  return rows
}

export function createDevToolsContextRows(input: {
  messages: MessageWithParts[]
  verbose: boolean
}) {
  if (!input.verbose) return input.messages.map(messageRow)
  return input.messages.flatMap(verboseRowsForMessage)
}
