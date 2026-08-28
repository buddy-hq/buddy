import { useEffect, useRef, useState } from "react"
import type { ReaderRelocation } from "../reader-types"
import type { ReaderRecentLocation } from "./reader-location-popover"

const READER_RECENT_LOCATION_LIMIT = 5
/**
 * Relocations arrive once per animation frame while a PDF scrolls, and every
 * frame is a distinct position, so recording them as they land fills the list
 * with a single scroll gesture and re-renders the reader twice per frame.
 * Only a position someone stopped at is a place worth returning to.
 */
export const READER_RECENT_LOCATION_SETTLE_MS = 600

export type ReaderRecentLocationScheduler = (callback: () => void, delayMs: number) => () => void

export const scheduleReaderRecentLocation: ReaderRecentLocationScheduler = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}

function positionAnchorId(anchor: ReaderRelocation["anchor"]): string {
  if (anchor.kind === "cfi-position") return `cfi:${anchor.cfi}`
  return `pdf:${anchor.pageIndex}:${anchor.xRatio}:${anchor.yRatio}`
}

/**
 * `sourceKey` identifies the open document. Recent locations are anchors into
 * one document, so a replacement document starts an empty list rather than
 * offering jumps into pages that belong to the book that just closed.
 */
export function useReaderRecentLocations(
  input: {
    sourceKey: string
    relocation: ReaderRelocation | undefined | null
  },
  schedule: ReaderRecentLocationScheduler = scheduleReaderRecentLocation,
): ReaderRecentLocation[] {
  const [recent, setRecent] = useState<ReaderRecentLocation[]>([])
  const sourceKeyRef = useRef(input.sourceKey)
  const cancelPendingLocationRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    if (sourceKeyRef.current === input.sourceKey) return
    sourceKeyRef.current = input.sourceKey
    cancelPendingLocationRef.current?.()
    cancelPendingLocationRef.current = undefined
    setRecent([])
  }, [input.sourceKey])

  useEffect(() => {
    const relocation = input.relocation
    if (!relocation) return
    const cancel = schedule(() => {
      const id = positionAnchorId(relocation.anchor)
      const label =
        relocation.tocLabel ?? relocation.pageLabel ?? relocation.locationLabel ?? "Location"
      const position = relocation.locationLabel ?? relocation.pageLabel ?? "—"
      setRecent((current) => {
        const previous = current.at(-1)
        if (previous?.id === id) return current
        return [
          ...current.filter((entry) => entry.id !== id),
          { id, label, position, anchor: relocation.anchor },
        ].slice(-READER_RECENT_LOCATION_LIMIT)
      })
    }, READER_RECENT_LOCATION_SETTLE_MS)
    cancelPendingLocationRef.current = cancel
    return () => {
      if (cancelPendingLocationRef.current === cancel) {
        cancelPendingLocationRef.current = undefined
      }
      cancel()
    }
  }, [input.relocation, schedule])

  return recent
}
