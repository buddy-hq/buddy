import { useLayoutEffect, useState, type RefObject } from "react"
import type { ReaderMarginMark, ReaderMarginMarkPosition } from "../reader-types"

export type MarginMarkMeasure = (
  marks: readonly ReaderMarginMark[],
  surface: HTMLElement,
) => readonly ReaderMarginMarkPosition[] | Promise<readonly ReaderMarginMarkPosition[]>

export type MarginMarkRefreshSubscription = (refresh: () => void) => () => void

const EMPTY_POSITIONS: readonly ReaderMarginMarkPosition[] = []

function samePositions(
  current: readonly ReaderMarginMarkPosition[],
  next: readonly ReaderMarginMarkPosition[],
): boolean {
  return (
    current.length === next.length &&
    current.every((position, index) => {
      const other = next[index]
      return (
        other !== undefined &&
        other.id === position.id &&
        Math.round(other.x) === Math.round(position.x) &&
        Math.round(other.y) === Math.round(position.y)
      )
    })
  )
}

export function surfaceSlotPosition(input: {
  id: string
  surface: DOMRect
  line: { top: number; height: number }
  x: number
}): ReaderMarginMarkPosition | undefined {
  const y = input.line.top + input.line.height / 2 - input.surface.top
  if (y < 0 || y > input.surface.height) return undefined
  return { id: input.id, x: input.x - input.surface.left, y }
}

export function useMarginMarkPositions(input: {
  enabled: boolean
  marks: readonly ReaderMarginMark[] | undefined
  surfaceRef: RefObject<HTMLElement | null>
  measure: MarginMarkMeasure
  subscribe: MarginMarkRefreshSubscription
}): readonly ReaderMarginMarkPosition[] {
  const { enabled, marks, surfaceRef, measure, subscribe } = input
  const [positions, setPositions] = useState<readonly ReaderMarginMarkPosition[]>(EMPTY_POSITIONS)

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!enabled || !surface || !marks || marks.length === 0) {
      setPositions(EMPTY_POSITIONS)
      return
    }
    let active = true
    let generation = 0
    let frame: number | undefined
    const apply = (next: readonly ReaderMarginMarkPosition[]) => {
      setPositions((current) => (samePositions(current, next) ? current : next))
    }
    const run = () => {
      frame = undefined
      const current = ++generation
      void Promise.resolve(measure(marks, surface)).then(
        (next) => {
          if (active && current === generation) apply(next)
        },
        () => {
          if (active && current === generation) apply(EMPTY_POSITIONS)
        },
      )
    }
    const schedule = () => {
      frame ??= requestAnimationFrame(run)
    }
    run()
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(surface)
    const unsubscribe = subscribe(schedule)
    return () => {
      active = false
      if (frame !== undefined) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      unsubscribe()
    }
  }, [enabled, marks, measure, subscribe, surfaceRef])

  return positions
}
