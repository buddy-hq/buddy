import type { MessageInfo, MessagePart, MessageWithParts, TRecord } from "./chat-types"
import { isRecord, parseString, parseStringArray } from "./chat-types"
import { readerTextAnchorEquals } from "@buddy/reader-contract"
import {
  OPENCODE_REFERENCE_PART_TYPE,
  NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
  readPromptReaderTextAnchor,
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

function readString(record: TRecord, key: string) {
  return parseString(record[key])
}

function readStringArray(record: TRecord, key: string) {
  return parseStringArray(record[key])
}

function readBuddyPromptPartMetadata(part: MessagePart): TRecord | undefined {
  if (part.type !== "text" || !isRecord(part.metadata)) return undefined
  const metadata = part.metadata.buddyPromptPart
  return isRecord(metadata) ? metadata : undefined
}

function optionalStringFieldMatches(existing: MessagePart, metadata: TRecord, key: string) {
  const metadataValue = readString(metadata, key)
  return metadataValue === undefined || existing[key] === metadataValue
}

function optionalStringArrayFieldMatches(existing: MessagePart, metadata: TRecord, key: string) {
  const metadataValue = readStringArray(metadata, key)
  if (metadataValue === undefined) return true
  const existingValue = existing[key]
  const existingArray = parseStringArray(existingValue)
  return (
    existingArray !== undefined &&
    existingArray.length === metadataValue.length &&
    existingArray.every((entry, index) => entry === metadataValue[index])
  )
}

function hasReaderTextAnchorInput(value: TRecord): boolean {
  return value.anchor !== undefined || value.cfi !== undefined
}

function optionalReaderTextAnchorMatches(existing: MessagePart, metadata: TRecord): boolean {
  if (!hasReaderTextAnchorInput(metadata)) return true
  const existingAnchor = readPromptReaderTextAnchor(existing)
  const metadataAnchor = readPromptReaderTextAnchor(metadata)
  return Boolean(
    existingAnchor && metadataAnchor && readerTextAnchorEquals(existingAnchor, metadataAnchor),
  )
}

function readerTextAnchorsMatch(left: MessagePart, right: MessagePart): boolean {
  const leftAnchor = readPromptReaderTextAnchor(left)
  const rightAnchor = readPromptReaderTextAnchor(right)
  if (!leftAnchor || !rightAnchor) return leftAnchor === rightAnchor
  return readerTextAnchorEquals(leftAnchor, rightAnchor)
}

function promptSelectionMetadataMatches(existing: MessagePart, metadata: TRecord) {
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
    optionalReaderTextAnchorMatches(existing, metadata) &&
    optionalStringFieldMatches(existing, metadata, "tocLabel") &&
    optionalStringFieldMatches(existing, metadata, "pageLabel") &&
    optionalStringFieldMatches(existing, metadata, "locationLabel")
  )
}

function promptNativeResourceMetadataMatches(existing: MessagePart, metadata: TRecord) {
  return (
    existing.type === NATIVE_RESOURCE_ATTACHMENT_PART_TYPE &&
    metadata.type === NATIVE_RESOURCE_ATTACHMENT_PART_TYPE &&
    existing.filename === metadata.filename &&
    existing.sourcePath === metadata.sourcePath &&
    existing.format === metadata.format &&
    existing.alias === metadata.alias &&
    existing.mime === metadata.mime
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
    readerTextAnchorsMatch(existing, incoming) &&
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
      if (existing.type === NATIVE_RESOURCE_ATTACHMENT_PART_TYPE) {
        const metadata = readBuddyPromptPartMetadata(incoming)
        return metadata ? promptNativeResourceMetadataMatches(existing, metadata) : false
      }
      if (
        (existing.type === "reading-selection" || existing.type === SELECTION_CONTEXT_PART_TYPE) &&
        parseString(existing.text) !== undefined
      ) {
        const metadata = readBuddyPromptPartMetadata(incoming)
        return metadata ? promptSelectionMetadataMatches(existing, metadata) : false
      }
      if (existing.type !== incoming.type) {
        return false
      }
      return parseString(existing.text) !== undefined && existing.text === incoming.text
    case "file":
      if (
        existing.type === WORKSPACE_FILE_REFERENCE_PART_TYPE &&
        parseString(existing.path) !== undefined &&
        parseString(incoming.filename) !== undefined
      ) {
        return existing.path === incoming.filename
      }
      if (
        existing.type === OPENCODE_REFERENCE_PART_TYPE &&
        parseString(existing.name) !== undefined &&
        parseString(incoming.filename) !== undefined
      ) {
        return existing.name === incoming.filename
      }
      if (existing.type !== incoming.type) {
        return false
      }
      return (
        parseString(existing.mime) !== undefined &&
        parseString(existing.url) !== undefined &&
        parseString(existing.filename) !== undefined &&
        existing.mime === incoming.mime &&
        existing.url === incoming.url &&
        existing.filename === incoming.filename
      )
    case "agent":
      if (existing.type !== incoming.type) {
        return false
      }
      return parseString(existing.name) !== undefined && existing.name === incoming.name
    case WORKSPACE_FILE_REFERENCE_PART_TYPE:
      if (existing.type !== incoming.type) {
        return false
      }
      return parseString(existing.path) !== undefined && existing.path === incoming.path
    case OPENCODE_REFERENCE_PART_TYPE:
      if (existing.type !== incoming.type) {
        return false
      }
      return (
        parseString(existing.name) !== undefined &&
        parseString(existing.path) !== undefined &&
        existing.name === incoming.name &&
        existing.path === incoming.path
      )
    case "resource-reference":
      if (existing.type !== incoming.type) {
        return false
      }
      return parseString(existing.key) !== undefined && existing.key === incoming.key
    case "reading-selection":
    case SELECTION_CONTEXT_PART_TYPE:
      return promptSelectionPartsMatch(existing, incoming)
    case NATIVE_RESOURCE_ATTACHMENT_PART_TYPE:
      return (
        existing.type === incoming.type &&
        existing.filename === incoming.filename &&
        existing.sourcePath === incoming.sourcePath &&
        existing.format === incoming.format &&
        existing.alias === incoming.alias &&
        existing.mime === incoming.mime
      )
    default:
      return false
  }
}

function shouldPreserveStreamingRawState(state: TRecord) {
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
