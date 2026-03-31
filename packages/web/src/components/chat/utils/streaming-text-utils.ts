export const TEXT_RENDER_THROTTLE_MS = 100
export const MIN_STREAM_CHARS = 2
export const STREAM_BUFFER_DIVISOR = 10
export const MAX_SMOOTH_STREAM_CHARS = 48
export const LINE_STREAM_CHARS = 64
export const SOFT_BOUNDARY_LOOKBACK = 8
export const STREAM_REALTIME_GAP_MS = 180
export const FAST_STREAM_GAP_MS = 60
export const FAST_STREAM_DELTA_CHARS = 64
export const FAST_STREAM_CHARS_PER_SECOND = 420
export const SMOOTH_STREAM_STEP_DURATION_S = 0.024
export const LINE_STREAM_STEP_DURATION_S = 0.08
export const MIN_STREAM_DURATION_S = 0.08
export const MAX_STREAM_DURATION_S = 0.52

export type StreamingTextMode = "realtime" | "smooth" | "line"
export type StreamingTextStrategy = StreamingTextMode | "auto"

export function isSoftBoundary(char: string | undefined) {
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

export function snapToSoftBoundary(text: string, candidateIndex: number, currentIndex: number) {
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

export function nextSmoothChunkEnd(text: string, currentIndex: number) {
  const remainingChars = text.length - currentIndex
  const charsToAdd = Math.min(
    Math.max(MIN_STREAM_CHARS, Math.floor(remainingChars / STREAM_BUFFER_DIVISOR)),
    Math.min(remainingChars, MAX_SMOOTH_STREAM_CHARS),
  )
  const candidateIndex = Math.min(text.length, currentIndex + charsToAdd)
  return snapToSoftBoundary(text, candidateIndex, currentIndex)
}

export function nextLineChunkEnd(text: string, currentIndex: number) {
  const nextNewlineIndex = text.indexOf("\n", currentIndex)
  if (nextNewlineIndex !== -1) {
    return nextNewlineIndex + 1
  }

  const candidateIndex = Math.min(text.length, currentIndex + LINE_STREAM_CHARS)
  return snapToSoftBoundary(text, candidateIndex, currentIndex)
}

export function inferStreamingTextMode(input: {
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

export function buildStreamingRevealSteps(
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

export function streamingDurationSeconds(
  mode: Exclude<StreamingTextMode, "realtime">,
  stepCount: number,
) {
  const stepDuration = mode === "line" ? LINE_STREAM_STEP_DURATION_S : SMOOTH_STREAM_STEP_DURATION_S
  return Math.max(MIN_STREAM_DURATION_S, Math.min(MAX_STREAM_DURATION_S, stepCount * stepDuration))
}
