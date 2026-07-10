import type { MessageInfo, MessagePart, MessageWithParts } from "./chat-types"
import {
  OPENCODE_REFERENCE_PART_TYPE,
  SELECTION_CONTEXT_PART_TYPE,
  WORKSPACE_FILE_REFERENCE_PART_TYPE,
} from "../components/prompt/prompt-types"
import {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === "number" ? value : undefined
}

function readStringArray(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (!Array.isArray(value)) return undefined
  return value.every((entry) => typeof entry === "string") ? value : undefined
}

function readBuddyPromptPartMetadata(part: MessagePart): Record<string, unknown> | undefined {
  if (part.type !== "text" || !isRecord(part.metadata)) return undefined
  const metadata = part.metadata.buddyPromptPart
  return isRecord(metadata) ? metadata : undefined
}

function optionalStringFieldMatches(
  existing: MessagePart,
  metadata: Record<string, unknown>,
  key: string,
) {
  const metadataValue = readString(metadata, key)
  return metadataValue === undefined || existing[key] === metadataValue
}

function optionalNumberFieldMatches(
  existing: MessagePart,
  metadata: Record<string, unknown>,
  key: string,
) {
  const metadataValue = readNumber(metadata, key)
  return metadataValue === undefined || existing[key] === metadataValue
}

function optionalStringArrayFieldMatches(
  existing: MessagePart,
  metadata: Record<string, unknown>,
  key: string,
) {
  const metadataValue = readStringArray(metadata, key)
  if (metadataValue === undefined) return true
  const existingValue = existing[key]
  return (
    Array.isArray(existingValue) &&
    existingValue.length === metadataValue.length &&
    existingValue.every(
      (entry, index) => typeof entry === "string" && entry === metadataValue[index],
    )
  )
}

function promptSelectionMetadataMatches(existing: MessagePart, metadata: Record<string, unknown>) {
  if (metadata.type !== existing.type) return false
  if (metadata.type !== "reading-selection" && metadata.type !== SELECTION_CONTEXT_PART_TYPE) {
    return false
  }
  if (metadata.text !== existing.text) return false

  if (metadata.type === SELECTION_CONTEXT_PART_TYPE) {
    if (!optionalStringFieldMatches(existing, metadata, "source")) return false
    if (!optionalStringFieldMatches(existing, metadata, "path")) return false
    if (!optionalStringFieldMatches(existing, metadata, "version")) return false
    if (!optionalStringArrayFieldMatches(existing, metadata, "headingPath")) return false
  }

  return (
    optionalStringFieldMatches(existing, metadata, "selectionKey") &&
    optionalStringFieldMatches(existing, metadata, "resourceKey") &&
    optionalStringFieldMatches(existing, metadata, "cfi") &&
    optionalNumberFieldMatches(existing, metadata, "index") &&
    optionalStringFieldMatches(existing, metadata, "tocLabel") &&
    optionalStringFieldMatches(existing, metadata, "pageLabel") &&
    optionalStringFieldMatches(existing, metadata, "locationLabel")
  )
}

function promptSelectionPartsMatch(existing: MessagePart, incoming: MessagePart) {
  if (existing.type !== incoming.type) return false
  if (existing.text !== incoming.text) return false
  if (existing.type === SELECTION_CONTEXT_PART_TYPE && existing.source !== incoming.source) {
    return false
  }

  return (
    existing.selectionKey === incoming.selectionKey &&
    existing.path === incoming.path &&
    existing.version === incoming.version &&
    existing.resourceKey === incoming.resourceKey &&
    existing.cfi === incoming.cfi &&
    existing.index === incoming.index &&
    existing.tocLabel === incoming.tocLabel &&
    existing.pageLabel === incoming.pageLabel &&
    existing.locationLabel === incoming.locationLabel &&
    optionalStringArrayFieldMatches(existing, incoming, "headingPath")
  )
}

function shouldReplaceOptimisticPart(existing: MessagePart, incoming: MessagePart) {
  if (existing.optimistic !== true || incoming.optimistic === true) {
    return false
  }

  switch (incoming.type) {
    case "text":
      if (
        (existing.type === "reading-selection" || existing.type === SELECTION_CONTEXT_PART_TYPE) &&
        typeof existing.text === "string"
      ) {
        const metadata = readBuddyPromptPartMetadata(incoming)
        return metadata ? promptSelectionMetadataMatches(existing, metadata) : false
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
      if (
        existing.type === OPENCODE_REFERENCE_PART_TYPE &&
        typeof existing.name === "string" &&
        typeof incoming.filename === "string"
      ) {
        return existing.name === incoming.filename
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
    case OPENCODE_REFERENCE_PART_TYPE:
      if (existing.type !== incoming.type) {
        return false
      }
      return (
        typeof existing.name === "string" &&
        typeof existing.path === "string" &&
        existing.name === incoming.name &&
        existing.path === incoming.path
      )
    case "resource-reference":
      if (existing.type !== incoming.type) {
        return false
      }
      return typeof existing.key === "string" && existing.key === incoming.key
    case "reading-selection":
    case SELECTION_CONTEXT_PART_TYPE:
      return promptSelectionPartsMatch(existing, incoming)
    default:
      return false
  }
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

export function upsertMessagePart(current: MessagePart[], incoming: MessagePart) {
  const partIndex = current.findIndex((part) => part.id === incoming.id)
  if (partIndex === -1) {
    const partsWithoutReplacedOptimistic = current.filter(
      (part) => !shouldReplaceOptimisticPart(part, incoming),
    )
    const insertIndex = partsWithoutReplacedOptimistic.findIndex((part) => part.id > incoming.id)
    return insertIndex === -1
      ? [...partsWithoutReplacedOptimistic, incoming]
      : [
          ...partsWithoutReplacedOptimistic.slice(0, insertIndex),
          incoming,
          ...partsWithoutReplacedOptimistic.slice(insertIndex),
        ]
  }

  const parts = [...current]
  parts[partIndex] = preserveStreamingRawState(parts[partIndex], incoming)
  return parts
}
