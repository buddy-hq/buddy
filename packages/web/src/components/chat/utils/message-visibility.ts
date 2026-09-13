import type { MessageInfo, MessageWithParts } from "@/state/chat-types"
import {
  isHiddenFromUserMessageInfo,
  isSvgAutoRepairMessageID as isSharedSvgAutoRepairMessageID,
} from "@buddy/opencode-adapter/message-visibility"

import { parseTString } from "../tools/types"

export function isSvgAutoRepairMessageID<TValue>(value: TValue): boolean {
  const text = parseTString(value)
  return isSharedSvgAutoRepairMessageID(text)
}

export function isSvgAutoRepairAssistantMessage(message: MessageInfo | undefined): boolean {
  return message?.role === "assistant" && isSvgAutoRepairMessageID(message.parentID)
}

export function isHiddenFromUserMessage(message: MessageWithParts): boolean {
  return isHiddenFromUserMessageInfo({
    id: message.info.id,
    role: message.info.role,
    metadata: "metadata" in message.info ? message.info.metadata : undefined,
  })
}
