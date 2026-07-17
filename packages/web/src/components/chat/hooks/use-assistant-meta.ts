import { useMemo } from "react"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"
import { formatDuration } from "../utils/format"
import { resolveModelDisplayName } from "../utils/message-utils"

export function useAssistantMeta(
  assistantMessages: MessageWithParts[],
  providers: ProviderInfo[],
  turnDurationMs: number | undefined,
  assistantAborted: boolean,
): string {
  return useMemo(() => {
    const info = assistantMessages[assistantMessages.length - 1]?.info
    if (!info) return ""

    const modelName = resolveModelDisplayName(info, providers)

    return [modelName, formatDuration(turnDurationMs), assistantAborted ? "Stopped" : ""]
      .filter((value) => !!value)
      .join(" · ")
  }, [assistantMessages, providers, turnDurationMs, assistantAborted])
}
