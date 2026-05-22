import type { PiAgentMessage, PiTranscriptEntry } from "./types"

const TRANSCRIPT_MESSAGE_ID_PREFIX = "msg"
const ID_INDEX_RADIX = 36
const ID_INDEX_WIDTH = 6
const TEXT_JOIN_SEPARATOR = "\n"

function indexKey(index: number) {
  return index.toString(ID_INDEX_RADIX).padStart(ID_INDEX_WIDTH, "0")
}

export function transcriptMessageID(sessionID: string, index: number) {
  return `${TRANSCRIPT_MESSAGE_ID_PREFIX}_${sessionID}_${indexKey(index)}`
}

function textFromBlocks(blocks: readonly { type: string; text?: string; thinking?: string }[]) {
  return blocks
    .flatMap((block) => {
      if (block.type === "text" && typeof block.text === "string") {
        return [block.text]
      }
      if (block.type === "thinking" && typeof block.thinking === "string") {
        return [block.thinking]
      }
      return []
    })
    .join(TEXT_JOIN_SEPARATOR)
}

export function textFromPiTranscriptMessage(message: PiAgentMessage) {
  switch (message.role) {
    case "user":
      return typeof message.content === "string" ? message.content : textFromBlocks(message.content)
    case "assistant":
      return textFromBlocks(message.content)
    case "toolResult":
      return textFromBlocks(message.content)
    case "custom":
      return typeof message.content === "string" ? message.content : textFromBlocks(message.content)
    case "branchSummary":
      return message.summary
    case "compactionSummary":
      return message.summary
    case "bashExecution":
      return [message.command, message.output].filter((value) => value.length > 0).join("\n")
    default:
      return ""
  }
}

export function serializePiTranscriptMessages(input: {
  sessionID: string
  messages: readonly PiAgentMessage[]
}): PiTranscriptEntry[] {
  return input.messages.map((message, index) => ({
    id: transcriptMessageID(input.sessionID, index),
    sessionID: input.sessionID,
    message,
  }))
}
