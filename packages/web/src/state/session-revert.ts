import type { MessageWithParts } from "./chat-types"
import { compareMessages } from "./transcript-repository"

type TranscriptSnapshot = {
  messages: MessageWithParts[]
  complete: boolean
  cursor: string | undefined
}

function findRevertBoundary(messages: readonly MessageWithParts[], revertMessageID: string) {
  return messages.find((message) => message.info.id === revertMessageID)?.info
}

export function createBeforeRevertFilter(input: {
  messages: readonly MessageWithParts[]
  revertMessageID?: string
  transcriptComplete: boolean
}): (message: MessageWithParts) => boolean {
  const revertMessageID = input.revertMessageID
  if (!revertMessageID) return () => true
  const boundary = findRevertBoundary(input.messages, revertMessageID)
  if (boundary) return (message) => compareMessages(message.info, boundary) < 0
  const transcriptComplete = input.transcriptComplete
  return () => transcriptComplete
}

function latestVisibleUserMessageID(
  snapshot: TranscriptSnapshot,
  revertMessageID: string | undefined,
) {
  const isBeforeRevert = createBeforeRevertFilter({
    messages: snapshot.messages,
    revertMessageID,
    transcriptComplete: snapshot.complete,
  })
  return snapshot.messages.findLast(
    (message) => message.info.role === "user" && isBeforeRevert(message),
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
    const messageID = latestVisibleUserMessageID(snapshot, input.revertMessageID)
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
    const boundary = findRevertBoundary(snapshot.messages, input.revertMessageID)

    if (boundary) {
      return snapshot.messages.find(
        (message) => message.info.role === "user" && compareMessages(message.info, boundary) > 0,
      )?.info.id
    }
    if (snapshot.complete || !snapshot.cursor) return undefined

    await input.loadOlder()

    const next = input.readTranscript()
    if (next.cursor === snapshot.cursor && next.messages.length === snapshot.messages.length) {
      return undefined
    }
  }
}
