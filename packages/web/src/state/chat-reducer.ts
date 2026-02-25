import type { MessageInfo, MessagePart, MessageWithParts } from "./chat-types"

function isAssistantMessage(
  message: MessageWithParts,
): message is MessageWithParts & { info: Extract<MessageInfo, { role: "assistant" }> } {
  return message.info.role === "assistant"
}

export function inferBusyFromMessages(messages: MessageWithParts[]) {
  const assistantMessages = messages.filter(isAssistantMessage)
  const lastAssistant = assistantMessages.at(-1)
  if (!lastAssistant) return false
  return !lastAssistant.info.finish
}

export function upsertMessage(current: MessageWithParts[], incoming: MessageInfo) {
  const index = current.findIndex((entry) => entry.info.id === incoming.id)
  if (index === -1) {
    return [...current, { info: incoming, parts: [] }]
  }

  const next = [...current]
  next[index] = {
    ...next[index],
    info: incoming,
  }
  return next
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
    next[index] = {
      ...message,
      parts: [...message.parts, incoming],
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
