import { Skeleton } from "@buddy/ui"
import { useEffect, useState } from "react"

/**
 * The visible loading affordance for a Bench surface.
 *
 * Two rules, both about not punishing the common case. First, nothing renders at all until the load
 * has actually taken a noticeable amount of time — most opens resolve from cache in well under a
 * frame budget, and flashing a loader through them reads as jank rather than feedback. Second, once
 * shown it stays for a minimum span, so a load that crosses the threshold by a few milliseconds
 * does not blink.
 *
 * The surface deliberately says nothing. "Loading object" leaked Buddy's internal vocabulary for
 * managed objects into the product, and a single line of centered text tells the user less than a
 * shape that matches what is about to appear.
 */

const BENCH_PENDING_DELAY_MS = 250
const BENCH_PENDING_MINIMUM_VISIBLE_MS = 400

export function useDelayedPendingVisible(input?: {
  delayMs?: number
  minimumVisibleMs?: number
}): boolean {
  const delayMs = input?.delayMs ?? BENCH_PENDING_DELAY_MS
  const minimumVisibleMs = input?.minimumVisibleMs ?? BENCH_PENDING_MINIMUM_VISIBLE_MS
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const showTimeout = globalThis.setTimeout(() => setVisible(true), delayMs)
    return () => {
      globalThis.clearTimeout(showTimeout)
    }
  }, [delayMs])

  // Held separately from `visible` so unmounting mid-load never leaves a timer running, while a
  // surface that resolves just after the threshold still shows a complete, non-blinking frame.
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!visible) return
    setHeld(true)
    const holdTimeout = globalThis.setTimeout(() => setHeld(false), minimumVisibleMs)
    return () => {
      globalThis.clearTimeout(holdTimeout)
    }
  }, [minimumVisibleMs, visible])

  return visible || held
}

export type TBenchSurfacePendingLayout = "document" | "canvas" | "media"

/**
 * Renders nothing until the load is slow enough to be worth acknowledging, then a quiet skeleton
 * shaped like the surface being opened.
 */
export function BenchSurfacePending(props: { layout?: TBenchSurfacePendingLayout }) {
  const visible = useDelayedPendingVisible()
  if (!visible) return <div data-component="bench-surface-pending-idle" className="h-full w-full" />

  const pendingLayout = props.layout ?? "document"

  return (
    <div
      data-component="bench-surface-pending"
      data-pending-layout={pendingLayout}
      className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 p-6"
      role="status"
      aria-busy
    >
      {pendingLayout === "canvas" || pendingLayout === "media" ? (
        <Skeleton className="min-h-0 w-full flex-1" />
      ) : (
        <>
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="mt-2 min-h-0 w-full flex-1" />
        </>
      )}
    </div>
  )
}
