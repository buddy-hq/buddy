import { useMemo } from "react"
import type { MessagePart, MessageWithParts, ProviderInfo } from "@/state/chat-types"
import { isMessageAbortError, reasoningHeading, titleCase, formatDuration } from "./shared/utils"
import { groupAssistantParts, assistantPartStartsFollowup, modelLabel } from "./utils"
import type { AssistantDerivedState } from "./types"

export function useAssistantMeta(
  assistantMessages: MessageWithParts[],
  providers: ProviderInfo[],
  turnDurationMs: number | undefined,
  assistantAborted: boolean,
): string {
  return useMemo(() => {
    const info = assistantMessages[assistantMessages.length - 1]?.info
    if (!info) return ""

    let modelName = modelLabel(info)
    const providerID = "providerID" in info ? info.providerID : undefined
    const modelID = "modelID" in info ? info.modelID : undefined

    if (providerID && modelID) {
      const match = providers.find((p) => p.id === providerID)
      const models = match?.models
      if (models && modelID in models) {
        const entry = models[modelID as keyof typeof models]
        if (entry && typeof entry === "object" && "name" in entry && entry.name) {
          modelName = String(entry.name)
        }
      }
    }

    return [
      titleCase(info.agent),
      modelName,
      formatDuration(turnDurationMs),
      assistantAborted ? "Interrupted" : "",
    ]
      .filter((value) => !!value)
      .join(" · ")
  }, [assistantMessages, providers, turnDurationMs, assistantAborted])
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

  const collapsedAbstractedKeys = useMemo(() => {
    const partIndexByID = new Map(assistantParts.map((part, index) => [part.id, index]))
    const keys = new Set<string>()

    for (const item of assistantItems) {
      if (item.type !== "abstracted") continue

      const lastPartID = item.parts[item.parts.length - 1]?.id
      if (!lastPartID) continue

      const rawEndIndex = partIndexByID.get(lastPartID)
      if (rawEndIndex === undefined) continue

      const hasFollowup = assistantParts
        .slice(rawEndIndex + 1)
        .some((part) => assistantPartStartsFollowup(part))

      if (hasFollowup) {
        keys.add(item.key)
      }
    }

    return keys
  }, [assistantItems, assistantParts])

  const assistantTextParts = useMemo(
    () =>
      assistantParts.filter(
        (part) => part.type === "text" && String(part.text ?? "").trim().length > 0,
      ),
    [assistantParts],
  )

  const currentReasoningHeading = useMemo(
    () =>
      assistantParts
        .filter(
          (part): part is MessagePart & { type: "reasoning"; text: string } =>
            part.type === "reasoning",
        )
        .map((part) => reasoningHeading(String(part.text ?? "")))
        .filter((value): value is string => Boolean(value))
        .slice(-1)[0],
    [assistantParts],
  )

  const assistantError = useMemo(
    () =>
      assistantMessages
        .map((message) => (message.info.role === "assistant" ? message.info.error : undefined))
        .findLast((error) => !!error && !isMessageAbortError(error)),
    [assistantMessages],
  )

  const assistantErrorName =
    assistantError &&
    typeof assistantError.name === "string" &&
    assistantError.name !== "UnknownError"
      ? assistantError.name
      : undefined

  return {
    assistantItems,
    collapsedAbstractedKeys,
    assistantTextParts,
    currentReasoningHeading,
    assistantError,
    assistantErrorName,
  }
}
