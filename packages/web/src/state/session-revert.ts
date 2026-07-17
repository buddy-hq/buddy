import type { MessageWithParts } from "./chat-types"

type TranscriptSnapshot = {
  messages: MessageWithParts[]
  complete: boolean
  cursor: string | undefined
}

function latestVisibleUserMessageID(
  messages: MessageWithParts[],
  revertMessageID: string | undefined,
) {
  return messages.findLast(
    (message) =>
      message.info.role === "user" &&
      (revertMessageID === undefined || message.info.id < revertMessageID),
  )?.info.id
}

export async function resolveUndoTargetMessageID(input: {
  explicitMessageID?: string
  revertMessageID: string | undefined
  readTranscript: () => TranscriptSnapshot
  loadOlder: () => Promise<void>
}) {
  if (input.explicitMessageID) return input.explicitMessageID

  while (true) {
    const snapshot = input.readTranscript()
    const messageID = latestVisibleUserMessageID(snapshot.messages, input.revertMessageID)
    if (messageID) return messageID
    if (snapshot.complete || !snapshot.cursor) return undefined

    await input.loadOlder()

    const next = input.readTranscript()
    if (next.cursor === snapshot.cursor && next.messages.length === snapshot.messages.length) {
      return undefined
    }
  }
}

export async function resolveRedoTargetMessageID(input: {
  revertMessageID: string
  readTranscript: () => TranscriptSnapshot
  loadOlder: () => Promise<void>
}) {
  while (true) {
    const snapshot = input.readTranscript()
    const oldestMessageID = snapshot.messages[0]?.info.id
    const hasBoundaryCoverage =
      snapshot.complete ||
      (oldestMessageID !== undefined && oldestMessageID <= input.revertMessageID)

    if (hasBoundaryCoverage) {
      return snapshot.messages.find(
        (message) =>
          message.info.role === "user" && message.info.id > input.revertMessageID,
      )?.info.id
    }
    if (!snapshot.cursor) return undefined

    await input.loadOlder()

    const next = input.readTranscript()
    if (next.cursor === snapshot.cursor && next.messages.length === snapshot.messages.length) {
      return undefined
    }
  }
}
