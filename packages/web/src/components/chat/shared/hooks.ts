import { useCallback, useEffect, useRef, useState } from "react"

const TEXT_RENDER_THROTTLE_MS = 100
const STREAM_FRAME_INTERVAL_MS = 1000 / 30
const MIN_STREAM_CHARS = 2
const STREAM_BUFFER_DIVISOR = 10

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
 * Hook for smooth streaming text.
 * - Streams text progressively for visual effect (raw text, no markdown parse)
 * - Upgrades to full markdown when stream completes
 * - Triggers onFinalRender callback for auto-scroll
 */
export function useSmoothStreamingText(value: string, onFinalRender?: () => void) {
  const [visibleText, setVisibleText] = useState(value)
  const visibleTextRef = useRef(value)
  const targetTextRef = useRef(value)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const finalRenderTimeoutRef = useRef<number | undefined>(undefined)
  const lastFrameAtRef = useRef(0)
  const onFinalRenderRef = useRef(onFinalRender)

  useEffect(() => {
    onFinalRenderRef.current = onFinalRender
  }, [onFinalRender])

  const clearAnimation = useCallback(() => {
    if (animationFrameRef.current === undefined) return
    cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = undefined
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
    (nextText: string) => {
      clearAnimation()
      const didChange = visibleTextRef.current !== nextText
      commitVisibleText(nextText)
      if (didChange) {
        scheduleFinalRender()
      }
    },
    [clearAnimation, commitVisibleText, scheduleFinalRender],
  )

  useEffect(() => {
    targetTextRef.current = value
    const currentText = visibleTextRef.current
    const shouldStream =
      value.length > currentText.length &&
      value.startsWith(currentText) &&
      value.length - currentText.length > MIN_STREAM_CHARS

    if (!shouldStream) {
      finishStreaming(value)
      return
    }

    clearAnimation()
    clearFinalRenderTimeout()
    lastFrameAtRef.current = 0

    const animate = (timestamp: number) => {
      const current = visibleTextRef.current
      const target = targetTextRef.current

      if (current.length >= target.length) {
        finishStreaming(target)
        return
      }

      if (timestamp - lastFrameAtRef.current < STREAM_FRAME_INTERVAL_MS) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      lastFrameAtRef.current = timestamp
      const remainingChars = target.length - current.length
      const charsToAdd = Math.min(
        Math.max(MIN_STREAM_CHARS, Math.floor(remainingChars / STREAM_BUFFER_DIVISOR)),
        remainingChars,
      )
      const nextText = target.slice(0, current.length + charsToAdd)
      commitVisibleText(nextText)

      if (nextText.length >= target.length) {
        animationFrameRef.current = undefined
        if (nextText !== current) {
          scheduleFinalRender()
        }
        return
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      clearAnimation()
    }
  }, [
    clearAnimation,
    clearFinalRenderTimeout,
    commitVisibleText,
    finishStreaming,
    scheduleFinalRender,
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

// Export for backwards compatibility
export const useLineByLineText = useSmoothStreamingText
