import { cn } from "@buddy/ui"
import { ReaderProgressScrubber } from "./reader-progress-scrubber"

const READER_PROGRESS_PERCENT = 100

type ReaderProgressRailProps = {
  value: number
  max: number
  paper: string
  ink: string
  className?: string
  onPreview: (value: number) => void
  onCommit: (value: number) => void
  onCancel: () => void
}

export function ReaderProgressRail({
  value,
  max,
  paper,
  ink,
  className,
  onPreview,
  onCommit,
  onCancel,
}: ReaderProgressRailProps) {
  const progress = max > 0 ? Math.max(0, Math.min(READER_PROGRESS_PERCENT, (value / max) * 100)) : 0

  return (
    <div
      className={cn(
        "group/rail relative h-2.5 w-full shrink-0 cursor-pointer focus-within:ring-2 focus-within:ring-inset focus-within:ring-border-interactive-base",
        className,
      )}
      style={{ backgroundColor: paper }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]"
        style={{ backgroundColor: `color-mix(in oklab, ${ink} 16%, transparent)` }}
      >
        <div
          className="h-full transition-[width]"
          style={{
            width: `${progress}%`,
            backgroundColor: `color-mix(in oklab, ${ink} 72%, transparent)`,
          }}
        />
      </div>
      <div
        className="pointer-events-none absolute bottom-[-1px] size-[7px] -translate-x-1/2 rounded-full opacity-0 transition-opacity group-hover/rail:opacity-100 group-focus-within/rail:opacity-100"
        style={{ left: `${progress}%`, backgroundColor: ink }}
      />
      <ReaderProgressScrubber
        max={max}
        value={value}
        onPreview={onPreview}
        onCommit={onCommit}
        onCancel={onCancel}
        className="absolute inset-0 h-full w-full appearance-none bg-transparent opacity-0"
      />
    </div>
  )
}

