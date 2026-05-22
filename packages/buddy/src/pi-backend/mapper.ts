import { createHash } from "node:crypto"
import type { SessionInfo as PiStoredSessionInfo } from "@earendil-works/pi-coding-agent"
import type {
  BuddyAssistantMessageInfo,
  BuddyMessageModel,
  BuddyMessagePart,
  BuddyMessageWithParts,
  BuddySessionInfo,
  BuddyToolPart,
  BuddyToolPartState,
  BuddyUserMessageInfo,
  PiAgentMessage,
  PiModel,
} from "./types"
import { buddyProviderIDFromPi } from "./provider-aliases"
import { buddySessionIDFromPi } from "./session-ids"

const BUDDY_PI_AGENT_NAME = "buddy"
const BUDDY_PI_MODE = "pi"
const BUDDY_PI_VERSION = "pi"
const DEFAULT_PROVIDER_ID = "pi"
const DEFAULT_MODEL_ID = "unknown"
const DEFAULT_SESSION_TITLE_PREFIX = "New session - "
const NO_MESSAGES_PLACEHOLDER = "(no messages)"
const MESSAGE_ID_PREFIX = "msg"
const PART_ID_PREFIX = "prt"
const PROJECT_ID_PREFIX = "pi"
const ID_INDEX_RADIX = 36
const ID_INDEX_WIDTH = 6
const PROJECT_HASH_LENGTH = 16
const DATA_URL_PREFIX = "data:"
const BASE64_URL_MARKER = ";base64,"
const TEXT_JOIN_SEPARATOR = "\n"
const EMPTY_TOOL_OUTPUT = ""
const TOOL_TITLE_FALLBACK = "Tool"

type PiSessionInfoLike = Pick<
  PiStoredSessionInfo,
  "id" | "cwd" | "path" | "name" | "created" | "modified" | "firstMessage"
> & {
  parentSessionPath?: string
}

type SessionMetadata = {
  title?: string
  archived?: number
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }
}

type ToolResultDetails = {
  toolName: string
  output: string
  isError: boolean
  timestamp: number
  metadata: Record<string, unknown>
}

type MappingContext = {
  sessionID: string
  directory: string
  model?: PiModel
  variant?: string
  visibleIndex: number
  toolResults: Map<string, ToolResultDetails>
  completed?: boolean
}

