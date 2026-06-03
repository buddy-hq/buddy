export const TEXT_RENDER_PACE_MS = 24
export const TEXT_RENDER_SNAP_RE = /[\s.,!?;:)\]]/u
export const TEXT_RENDER_SNAP_LOOKAHEAD = 8
export const TEXT_RENDER_TINY_STEP = 2
export const TEXT_RENDER_SMALL_STEP = 4
export const TEXT_RENDER_MEDIUM_STEP = 8
export const TEXT_RENDER_MAX_STEP = 24
export const TEXT_RENDER_TINY_REMAINING = 12
export const TEXT_RENDER_SMALL_REMAINING = 48
export const TEXT_RENDER_MEDIUM_REMAINING = 96
export const TEXT_RENDER_STEP_DIVISOR = 8

export function streamingTextStep(remainingChars: number): number {
  if (remainingChars <= TEXT_RENDER_TINY_REMAINING) return TEXT_RENDER_TINY_STEP
  if (remainingChars <= TEXT_RENDER_SMALL_REMAINING) return TEXT_RENDER_SMALL_STEP
  if (remainingChars <= TEXT_RENDER_MEDIUM_REMAINING) return TEXT_RENDER_MEDIUM_STEP
  return Math.min(TEXT_RENDER_MAX_STEP, Math.ceil(remainingChars / TEXT_RENDER_STEP_DIVISOR))
}

export function nextStreamingTextIndex(text: string, start: number): number {
  const end = Math.min(text.length, start + streamingTextStep(text.length - start))
  const max = Math.min(text.length, end + TEXT_RENDER_SNAP_LOOKAHEAD)
  for (let index = end; index < max; index += 1) {
    if (TEXT_RENDER_SNAP_RE.test(text[index] ?? "")) return index + 1
  }
  return end
}
