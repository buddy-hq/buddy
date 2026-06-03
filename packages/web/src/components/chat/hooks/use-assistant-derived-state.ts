import { useMemo } from "react"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import { isMessageAbortError } from "../utils/error"
import { reasoningHeading } from "../utils/markdown"
import { groupAssistantParts } from "../utils/message-utils"
import { isChatReasoningPart, isChatTextPart } from "../utils/part-guards"
import type { AssistantDerivedState } from "../types"

const ASSISTANT_ABORT_FINISH_REASONS = new Set(["aborted", "cancelled", "interrupted"])

function isAssistantAbortFinish(finish: string | null | undefined): boolean {
  return typeof finish === "string" && ASSISTANT_ABORT_FINISH_REASONS.has(finish)
}

export function useAssistantDerivedState(
  assistantParts: MessagePart[],
  showReasoningSummaries: boolean,
  assistantMessages: MessageWithParts[],
): AssistantDerivedState {
  const assistantItems = useMemo(
    () => groupAssistantParts(assistantParts, showReasoningSummaries),
    [assistantParts, showReasoningSummaries],
  )

  const assistantTextParts = useMemo(
    () => assistantParts.filter((part) => isChatTextPart(part) && part.text.trim().length > 0),
    [assistantParts],
  )

  const currentReasoningHeading = useMemo(
    () =>
      assistantParts
        .filter(isChatReasoningPart)
        .map((part) => reasoningHeading(part.text))
        .filter((value): value is string => Boolean(value))
        .slice(-1)[0],
    [assistantParts],
  )

  const assistantError = useMemo(
    () =>
      assistantMessages
        .map((message) =>
          message.info.role === "assistant" ? (message.info.error ?? undefined) : undefined,
        )
        .findLast((error) => !!error && !isMessageAbortError(error)),
    [assistantMessages],
  )

  const assistantErrorName =
    assistantError &&
    typeof assistantError.name === "string" &&
    assistantError.name !== "UnknownError"
      ? assistantError.name
      : undefined

  const assistantAborted = useMemo(
    () =>
      assistantMessages.some(
        (message) =>
          message.info.role === "assistant" &&
          (isAssistantAbortFinish(message.info.finish) || isMessageAbortError(message.info.error)),
      ),
    [assistantMessages],
  )

  return {
    assistantItems,
    assistantTextParts,
    currentReasoningHeading,
    assistantError,
    assistantErrorName,
    assistantAborted,
  }
}
