import type { MessageInfo, MessagePart, MessageWithParts } from "./chat-types"
import { WORKSPACE_FILE_REFERENCE_PART_TYPE } from "../components/prompt/prompt-types"
import {
  STREAMING_PART_RAW_FIELD,
  TOOL_PART_TYPE,
  TOOL_STATE_PENDING_STATUS,
  TOOL_STATE_RUNNING_STATUS,
} from "./chat-stream-event-buffer"

function isAssistantMessage(
  message: MessageWithParts,
): message is MessageWithParts & { info: Extract<MessageInfo, { role: "assistant" }> } {
  return message.info.role === "assistant"
}

export function inferBusyFromMessages(messages: MessageWithParts[]) {
  if (!Array.isArray(messages)) {
    return false
  }

  const assistantMessages = messages.filter(isAssistantMessage)
  const lastAssistant = assistantMessages[assistantMessages.length - 1]
  if (!lastAssistant) return false

  if (lastAssistant.info.error) return false
  if (lastAssistant.info.time?.completed) return false

  return !lastAssistant.info.finish
}

export function upsertMessage(current: MessageWithParts[], incoming: MessageInfo) {
  const index = current.findIndex((entry) => entry.info.id === incoming.id)
  if (index === -1) {
    const insertIndex = current.findIndex((entry) => entry.info.id > incoming.id)
    const nextMessage = { info: incoming, parts: [] }
    if (insertIndex === -1) {
      return [...current, nextMessage]
    }
    return [...current.slice(0, insertIndex), nextMessage, ...current.slice(insertIndex)]
  }

  const next = [...current]
  next[index] = {
    ...next[index],
    info: incoming,
  }
  return next
}

