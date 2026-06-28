import { useEffect, useRef } from "react"

import { recordTranscriptPerfEvent } from "@/lib/directory-chat/transcript-performance-probe"

type StreamingTextOptions = {
  live: boolean
}

export function useAdaptiveStreamingText(value: string, options: StreamingTextOptions): string {
  const previousLengthRef = useRef(value.length)

  useEffect(() => {
    const previousLength = previousLengthRef.current
    previousLengthRef.current = value.length
    if (!options.live) return
    recordTranscriptPerfEvent({
      type: "streaming-throughput",
      at: performance.now(),
      live: options.live,
      contentLength: value.length,
      deltaLength: value.length - previousLength,
    })
  }, [options.live, value])

  return value
}
