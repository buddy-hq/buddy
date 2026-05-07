import type { MessageInfo, MessagePart, MessageWithParts } from "./chat-types"

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
    case "workspace-file-reference":
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
  parts[partIndex] = incoming
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
  const currentFieldValue = part[input.field]
  if (typeof currentFieldValue !== "string") {
    return current
  }

  const parts = [...message.parts]
  parts[partIndex] = {
    ...part,
    [input.field]: currentFieldValue + input.delta,
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
