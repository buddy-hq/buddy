import type { MessageInfo, MessageWithParts } from "@/state/chat-types"

import { parseTJsonObject, parseTString } from "../tools/types"

const MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_mermaid_auto_repair_"
const SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_svg_auto_repair_"

export function isSvgAutoRepairMessageID<TValue>(value: TValue): boolean {
  const text = parseTString(value)
  return text !== undefined && text.startsWith(SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX)
}

export function isSvgAutoRepairAssistantMessage(message: MessageInfo | undefined): boolean {
  return message?.role === "assistant" && isSvgAutoRepairMessageID(message.parentID)
}

function messageMetadata(message: MessageWithParts) {
  if (!("metadata" in message.info)) {
    return undefined
  }
  return parseTJsonObject(message.info.metadata)
}

export function isHiddenFromUserMessage(message: MessageWithParts): boolean {
  return (
    message.info.role === "user" &&
    (messageMetadata(message)?.hiddenFromUser === true ||
      message.info.id.startsWith(MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX) ||
      isSvgAutoRepairMessageID(message.info.id))
  )
}
