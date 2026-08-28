import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import { parseTJsonObject, parseTString, type TJsonObject } from "@/components/chat/tools/types"

export type DevToolsContextBreakdownKey = "system" | "user" | "assistant" | "tool" | "other"

export type DevToolsContextBreakdownSegment = {
  key: DevToolsContextBreakdownKey
  tokens: number
  width: number
  percent: number
}

const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 4
const TOOL_INPUT_KEY_ESTIMATE_CHARS = 16
const PERCENT_LABEL_PRECISION = 10
const EMPTY_BREAKDOWN: DevToolsContextBreakdownSegment[] = []

const TEXT_PART_TYPE = "text"
const FILE_PART_TYPE = "file"
const AGENT_PART_TYPE = "agent"
const REASONING_PART_TYPE = "reasoning"
const TOOL_PART_TYPE = "tool"

const TOOL_STATUS_PENDING = "pending"
const TOOL_STATUS_COMPLETED = "completed"
const TOOL_STATUS_ERROR = "error"

function stringField(value: TJsonObject, key: string) {
  return parseTString(value[key])
}

function recordField(value: TJsonObject, key: string) {
  return parseTJsonObject(value[key])
}

export function estimateDevToolsTokensFromCharacters(chars: number) {
  return Math.ceil(chars / TOKEN_ESTIMATE_CHARS_PER_TOKEN)
}

export function estimateDevToolsTokensFromText(text: string) {
  return estimateDevToolsTokensFromCharacters(text.length)
}

export function estimateDevToolsTokensFromUnknown<TValue>(value: TValue) {
  if (value === undefined || value === null) return undefined
  const text = parseTString(value)
  if (text !== undefined) return estimateDevToolsTokensFromText(text)

  try {
    return estimateDevToolsTokensFromText(JSON.stringify(value))
  } catch {
    return undefined
  }
}

function percent(tokens: number, input: number) {
  return (tokens / input) * 100
}

function percentLabel(tokens: number, input: number) {
  return Math.round(percent(tokens, input) * PERCENT_LABEL_PRECISION) / PERCENT_LABEL_PRECISION
}

function fileSourceTextLength(part: TJsonObject) {
  const source = recordField(part, "source")
  const text = source ? recordField(source, "text") : undefined
  const value = text ? stringField(text, "value") : undefined
  return value?.length ?? 0
}

function agentSourceLength(part: TJsonObject) {
  const source = recordField(part, "source")
  const value = source ? stringField(source, "value") : undefined
  return value?.length ?? 0
}

function userPartChars(part: MessagePart) {
  if (part.type === TEXT_PART_TYPE) {
    return parseTString(part.text)?.length ?? 0
  }
  const record = parseTJsonObject(part)
  if (!record) return 0
  if (part.type === FILE_PART_TYPE) return fileSourceTextLength(record)
  if (part.type === AGENT_PART_TYPE) return agentSourceLength(record)
  return 0
}

function toolPartChars(part: TJsonObject) {
  const state = recordField(part, "state")
  if (!state) return { assistant: 0, tool: 0 }

  const input = recordField(state, "input")
  const inputChars = input ? Object.keys(input).length * TOOL_INPUT_KEY_ESTIMATE_CHARS : 0
  const status = stringField(state, "status")

  if (status === TOOL_STATUS_PENDING) {
    return { assistant: 0, tool: inputChars + (stringField(state, "raw")?.length ?? 0) }
  }
  if (status === TOOL_STATUS_COMPLETED) {
    return { assistant: 0, tool: inputChars + (stringField(state, "output")?.length ?? 0) }
  }
  if (status === TOOL_STATUS_ERROR) {
    return { assistant: 0, tool: inputChars + (stringField(state, "error")?.length ?? 0) }
  }
  return { assistant: 0, tool: inputChars }
}

function assistantPartChars(part: MessagePart) {
  if (part.type === TEXT_PART_TYPE || part.type === REASONING_PART_TYPE) {
    return {
      assistant: parseTString(part.text)?.length ?? 0,
      tool: 0,
    }
  }
  const record = parseTJsonObject(part)
  if (!record) return { assistant: 0, tool: 0 }
  if (part.type !== TOOL_PART_TYPE) return { assistant: 0, tool: 0 }
  return toolPartChars(record)
}

function buildSegments(
  tokens: {
    system: number
    user: number
    assistant: number
    tool: number
    other: number
  },
  input: number,
) {
  const items: { key: DevToolsContextBreakdownKey; tokens: number }[] = [
    { key: "system", tokens: tokens.system },
    { key: "user", tokens: tokens.user },
    { key: "assistant", tokens: tokens.assistant },
    { key: "tool", tokens: tokens.tool },
    { key: "other", tokens: tokens.other },
  ]

  return items
    .filter((item) => item.tokens > 0)
    .map((item) => ({
      key: item.key,
      tokens: item.tokens,
      width: percent(item.tokens, input),
      percent: percentLabel(item.tokens, input),
    }))
}

export function estimateDevToolsContextBreakdown(input: {
  messages: MessageWithParts[]
  inputTokens: number | undefined
  systemPrompt?: string
}) {
  const inputTokens = input.inputTokens ?? 0
  if (inputTokens <= 0) return EMPTY_BREAKDOWN

  const counts = {
    system: input.systemPrompt?.length ?? 0,
    user: 0,
    assistant: 0,
    tool: 0,
  }

  for (const message of input.messages) {
    if (message.info.role === "user") {
      counts.user += message.parts.reduce((sum, part) => sum + userPartChars(part), 0)
      continue
    }

    if (message.info.role !== "assistant") continue

    for (const part of message.parts) {
      const next = assistantPartChars(part)
      counts.assistant += next.assistant
      counts.tool += next.tool
    }
  }

  const tokens = {
    system: estimateDevToolsTokensFromCharacters(counts.system),
    user: estimateDevToolsTokensFromCharacters(counts.user),
    assistant: estimateDevToolsTokensFromCharacters(counts.assistant),
    tool: estimateDevToolsTokensFromCharacters(counts.tool),
  }
  const estimated = tokens.system + tokens.user + tokens.assistant + tokens.tool

  if (estimated <= inputTokens) {
    return buildSegments({ ...tokens, other: inputTokens - estimated }, inputTokens)
  }

  const scale = inputTokens / estimated
  const scaled = {
    system: Math.floor(tokens.system * scale),
    user: Math.floor(tokens.user * scale),
    assistant: Math.floor(tokens.assistant * scale),
    tool: Math.floor(tokens.tool * scale),
  }
  const scaledTotal = scaled.system + scaled.user + scaled.assistant + scaled.tool
  return buildSegments({ ...scaled, other: Math.max(0, inputTokens - scaledTotal) }, inputTokens)
}
