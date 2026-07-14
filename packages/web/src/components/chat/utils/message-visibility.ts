import type { MessageInfo, MessageWithParts } from "@/state/chat-types"

const MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_mermaid_auto_repair_"
const SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX = "msg_buddy_svg_auto_repair_"

export function isSvgAutoRepairMessageID(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(SVG_AUTO_REPAIR_MESSAGE_ID_PREFIX)
}

export function isSvgAutoRepairAssistantMessage(message: MessageInfo | undefined): boolean {
  return message?.role === "assistant" && isSvgAutoRepairMessageID(message.parentID)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function messageMetadata(message: MessageWithParts): Record<string, unknown> | undefined {
  if (!("metadata" in message.info)) {
    return undefined
  }
  return isRecord(message.info.metadata) ? message.info.metadata : undefined
}

export function isHiddenFromUserMessage(message: MessageWithParts): boolean {
  return (
    message.info.role === "user" &&
    (messageMetadata(message)?.hiddenFromUser === true ||
      message.info.id.startsWith(MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX) ||
      isSvgAutoRepairMessageID(message.info.id))
  )
}
