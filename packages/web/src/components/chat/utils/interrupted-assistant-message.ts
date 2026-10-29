import type { MessageWithParts } from "@/state/chat-types"
import { isMessageAbortError } from "./error"

const ASSISTANT_ABORT_FINISH_REASONS = new Set(["aborted", "cancelled", "interrupted"])

function isAssistantAbortFinish(finish: string | null | undefined): boolean {
  return finish !== null && finish !== undefined && ASSISTANT_ABORT_FINISH_REASONS.has(finish)
}

function isNoticeMessage(message: MessageWithParts): boolean {
  return message.parts.length > 0 && message.parts.every((part) => part.type === "notice")
}

export function interruptedAssistantMessageID(
  messages: readonly MessageWithParts[],
): string | undefined {
  const latestReply = messages.findLast(
    (message) => message.info.role === "assistant" && !isNoticeMessage(message),
  )
  return latestReply?.info.role === "assistant" &&
    (isAssistantAbortFinish(latestReply.info.finish) || isMessageAbortError(latestReply.info.error))
    ? latestReply.info.id
    : undefined
}
