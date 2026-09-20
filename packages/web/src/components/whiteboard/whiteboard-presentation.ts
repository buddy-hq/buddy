import { useEffect, useRef, useState } from "react"
import type { PersistedWhiteboardElement } from "./whiteboard-elements"
import {
  buildProgressiveWhiteboardSignature,
  type ProgressiveWhiteboardPreview,
} from "./whiteboard-progressive"

const WHITEBOARD_PRESENTATION_MAX_FRAMES = 8

function elementSignature(element: PersistedWhiteboardElement): string {
  return JSON.stringify(element)
}

function createPreview(input: {
  elements: PersistedWhiteboardElement[]
  target: ProgressiveWhiteboardPreview
}): ProgressiveWhiteboardPreview {
  return Object.assign(
    {
      elements: input.elements,
      signature: buildProgressiveWhiteboardSignature(
        Object.assign(
          { elements: input.elements },
          input.target.viewport ? { viewport: input.target.viewport } : undefined,
        ),
      ),
    },
    input.target.viewport ? { viewport: input.target.viewport } : undefined,
  )
}

function revealElements(input: {
  current: readonly PersistedWhiteboardElement[]
  target: readonly PersistedWhiteboardElement[]
  revealedIDs: ReadonlySet<string>
}): PersistedWhiteboardElement[] {
  const targetByID = new Map(input.target.map((element) => [element.id, element]))
  const includedTargetIDs = new Set<string>()
  const elements = input.current.map((element) => {
    const replacement = targetByID.get(element.id)
    if (!replacement || !input.revealedIDs.has(element.id)) return element
    includedTargetIDs.add(element.id)
    return replacement
  })

  for (const element of input.target) {
    if (!input.revealedIDs.has(element.id) || includedTargetIDs.has(element.id)) continue
    elements.push(element)
  }
  return elements
}

/**
 * Builds a short sequence of valid scenes from the currently painted board to the canonical
 * target. Transcript state is never delayed: this is presentation-only pacing at element
 * boundaries, capped so a large one-shot tool result catches up within a few animation frames.
 */
function buildWhiteboardPresentationFrames(input: {
  current: ProgressiveWhiteboardPreview
  target: ProgressiveWhiteboardPreview
  maxFrames?: number
}): ProgressiveWhiteboardPreview[] {
  if (input.current.signature === input.target.signature) return []

  const maxFrames = Math.max(1, input.maxFrames ?? WHITEBOARD_PRESENTATION_MAX_FRAMES)
  if (maxFrames === 1) return [input.target]

  const currentByID = new Map(input.current.elements.map((element) => [element.id, element]))
  const changedTargetElements = input.target.elements.filter((element) => {
    const current = currentByID.get(element.id)
    return current === undefined || elementSignature(current) !== elementSignature(element)
  })
  if (changedTargetElements.length === 0) return [input.target]

  const revealFrameCount = Math.min(changedTargetElements.length, maxFrames - 1)
  const revealChunkSize = Math.ceil(changedTargetElements.length / revealFrameCount)
  const revealedIDs = new Set<string>()
  const frames: ProgressiveWhiteboardPreview[] = []

  for (let index = 0; index < changedTargetElements.length; index += revealChunkSize) {
    for (const element of changedTargetElements.slice(index, index + revealChunkSize)) {
      revealedIDs.add(element.id)
    }
    const preview = createPreview({
      elements: revealElements({
        current: input.current.elements,
        target: input.target.elements,
        revealedIDs,
      }),
      target: input.target,
    })
    if (preview.signature !== frames.at(-1)?.signature) frames.push(preview)
  }

  if (frames.at(-1)?.signature !== input.target.signature) frames.push(input.target)
  return frames
}

function useWhiteboardPresentation(input: {
  base: ProgressiveWhiteboardPreview
  target: ProgressiveWhiteboardPreview | undefined
  animate: boolean
}): ProgressiveWhiteboardPreview | undefined {
  const [presented, setPresented] = useState<ProgressiveWhiteboardPreview>()
  const presentedRef = useRef<ProgressiveWhiteboardPreview>()
  const generationRef = useRef(0)
  const frameRef = useRef<number>()
  const revealRef = useRef<{ baseSignature: string }>()

  useEffect(() => {
    generationRef.current += 1
    const generation = generationRef.current
    if (frameRef.current !== undefined) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = undefined
    }

    // Fetching the completed board retires the tool preview, not its local reveal. Continue
    // toward the canonical scene from the frame already shown (including the initial base).
    const canonicalHandoff =
      !input.target &&
      revealRef.current !== undefined &&
      input.base.signature !== revealRef.current.baseSignature
    const target = input.target ?? (canonicalHandoff ? input.base : undefined)
    if (!target) {
      revealRef.current = undefined
      presentedRef.current = undefined
      setPresented(undefined)
      return
    }

    const current = presentedRef.current ?? input.base
    if (!input.animate) {
      revealRef.current = undefined
      presentedRef.current = target
      setPresented(input.target ? target : undefined)
      return
    }

    const frames = buildWhiteboardPresentationFrames({ current, target })
    if (frames.length === 0) {
      revealRef.current = undefined
      presentedRef.current = target
      setPresented(input.target ? target : undefined)
      return
    }

    revealRef.current ??= { baseSignature: input.base.signature }
    presentedRef.current = current
    setPresented(current)
    let index = 0
    const revealNextFrame = () => {
      if (generationRef.current !== generation) return
      const next = frames[index]
      if (!next) {
        frameRef.current = undefined
        return
      }
      index += 1
      presentedRef.current = next
      const complete = index === frames.length
      if (complete) revealRef.current = undefined
      setPresented(complete && !input.target ? undefined : next)
      frameRef.current =
        index < frames.length ? window.requestAnimationFrame(revealNextFrame) : undefined
    }
    frameRef.current = window.requestAnimationFrame(revealNextFrame)

    return () => {
      generationRef.current += 1
      if (frameRef.current === undefined) return
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = undefined
    }
  }, [input.animate, input.base, input.target])

  return presented
}

export {
  WHITEBOARD_PRESENTATION_MAX_FRAMES,
  buildWhiteboardPresentationFrames,
  useWhiteboardPresentation,
}
