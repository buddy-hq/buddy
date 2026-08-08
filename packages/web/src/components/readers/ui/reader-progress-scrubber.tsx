import { useRef } from "react"
import { cn } from "@buddy/ui"

const READER_PROGRESS_COMMIT_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
])
const READER_PROGRESS_MIN = 0
const READER_PROGRESS_STEP = 1
const READER_PROGRESS_PERCENT = 100

type ReaderProgressScrubberProps = {
  value: number
  max: number
  className?: string
  onPreview: (value: number) => void
  onCommit: (value: number) => void
  onCancel: () => void
}

export function ReaderProgressScrubber({
  value,
  max,
  className,
  onPreview,
  onCommit,
  onCancel,
}: ReaderProgressScrubberProps) {
  const pendingValueRef = useRef<number | null>(null)
  const progressPercent =
    max > READER_PROGRESS_MIN
      ? Math.round(
          Math.max(
            READER_PROGRESS_MIN,
            Math.min(READER_PROGRESS_PERCENT, (value / max) * READER_PROGRESS_PERCENT),
          ),
        )
      : READER_PROGRESS_MIN

  const commitPendingValue = () => {
    const pendingValue = pendingValueRef.current
    if (pendingValue === null) return
    pendingValueRef.current = null
    onCommit(pendingValue)
  }

  const cancelPendingValue = () => {
    if (pendingValueRef.current === null) return
    pendingValueRef.current = null
    onCancel()
  }

  return (
    <input
      type="range"
      aria-label="Reading progress"
      aria-valuetext={`${progressPercent}%`}
      min={READER_PROGRESS_MIN}
      max={max}
      step={READER_PROGRESS_STEP}
      value={value}
      onChange={(event) => {
        const nextValue = Number(event.currentTarget.value)
        pendingValueRef.current = nextValue
        onPreview(nextValue)
      }}
      onPointerUp={commitPendingValue}
      onPointerCancel={cancelPendingValue}
      onKeyUp={(event) => {
        if (READER_PROGRESS_COMMIT_KEYS.has(event.key)) commitPendingValue()
      }}
      onBlur={commitPendingValue}
      className={cn("cursor-pointer", className)}
    />
  )
}