function timestamp(value: Date | number | undefined, fallback: number) {
  if (value instanceof Date) return value.getTime()
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function indexKey(index: number) {
  return index.toString(ID_INDEX_RADIX).padStart(ID_INDEX_WIDTH, "0")
}

function slug(value: string) {
  const slugged = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slugged || "session"
}

function projectID(directory: string) {
  const hash = createHash("sha256").update(directory).digest("hex").slice(0, PROJECT_HASH_LENGTH)
  return `${PROJECT_ID_PREFIX}-${hash}`
}

function defaultTitle(created: Date) {
  return `${DEFAULT_SESSION_TITLE_PREFIX}${created.toISOString()}`
}

function titleForSession(session: PiSessionInfoLike, metadata?: SessionMetadata) {
  const explicitTitle = metadata?.title?.trim()
  if (explicitTitle) return explicitTitle

  const piName = session.name?.trim()
  if (piName) return piName

  const firstMessage = session.firstMessage.trim()
  if (firstMessage && firstMessage !== NO_MESSAGES_PLACEHOLDER) return firstMessage

  return defaultTitle(session.created)
}

function modelForMessage(model?: PiModel, variant?: string): BuddyMessageModel {
  return {
    providerID: model ? buddyProviderIDFromPi(model.provider) : DEFAULT_PROVIDER_ID,
    modelID: model?.id ?? DEFAULT_MODEL_ID,
    ...(variant ? { variant } : {}),
  }
}

function parentMessageID(sessionID: string, visibleIndex: number) {
  return messageIDForIndex(sessionID, Math.max(visibleIndex - 1, 0))
}

function textFromBlocks(blocks: readonly { type: string; text?: string }[]) {
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join(TEXT_JOIN_SEPARATOR)
}

function textFromMessageContent(
  content:
    | string
    | readonly {
        type: string
        text?: string
      }[],
) {
  return typeof content === "string" ? content : textFromBlocks(content)
}

function toolResultOutput(
  content: readonly {
    type: string
    text?: string
  }[],
) {
  return textFromBlocks(content)
}

function emptyTokens() {
  return {
    input: 0,
    output: 0,
    reasoning: 0,
    cache: {
      read: 0,
      write: 0,
    },
  }
}

function assistantTokens(message: Extract<PiAgentMessage, { role: "assistant" }>) {
  return {
    total: message.usage.totalTokens,
    input: message.usage.input,
    output: message.usage.output,
    reasoning: 0,
    cache: {
      read: message.usage.cacheRead,
      write: message.usage.cacheWrite,
    },
  }
}

function assistantError(message: Extract<PiAgentMessage, { role: "assistant" }>) {
  if (!message.errorMessage) return undefined
  return {
    name: "ProviderError",
    message: message.errorMessage,
  }
}

function imageDataUrl(input: { mimeType: string; data: string }) {
  return `${DATA_URL_PREFIX}${input.mimeType}${BASE64_URL_MARKER}${input.data}`
}

function rawToolInput(input: Record<string, unknown>) {
  return JSON.stringify(input)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function metadataFromToolDetails(details: unknown): Record<string, unknown> {
  return isRecord(details) ? details : {}
}

function pendingToolState(input: Record<string, unknown>): BuddyToolPartState {
  return {
    status: "pending",
    input,
    raw: rawToolInput(input),
  }
}

function completedToolState(input: {
  args: Record<string, unknown>
  result: ToolResultDetails
}): BuddyToolPartState {
  const time = {
    start: input.result.timestamp,
    end: input.result.timestamp,
  }

  if (input.result.isError) {
    return {
      status: "error",
      input: input.args,
      error: input.result.output,
      metadata: input.result.metadata,
      time,
    }
  }

  return {
    status: "completed",
    input: input.args,
    output: input.result.output,
    title: input.result.toolName || TOOL_TITLE_FALLBACK,
    metadata: input.result.metadata,
    time,
  }
}

function toolStateForCall(input: {
  args: Record<string, unknown>
  result?: ToolResultDetails
}): BuddyToolPartState {
  return input.result
    ? completedToolState({ args: input.args, result: input.result })
    : pendingToolState(input.args)
}

function mapUserMessage(
  input: MappingContext & { message: Extract<PiAgentMessage, { role: "user" }> },
) {
  const messageID = messageIDForIndex(input.sessionID, input.visibleIndex)
  const created = input.message.timestamp
  const info: BuddyUserMessageInfo = {
    id: messageID,
    sessionID: input.sessionID,
    role: "user",
    time: {
      created,
    },
    agent: BUDDY_PI_AGENT_NAME,
    model: modelForMessage(input.model, input.variant),
    tools: {},
  }
  const parts: BuddyMessagePart[] = []

  if (typeof input.message.content === "string") {
    parts.push({
      id: partIDForIndex(messageID, "text", 0),
      sessionID: input.sessionID,
      messageID,
      type: "text",
      text: input.message.content,
      time: {
        start: created,
        end: created,
      },
    })
  } else {
    input.message.content.forEach((block, contentIndex) => {
      if (block.type === "text") {
        parts.push({
          id: partIDForIndex(messageID, "text", contentIndex),
          sessionID: input.sessionID,
          messageID,
          type: "text",
          text: block.text,
          time: {
            start: created,
            end: created,
          },
        })
        return
      }

      if (block.type === "image") {
        parts.push({
          id: partIDForIndex(messageID, "file", contentIndex),
          sessionID: input.sessionID,
          messageID,
          type: "file",
          mime: block.mimeType,
          url: imageDataUrl(block),
        })
      }
    })
  }

  return {
    info,
    parts,
  } satisfies BuddyMessageWithParts
}

function mapAssistantMessage(
  input: MappingContext & { message: Extract<PiAgentMessage, { role: "assistant" }> },
) {
  const messageID = messageIDForIndex(input.sessionID, input.visibleIndex)
  const created = input.message.timestamp
  const completed = input.completed ? Date.now() : undefined
  const error = assistantError(input.message)
  const info: BuddyAssistantMessageInfo = {
    id: messageID,
    sessionID: input.sessionID,
    role: "assistant",
    time: {
      created,
      ...(completed ? { completed } : {}),
    },
    ...(error ? { error } : {}),
    parentID: parentMessageID(input.sessionID, input.visibleIndex),
    modelID: input.message.model,
    providerID: buddyProviderIDFromPi(input.message.provider),
    mode: BUDDY_PI_MODE,
    agent: BUDDY_PI_AGENT_NAME,
    path: {
      cwd: input.directory,
      root: input.directory,
    },
    cost: input.message.usage.cost.total,
    tokens: assistantTokens(input.message),
    ...(input.variant ? { variant: input.variant } : {}),
    finish: input.message.stopReason,
  }
  const parts: BuddyMessagePart[] = []

  input.message.content.forEach((block, contentIndex) => {
    if (block.type === "text") {
      parts.push({
        id: partIDForIndex(messageID, "text", contentIndex),
        sessionID: input.sessionID,
        messageID,
        type: "text",
        text: block.text,
        time: {
          start: created,
          ...(completed ? { end: completed } : {}),
        },
      })
      return
    }

    if (block.type === "thinking") {
      parts.push({
        id: partIDForIndex(messageID, "thinking", contentIndex),
        sessionID: input.sessionID,
        messageID,
        type: "reasoning",
        text: block.thinking,
        time: {
          start: created,
          ...(completed ? { end: completed } : {}),
        },
      })
      return
    }

    if (block.type === "toolCall") {
      parts.push({
        id: partIDForIndex(messageID, "tool", contentIndex),
        sessionID: input.sessionID,
        messageID,
        type: "tool",
        callID: block.id,
        tool: block.name,
        state: toolStateForCall({
          args: block.arguments,
          result: input.toolResults.get(block.id),
        }),
      })
    }
  })

  return {
    info,
    parts,
  } satisfies BuddyMessageWithParts
}

function collectToolResults(messages: readonly PiAgentMessage[]) {
  const results = new Map<string, ToolResultDetails>()
  for (const message of messages) {
    if (message.role !== "toolResult") continue
    results.set(message.toolCallId, {
      toolName: message.toolName,
      output: toolResultOutput(message.content),
      isError: message.isError,
      timestamp: message.timestamp,
      metadata: metadataFromToolDetails(message.details),
    })
  }
  return results
}

export function messageIDForIndex(sessionID: string, index: number) {
  return `${MESSAGE_ID_PREFIX}_${sessionID}_${indexKey(index)}`
}

export function partIDForIndex(messageID: string, kind: string, index: number) {
  return `${PART_ID_PREFIX}_${messageID}_${kind}_${indexKey(index)}`
}

export function isVisiblePiMessage(message: PiAgentMessage) {
  return message.role === "user" || message.role === "assistant"
}

export function mapPiSessionInfo(input: {
  directory: string
  session: PiSessionInfoLike
  metadata?: SessionMetadata
  model?: PiModel
  parentID?: string
}): BuddySessionInfo {
  const title = titleForSession(input.session, input.metadata)
  const created = timestamp(input.session.created, Date.now())
  const updated = timestamp(input.session.modified, created)

  return {
    id: buddySessionIDFromPi(input.session.id),
    slug: slug(title),
    projectID: projectID(input.directory),
    directory: input.directory,
    path: input.session.path,
    title,
    agent: BUDDY_PI_AGENT_NAME,
    ...(input.parentID ? { parentID: input.parentID } : {}),
    ...(input.model
      ? {
          model: {
            id: input.model.id,
            providerID: buddyProviderIDFromPi(input.model.provider),
          },
        }
      : {}),
    version: BUDDY_PI_VERSION,
    cost: 0,
    tokens: emptyTokens(),
    time: {
      created,
      updated,
      ...(input.metadata?.archived !== undefined ? { archived: input.metadata.archived } : {}),
    },
    ...(input.metadata?.revert ? { revert: input.metadata.revert } : {}),
  }
}

export function mapPiVisibleMessage(input: MappingContext & { message: PiAgentMessage }) {
  if (input.message.role === "user") {
    return mapUserMessage({
      ...input,
      message: input.message,
    })
  }

  if (input.message.role === "assistant") {
    return mapAssistantMessage({
      ...input,
      message: input.message,
    })
  }

  return undefined
}

export function mapPiMessagesToBuddyMessages(input: {
  sessionID: string
  directory: string
  messages: readonly PiAgentMessage[]
  model?: PiModel
  variant?: string
}) {
  const toolResults = collectToolResults(input.messages)
  const mapped: BuddyMessageWithParts[] = []
  let visibleIndex = 0

  for (const message of input.messages) {
    if (!isVisiblePiMessage(message)) continue

    const item = mapPiVisibleMessage({
      sessionID: input.sessionID,
      directory: input.directory,
      model: input.model,
      variant: input.variant,
      visibleIndex,
      toolResults,
      message,
      completed: true,
    })
    if (item) {
      mapped.push(item)
      visibleIndex += 1
    }
  }

  return mapped
}

export function textFromPromptMessage(message: PiAgentMessage) {
  if (message.role === "user") {
    return textFromMessageContent(message.content)
  }
  if (message.role === "assistant") {
    return textFromBlocks(
      message.content.map((block) =>
        block.type === "text" ? { type: block.type, text: block.text } : { type: block.type },
      ),
    )
  }
  if (message.role === "toolResult") {
    return toolResultOutput(message.content)
  }
  return EMPTY_TOOL_OUTPUT
}

function toolPartTitle(toolName: string, metadata?: Record<string, unknown>) {
  const explicitTitle = metadata?.title
  return typeof explicitTitle === "string" && explicitTitle.trim().length > 0
    ? explicitTitle
    : toolName || TOOL_TITLE_FALLBACK
}

export function runningToolPart(input: {
  sessionID: string
  messageID: string
  partID: string
  callID: string
  toolName: string
  args: Record<string, unknown>
  metadata?: Record<string, unknown>
  timestamp: number
}): BuddyToolPart {
  return {
    id: input.partID,
    sessionID: input.sessionID,
    messageID: input.messageID,
    type: "tool",
    callID: input.callID,
    tool: input.toolName,
    state: {
      status: "running",
      input: input.args,
      ...(input.metadata ? { title: toolPartTitle(input.toolName, input.metadata) } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      time: {
        start: input.timestamp,
      },
    },
  }
}

export function finishedToolPart(input: {
  sessionID: string
  messageID: string
  partID: string
  callID: string
  toolName: string
  args: Record<string, unknown>
  output: string
  isError: boolean
  metadata: Record<string, unknown>
  timestamp: number
}): BuddyToolPart {
  return {
    id: input.partID,
    sessionID: input.sessionID,
    messageID: input.messageID,
    type: "tool",
    callID: input.callID,
    tool: input.toolName,
    state: input.isError
      ? {
          status: "error",
          input: input.args,
          error: input.output,
          metadata: input.metadata,
          time: {
            start: input.timestamp,
            end: input.timestamp,
          },
        }
      : {
          status: "completed",
          input: input.args,
          output: input.output,
          title: toolPartTitle(input.toolName, input.metadata),
          metadata: input.metadata,
          time: {
            start: input.timestamp,
            end: input.timestamp,
          },
        },
  }
}
