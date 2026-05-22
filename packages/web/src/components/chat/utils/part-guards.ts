import type { MessagePart } from "@/state/chat-types"
import {
  READING_SELECTION_PART_TYPE,
  readPromptReadingSelectionMetadata,
} from "@/components/prompt/prompt-types"

export type ChatFilePart = MessagePart & {
  type: "file"
  mime: string
  url: string
  filename?: string
}
export type ChatAgentPart = MessagePart & {
  type: "agent"
  name: string
}
export type ChatTextPart = MessagePart & {
  type: "text"
  text: string
}
export type ChatReasoningPart = MessagePart & {
  type: "reasoning"
  text: string
}
export type ChatToolPart = MessagePart & {
  type: "tool"
  callID?: string
  tool: string
  state?: unknown
  metadata?: unknown
}
export type ChatReadingSelectionPart = MessagePart & {
  type: typeof READING_SELECTION_PART_TYPE
  text: string
  resourceKey?: string
  cfi?: string
  index?: number
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export function isChatFilePart(part: MessagePart): part is ChatFilePart {
  return part.type === "file" && typeof part.mime === "string" && typeof part.url === "string"
}

export function isChatAgentPart(part: MessagePart): part is ChatAgentPart {
  return part.type === "agent" && typeof part.name === "string"
}

export function isChatTextPart(part: MessagePart): part is ChatTextPart {
  return part.type === "text" && typeof part.text === "string"
}

export function isChatReasoningPart(part: MessagePart): part is ChatReasoningPart {
  return part.type === "reasoning" && typeof part.text === "string"
}

export function isChatToolPart(part: MessagePart): part is ChatToolPart {
  return part.type === "tool" && typeof part.tool === "string"
}

export function isChatReadingSelectionPart(part: MessagePart): part is ChatReadingSelectionPart {
  return part.type === READING_SELECTION_PART_TYPE && typeof part.text === "string"
}

export function readChatReadingSelectionPart(
  part: MessagePart,
): ChatReadingSelectionPart | undefined {
  if (isChatReadingSelectionPart(part)) {
    return part
  }

  const metadataPart = readPromptReadingSelectionMetadata(part.metadata)
  if (!metadataPart) {
    return undefined
  }

  return {
    ...part,
    ...metadataPart,
  }
}
