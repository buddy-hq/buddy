import { useEffect, useMemo, useState } from "react"

import { parseTString } from "@/components/chat/tools/types"
import { hasFunctionValue } from "@/state/parse-external"
import type { MessageWithParts } from "@/state/chat-types"

import {
  getPromptSelectPerformanceSummary,
  PROMPT_SELECT_MODE_IDLE_TIMEOUT_MS,
  PROMPT_SELECT_MODE_SETTLE_DELAY_MS,
  type PromptSelectMode,
} from "./prompt-select-performance"

type UseAdaptiveSelectModeInput = {
  sessionID?: string
  isReady: boolean
  messages: MessageWithParts[]
}

function buildPerformanceSignature(messages: MessageWithParts[]) {
  const lastMessage = messages[messages.length - 1]
  const lastMessageTextLength =
    lastMessage?.parts.reduce((total, part) => total + (parseTString(part.text)?.length ?? 0), 0) ??
    0

  return [
    messages.length,
    lastMessage?.info.id ?? "",
    lastMessageTextLength,
    lastMessage?.parts.length ?? 0,
  ].join(":")
}

export function useAdaptiveSelectMode(input: UseAdaptiveSelectModeInput): PromptSelectMode {
  const [mode, setMode] = useState<PromptSelectMode>("radix")
  const performanceSignature = useMemo(
    () => buildPerformanceSignature(input.messages),
    [input.messages],
  )

  useEffect(() => {
    setMode("radix")
  }, [input.sessionID])

  useEffect(() => {
    if (!input.isReady || mode === "native") return

    let idleHandle: number | undefined
    let timerHandle: number | undefined

    const evaluate = () => {
      const summary = getPromptSelectPerformanceSummary(input.messages)
      if (summary.shouldPreferNativeSelects) {
        setMode("native")
      }
    }

    timerHandle = window.setTimeout(() => {
      if ("requestIdleCallback" in window && hasFunctionValue(window.requestIdleCallback)) {
        idleHandle = window.requestIdleCallback(evaluate, {
          timeout: PROMPT_SELECT_MODE_IDLE_TIMEOUT_MS,
        })
        return
      }

      evaluate()
    }, PROMPT_SELECT_MODE_SETTLE_DELAY_MS)

    return () => {
      if (timerHandle !== undefined) {
        window.clearTimeout(timerHandle)
      }
      if (
        idleHandle !== undefined &&
        "cancelIdleCallback" in window &&
        hasFunctionValue(window.cancelIdleCallback)
      ) {
        window.cancelIdleCallback(idleHandle)
      }
    }
  }, [input.isReady, input.messages, input.sessionID, mode, performanceSignature])

  return mode
}
