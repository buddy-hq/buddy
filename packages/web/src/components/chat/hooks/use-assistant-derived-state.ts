import { useDeferredValue, useMemo } from "react"
import type { MessagePart, MessageWithParts } from "@/state/chat-types"
import { isMessageAbortError } from "../utils/error"
import { reasoningHeading } from "../utils/markdown"
import { assistantPartStartsFollowup, groupAssistantParts } from "../utils/message-utils"
import { isChatReasoningPart, isChatTextPart } from "../utils/part-guards"
import type { AssistantDerivedState } from "../types"

export function useAssistantDerivedState(
  assistantParts: MessagePart[],
  showReasoningSummaries: boolean,
  assistantMessages: MessageWithParts[],
): AssistantDerivedState {
  const assistantItems = useMemo(
    () => groupAssistantParts(assistantParts, showReasoningSummaries),
    [assistantParts, showReasoningSummaries],
  )

  const deferredAssistantParts = useDeferredValue(assistantParts)
  const deferredAssistantItems = useDeferredValue(assistantItems)

  const collapsedAbstractedKeys = useMemo(() => {
    const partIndexByID = new Map(deferredAssistantParts.map((part, index) => [part.id, index]))
    const keys = new Set<string>()

    for (const item of deferredAssistantItems) {
      if (item.type !== "abstracted") continue

      const lastPartID = item.parts[item.parts.length - 1]?.id
      if (!lastPartID) continue

      const rawEndIndex = partIndexByID.get(lastPartID)
      if (rawEndIndex === undefined) continue

      const hasFollowup = deferredAssistantParts
        .slice(rawEndIndex + 1)
        .some((part) => assistantPartStartsFollowup(part))

      if (hasFollowup) {
        keys.add(item.key)
      }
    }

    return keys
  }, [deferredAssistantParts, deferredAssistantItems])

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
          (message.info.finish === "aborted" ||
            message.info.finish === "cancelled" ||
            isMessageAbortError(message.info.error)),
      ),
    [assistantMessages],
  )

  return {
    assistantItems,
    collapsedAbstractedKeys,
    assistantTextParts,
    currentReasoningHeading,
    assistantError,
    assistantErrorName,
    assistantAborted,
  }
}