function shouldReplaceOptimisticPart(existing: MessagePart, incoming: MessagePart) {
  if (existing.optimistic !== true || incoming.optimistic === true) {
    return false
  }

  switch (incoming.type) {
    case "text":
      if (
        existing.type === "reading-selection" &&
        typeof existing.text === "string" &&
        typeof incoming.metadata === "object" &&
        incoming.metadata !== null &&
        "buddyPromptPart" in incoming.metadata
      ) {
        const metadata = incoming.metadata.buddyPromptPart
        if (
          typeof metadata !== "object" ||
          metadata === null ||
          !("type" in metadata) ||
          metadata.type !== "reading-selection" ||
          !("text" in metadata) ||
          metadata.text !== existing.text
        ) {
          return false
        }

        const metadataCfi =
          "cfi" in metadata && typeof metadata.cfi === "string" ? metadata.cfi : undefined
        const metadataIndex =
          "index" in metadata && typeof metadata.index === "number" ? metadata.index : undefined

        if (metadataCfi !== undefined && existing.cfi !== metadataCfi) {
          return false
        }
        if (metadataIndex !== undefined && existing.index !== metadataIndex) {
          return false
        }

        return true
      }
      if (existing.type !== incoming.type) {
        return false
      }
      return typeof existing.text === "string" && existing.text === incoming.text
    case "file":
      if (
        existing.type === WORKSPACE_FILE_REFERENCE_PART_TYPE &&
        typeof existing.path === "string" &&
        typeof incoming.filename === "string"
      ) {
        return existing.path === incoming.filename
      }
      if (existing.type !== incoming.type) {
        return false
      }
      return (
        typeof existing.mime === "string" &&
        typeof existing.url === "string" &&
        typeof existing.filename === "string" &&
        existing.mime === incoming.mime &&
        existing.url === incoming.url &&
        existing.filename === incoming.filename
      )
    case "agent":
      if (existing.type !== incoming.type) {
        return false
      }
      return typeof existing.name === "string" && existing.name === incoming.name
    case WORKSPACE_FILE_REFERENCE_PART_TYPE:
      if (existing.type !== incoming.type) {
        return false
      }
      return typeof existing.path === "string" && existing.path === incoming.path
    case "resource-reference":
      if (existing.type !== incoming.type) {
        return false
      }
      return typeof existing.key === "string" && existing.key === incoming.key
    case "reading-selection":
      if (existing.type !== incoming.type) {
        return false
      }
      return (
        typeof existing.text === "string" &&
        existing.text === incoming.text &&
        existing.cfi === incoming.cfi &&
        existing.index === incoming.index
      )
    default:
      return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

function shouldPreserveStreamingRawState(state: Record<string, unknown>) {
  const status = readString(state, "status")
  return status === TOOL_STATE_PENDING_STATUS || status === TOOL_STATE_RUNNING_STATUS
}

function reconcileStreamingRawState(existingRaw: string, incomingRaw: string | undefined) {
  if (incomingRaw === undefined) return existingRaw
  if (existingRaw.startsWith(incomingRaw)) return existingRaw
  if (incomingRaw.startsWith(existingRaw)) return incomingRaw
  return incomingRaw
}

export function preserveStreamingRawState(existing: MessagePart, incoming: MessagePart) {
  if (incoming.type !== TOOL_PART_TYPE) return incoming

  const incomingState = incoming.state
  if (!isRecord(incomingState)) return incoming
  if (!shouldPreserveStreamingRawState(incomingState)) return incoming

  const existingState = existing.state
  if (!isRecord(existingState)) return incoming

  const existingRaw = readString(existingState, "raw")
  if (existingRaw === undefined) return incoming

  const incomingRaw = readString(incomingState, "raw")
  const raw = reconcileStreamingRawState(existingRaw, incomingRaw)
  if (raw === incomingRaw) return incoming

  return {
    ...incoming,
    state: {
      ...incomingState,
      raw,
    },
  }
}

export function upsertPart(current: MessageWithParts[], incoming: MessagePart) {
  const index = current.findIndex((entry) => entry.info.id === incoming.messageID)
  if (index === -1) {
    return current
  }

  const next = [...current]
  const message = next[index]
  const partIndex = message.parts.findIndex((part) => part.id === incoming.id)
  if (partIndex === -1) {
    const partsWithoutReplacedOptimistic = message.parts.filter(
      (part) => !shouldReplaceOptimisticPart(part, incoming),
    )
    const insertIndex = partsWithoutReplacedOptimistic.findIndex((part) => part.id > incoming.id)
    const nextParts =
      insertIndex === -1
        ? [...partsWithoutReplacedOptimistic, incoming]
        : [
            ...partsWithoutReplacedOptimistic.slice(0, insertIndex),
            incoming,
            ...partsWithoutReplacedOptimistic.slice(insertIndex),
          ]
    next[index] = {
      ...message,
      parts: nextParts,
    }
    return next
  }

  const parts = [...message.parts]
  parts[partIndex] = preserveStreamingRawState(parts[partIndex], incoming)
  next[index] = {
    ...message,
    parts,
  }
  return next
}

export function appendPartDelta(
  current: MessageWithParts[],
  input: { messageID: string; partID: string; field: string; delta: string },
) {
  const messageIndex = current.findIndex((entry) => entry.info.id === input.messageID)
  if (messageIndex === -1) {
    return current
  }

  const next = [...current]
  const message = next[messageIndex]
  const partIndex = message.parts.findIndex((part) => part.id === input.partID)
  if (partIndex === -1) {
    return current
  }

  const part = message.parts[partIndex]
  const parts = [...message.parts]
  if (input.field === STREAMING_PART_RAW_FIELD) {
    const state = part.state
    if (!state || typeof state !== "object" || Array.isArray(state) || !("raw" in state)) {
      return current
    }
    if (typeof state.raw !== "string") return current
    parts[partIndex] = {
      ...part,
      state: {
        ...state,
        raw: state.raw + input.delta,
      },
    }
  } else {
    const currentFieldValue = part[input.field]
    if (typeof currentFieldValue !== "string") {
      return current
    }
    parts[partIndex] = {
      ...part,
      [input.field]: currentFieldValue + input.delta,
    }
  }
  next[messageIndex] = {
    ...message,
    parts,
  }
  return next
}

export function removeMessage(current: MessageWithParts[], messageID: string) {
  const index = current.findIndex((entry) => entry.info.id === messageID)
  if (index === -1) {
    return current
  }

  const next = [...current]
  next.splice(index, 1)
  return next
}

export function removePart(
  current: MessageWithParts[],
  input: { messageID: string; partID: string },
) {
  const messageIndex = current.findIndex((entry) => entry.info.id === input.messageID)
  if (messageIndex === -1) {
    return current
  }

  const message = current[messageIndex]
  const partIndex = message.parts.findIndex((part) => part.id === input.partID)
  if (partIndex === -1) {
    return current
  }

  const next = [...current]
  const parts = [...message.parts]
  parts.splice(partIndex, 1)
  next[messageIndex] = {
    ...message,
    parts,
  }
  return next
}
