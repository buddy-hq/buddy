import { useCallback, useEffect, useRef, useState } from "react"
import { animate, type AnimationPlaybackControls } from "motion"

import {
  buildStreamingRevealSteps,
  inferStreamingTextMode,
  MIN_STREAM_CHARS,
  streamingDurationSeconds,
  type StreamingTextStrategy,
} from "../utils/streaming-text-utils"

function useStreamingText(
  value: string,
  input?: {
    mode?: StreamingTextStrategy
    onFinalRender?: () => void
  },
) {
  const [visibleText, setVisibleText] = useState(value)
  const visibleTextRef = useRef(value)
  const targetTextRef = useRef(value)
  const incomingTextRef = useRef(value)
  const animationRef = useRef<AnimationPlaybackControls | null>(null)
  const finalRenderTimeoutRef = useRef<number | undefined>(undefined)
  const lastIncomingAtRef = useRef(Date.now())
  const animationTokenRef = useRef(0)
  const onFinalRenderRef = useRef(input?.onFinalRender)

  useEffect(() => {
    onFinalRenderRef.current = input?.onFinalRender
  }, [input?.onFinalRender])

  const clearAnimation = useCallback(() => {
    animationRef.current?.stop()
    animationRef.current = null
  }, [])

  const clearFinalRenderTimeout = useCallback(() => {
    if (finalRenderTimeoutRef.current === undefined) return
    window.clearTimeout(finalRenderTimeoutRef.current)
    finalRenderTimeoutRef.current = undefined
  }, [])

  const commitVisibleText = useCallback((nextText: string) => {
    visibleTextRef.current = nextText
    setVisibleText(nextText)
  }, [])

  const scheduleFinalRender = useCallback(() => {
    clearFinalRenderTimeout()
    finalRenderTimeoutRef.current = window.setTimeout(() => {
      finalRenderTimeoutRef.current = undefined
      onFinalRenderRef.current?.()
    }, 50)
  }, [clearFinalRenderTimeout])

  const finishStreaming = useCallback(
    (nextText: string, forceFinalRender = false) => {
      clearAnimation()
      const didChange = visibleTextRef.current !== nextText
      commitVisibleText(nextText)
      if (didChange || forceFinalRender) {
        scheduleFinalRender()
      }
    },
    [clearAnimation, commitVisibleText, scheduleFinalRender],
  )

  useEffect(() => {
    targetTextRef.current = value
    const now = Date.now()
    const previousIncomingText = incomingTextRef.current
    const incomingDeltaChars = Math.max(0, value.length - previousIncomingText.length)
    const incomingDeltaMs = Math.max(1, now - lastIncomingAtRef.current)
    incomingTextRef.current = value
    lastIncomingAtRef.current = now

    const currentText = visibleTextRef.current
    const shouldStream =
      value.length > currentText.length &&
      value.startsWith(currentText) &&
      value.length - currentText.length > MIN_STREAM_CHARS

    const mode =
      input?.mode && input.mode !== "auto"
        ? input.mode
        : inferStreamingTextMode({
            deltaChars: incomingDeltaChars || value.length - currentText.length,
            deltaMs: incomingDeltaMs,
            currentText,
            nextText: value,
          })

    if (!shouldStream || mode === "realtime") {
      finishStreaming(value)
      return
    }

    const steps = buildStreamingRevealSteps(value, currentText.length, mode)
    if (steps.length === 0) {
      finishStreaming(value)
      return
    }

    clearAnimation()
    clearFinalRenderTimeout()
    const animationToken = animationTokenRef.current + 1
    animationTokenRef.current = animationToken
    const firstStep = steps[0]
    const remainingSteps = steps.slice(1)
    if (typeof firstStep === "number") {
      commitVisibleText(value.slice(0, firstStep))
    }

    if (remainingSteps.length === 0) {
      scheduleFinalRender()
      return
    }

    const finalStepIndex = remainingSteps.length - 1
    animationRef.current = animate(0, finalStepIndex, {
      duration: streamingDurationSeconds(mode, steps.length),
      ease: "linear",
      onUpdate: (latest) => {
        if (animationTokenRef.current !== animationToken) return
        const stepIndex = Math.min(finalStepIndex, Math.floor(latest))
        const nextIndex = remainingSteps[stepIndex]
        if (typeof nextIndex !== "number") return
        if (nextIndex <= visibleTextRef.current.length) return
        commitVisibleText(targetTextRef.current.slice(0, nextIndex))
      },
      onComplete: () => {
        if (animationTokenRef.current !== animationToken) return
        animationRef.current = null
        finishStreaming(targetTextRef.current, true)
      },
    })

    return () => {
      clearAnimation()
    }
  }, [
    clearAnimation,
    clearFinalRenderTimeout,
    commitVisibleText,
    finishStreaming,
    scheduleFinalRender,
    input?.mode,
    value,
  ])

  useEffect(() => {
    return () => {
      clearAnimation()
      clearFinalRenderTimeout()
    }
  }, [clearAnimation, clearFinalRenderTimeout])

  return visibleText
}

export function useAdaptiveStreamingText(value: string, onFinalRender?: () => void) {
  return useStreamingText(value, { mode: "auto", onFinalRender })
}

export function useSmoothStreamingText(value: string, onFinalRender?: () => void) {
  return useStreamingText(value, { mode: "smooth", onFinalRender })
}

export function useLineByLineText(value: string, onFinalRender?: () => void) {
  return useStreamingText(value, { mode: "line", onFinalRender })
}
