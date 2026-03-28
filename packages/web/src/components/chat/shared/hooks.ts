import { animate, type AnimationPlaybackControls } from "motion"
import { useCallback, useEffect, useRef, useState } from "react"

const TEXT_RENDER_THROTTLE_MS = 100
const MIN_STREAM_CHARS = 2
const STREAM_BUFFER_DIVISOR = 10
const MAX_SMOOTH_STREAM_CHARS = 48
const LINE_STREAM_CHARS = 64
const SOFT_BOUNDARY_LOOKBACK = 8
const STREAM_REALTIME_GAP_MS = 180
const FAST_STREAM_GAP_MS = 60
const FAST_STREAM_DELTA_CHARS = 64
const FAST_STREAM_CHARS_PER_SECOND = 420
const SMOOTH_STREAM_STEP_DURATION_S = 0.024
const LINE_STREAM_STEP_DURATION_S = 0.08
const MIN_STREAM_DURATION_S = 0.08
const MAX_STREAM_DURATION_S = 0.52

type StreamingTextMode = "realtime" | "smooth" | "line"
type StreamingTextStrategy = StreamingTextMode | "auto"

function isSoftBoundary(char: string | undefined) {
  return (
    char === " " ||
    char === "\n" ||
    char === "\t" ||
    char === "." ||
    char === "," ||
    char === ":" ||
    char === ";" ||
    char === "!" ||
    char === "?"
  )
}

function snapToSoftBoundary(text: string, candidateIndex: number, currentIndex: number) {
  if (candidateIndex >= text.length) return text.length

  for (
    let offset = 0;
    offset < SOFT_BOUNDARY_LOOKBACK && candidateIndex - offset > currentIndex;
    offset += 1
  ) {
    const boundaryIndex = candidateIndex - offset
    if (isSoftBoundary(text[boundaryIndex - 1])) {
      return boundaryIndex
    }
  }

  return candidateIndex
}

function nextSmoothChunkEnd(text: string, currentIndex: number) {
  const remainingChars = text.length - currentIndex
  const charsToAdd = Math.min(
    Math.max(MIN_STREAM_CHARS, Math.floor(remainingChars / STREAM_BUFFER_DIVISOR)),
    Math.min(remainingChars, MAX_SMOOTH_STREAM_CHARS),
  )
  const candidateIndex = Math.min(text.length, currentIndex + charsToAdd)
  return snapToSoftBoundary(text, candidateIndex, currentIndex)
}

function nextLineChunkEnd(text: string, currentIndex: number) {
  const nextNewlineIndex = text.indexOf("\n", currentIndex)
  if (nextNewlineIndex !== -1) {
    return nextNewlineIndex + 1
  }

  const candidateIndex = Math.min(text.length, currentIndex + LINE_STREAM_CHARS)
  return snapToSoftBoundary(text, candidateIndex, currentIndex)
}

function inferStreamingTextMode(input: {
  deltaChars: number
  deltaMs: number
  currentText: string
  nextText: string
}): StreamingTextMode {
  const growthChars = input.nextText.length - input.currentText.length
  if (growthChars <= MIN_STREAM_CHARS) return "realtime"

  if (input.deltaMs >= STREAM_REALTIME_GAP_MS && input.deltaChars <= FAST_STREAM_DELTA_CHARS / 2) {
    return "realtime"
  }

  const charsPerSecond =
    input.deltaMs > 0 ? (input.deltaChars * 1000) / input.deltaMs : input.deltaChars * 1000

  if (
    input.deltaMs <= FAST_STREAM_GAP_MS ||
    input.deltaChars >= FAST_STREAM_DELTA_CHARS ||
    charsPerSecond >= FAST_STREAM_CHARS_PER_SECOND
  ) {
    return "line"
  }

  return "smooth"
}

function buildStreamingRevealSteps(
  text: string,
  currentIndex: number,
  mode: Exclude<StreamingTextMode, "realtime">,
) {
  const steps: number[] = []
  let nextIndex = currentIndex

  while (nextIndex < text.length) {
    const candidateIndex =
      mode === "line" ? nextLineChunkEnd(text, nextIndex) : nextSmoothChunkEnd(text, nextIndex)
    const resolvedIndex =
      candidateIndex > nextIndex
        ? candidateIndex
        : Math.min(text.length, nextIndex + MIN_STREAM_CHARS)
    steps.push(resolvedIndex)
    nextIndex = resolvedIndex
  }

  return steps
}

function streamingDurationSeconds(mode: Exclude<StreamingTextMode, "realtime">, stepCount: number) {
  const stepDuration = mode === "line" ? LINE_STREAM_STEP_DURATION_S : SMOOTH_STREAM_STEP_DURATION_S
  return Math.max(MIN_STREAM_DURATION_S, Math.min(MAX_STREAM_DURATION_S, stepCount * stepDuration))
}

export function useThrottledText(value: string) {
  const [throttled, setThrottled] = useState(value)
  const timeoutRef = useRef<number | undefined>(undefined)
  const lastRef = useRef(0)

  useEffect(() => {
    const now = Date.now()
    const remaining = TEXT_RENDER_THROTTLE_MS - (now - lastRef.current)

    if (remaining <= 0) {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = undefined
      }
      lastRef.current = now
      setThrottled(value)
      return
    }

    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      lastRef.current = Date.now()
      setThrottled(value)
      timeoutRef.current = undefined
    }, remaining)

    return () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = undefined
      }
    }
  }, [value])

  return throttled
}

/**
 * Hook for adaptive streaming text.
 * - Slow streams render immediately
 * - Medium streams smooth in chunked steps
 * - Fast streams reveal a line at a time to avoid parse storms
 * - Triggers onFinalRender callback when the current render catches up
 */
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
