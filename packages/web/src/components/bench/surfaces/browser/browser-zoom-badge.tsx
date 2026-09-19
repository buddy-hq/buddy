import { useEffect, useRef, useState } from "react"
import { cn } from "@buddy/ui"

const ZOOM_BADGE_VISIBLE_MS = 1_500

export function BrowserZoomBadge(props: { zoomFactor: number }) {
  const [visible, setVisible] = useState(false)
  const shownZoomRef = useRef(props.zoomFactor)

  useEffect(() => {
    if (shownZoomRef.current === props.zoomFactor) return
    shownZoomRef.current = props.zoomFactor
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), ZOOM_BADGE_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [props.zoomFactor])

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute right-3 top-3 rounded-md border border-border-weaker-base bg-surface-raised-base px-2 py-1 text-xs tabular-nums text-text-base shadow-xs transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      {Math.round(props.zoomFactor * 100)}%
    </div>
  )
}
