import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

import {
  nextStreamingTextIndex,
  TEXT_RENDER_PACE_MS,
} from "../utils/streaming-text-utils"

const FINAL_RENDER_NOTIFY_DELAY_MS = 50
const MAX_PACED_STREAMING_TEXT_LENGTH = 4_000
const MAX_PACED_STREAMING_MATH_MARKERS = 8
const MAX_PACED_STREAMING_MEDIA_REFERENCES = 2

type StreamingTextOptions = {
  live: boolean
  onFinalRender?: () => void
}

function shouldBypassStreamingPace(value: string): boolean {
  if (value.length >= MAX_PACED_STREAMING_TEXT_LENGTH) return true
  const mathMarkers = value.match(/\$\$|\\\[|\\\(|\\begin\{/gu)?.length ?? 0
  if (mathMarkers >= MAX_PACED_STREAMING_MATH_MARKERS) return true
  const mediaReferences = value.match(/!\[[^\]]*\]\([^)]+?\)|<img\b/giu)?.length ?? 0
  return mediaReferences >= MAX_PACED_STREAMING_MEDIA_REFERENCES
}

function useStreamingText(value: string, input: StreamingTextOptions): string {
  const [visibleText, setVisibleText] = useState(value)
  const shownRef = useRef(value)
  const targetRef = useRef(value)
  const liveRef = useRef(input.live)
  const wasLiveRef = useRef(input.live)
  const paceTimeoutRef = useRef<number | undefined>(undefined)
  const finalRenderTimeoutRef = useRef<number | undefined>(undefined)
  const onFinalRenderRef = useRef(input.onFinalRender)

  useEffect(() => {
    onFinalRenderRef.current = input.onFinalRender
  }, [input.onFinalRender])

  const clearPaceTimeout = useCallback(() => {
    if (paceTimeoutRef.current === undefined) return
    window.clearTimeout(paceTimeoutRef.current)
    paceTimeoutRef.current = undefined
  }, [])

  const clearFinalRenderTimeout = useCallback(() => {
    if (finalRenderTimeoutRef.current === undefined) return
    window.clearTimeout(finalRenderTimeoutRef.current)
    finalRenderTimeoutRef.current = undefined
  }, [])

  const scheduleFinalRender = useCallback(() => {
    clearFinalRenderTimeout()
    finalRenderTimeoutRef.current = window.setTimeout(() => {
      finalRenderTimeoutRef.current = undefined
      onFinalRenderRef.current?.()
    }, FINAL_RENDER_NOTIFY_DELAY_MS)
  }, [clearFinalRenderTimeout])

  const sync = useCallback(
    (nextText: string, notifyFinalRender = false) => {
      shownRef.current = nextText
      setVisibleText(nextText)
      if (notifyFinalRender) {
        scheduleFinalRender()
      }
    },
    [scheduleFinalRender],
  )

  const run = useCallback(() => {
    paceTimeoutRef.current = undefined
    const text = targetRef.current

    if (!liveRef.current || shouldBypassStreamingPace(text)) {
      sync(text, !liveRef.current)
      return
    }

    const shown = shownRef.current
    if (!text.startsWith(shown) || text.length <= shown.length) {
      sync(text)
      return
    }

    const end = nextStreamingTextIndex(text, shown.length)
    sync(text.slice(0, end))
    if (end < text.length) {
      paceTimeoutRef.current = window.setTimeout(run, TEXT_RENDER_PACE_MS)
    }
  }, [sync])

  useLayoutEffect(() => {
    targetRef.current = value
    liveRef.current = input.live

    const wasLive = wasLiveRef.current
    wasLiveRef.current = input.live

    if (!input.live) {
      clearPaceTimeout()
      sync(value, wasLive)
      return
    }

    if (shouldBypassStreamingPace(value)) {
      clearPaceTimeout()
      sync(value)
      return
    }

    const shown = shownRef.current
    if (!value.startsWith(shown) || value.length < shown.length) {
      clearPaceTimeout()
      sync(value)
      return
    }

    if (value.length === shown.length || paceTimeoutRef.current !== undefined) return
    paceTimeoutRef.current = window.setTimeout(run, TEXT_RENDER_PACE_MS)
  }, [clearPaceTimeout, input.live, run, sync, value])

  useEffect(() => {
    return () => {
      clearPaceTimeout()
      clearFinalRenderTimeout()
    }
  }, [clearFinalRenderTimeout, clearPaceTimeout])

  return visibleText
}

export function useAdaptiveStreamingText(
  value: string,
  options: StreamingTextOptions,
): string {
  return useStreamingText(value, options)
}
