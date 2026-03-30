import { useMemo } from "react"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"
import { titleCase, formatDuration, modelLabel } from "./utils"

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
