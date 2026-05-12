import type { ReactNode } from "react"
import { cn } from "@buddy/ui"

type WithClassName = { className?: string; children?: ReactNode }

function ToolRow({ className, children }: WithClassName) {
  return <div className={cn("flex min-w-0 items-center gap-1.5", className)}>{children}</div>
}

function ToolRowIcon({ className, children }: WithClassName) {
  if (!children) return null
  return (
    <span className={cn("shrink-0 text-text-weaker", className)} aria-hidden>
      {children}
    </span>
  )
}

function ToolRowAction({ className, children }: WithClassName) {
  return (
    <span className={cn("shrink-0 text-sm text-text-weak lowercase", className)}>{children}</span>
  )
}

function ToolRowSubject({ className, children }: WithClassName) {
  return (
    <span className={cn("min-w-0 flex-1 truncate text-xs text-text-weaker", className)}>
      {children}
    </span>
  )
}

function ToolRowArg({ className, children }: WithClassName) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-surface-weak px-1 py-px text-[11px] text-text-weaker",
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Inline badge shown when a tool call was denied by the user.
 * Uses neutral styling to signal a user choice, not a failure.
 */
function ToolRowDenied({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded bg-surface-weak px-1 py-px text-[11px] text-text-weaker",
        className,
      )}
    >
      denied
    </span>
  )
}

export { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject, ToolRowArg, ToolRowDenied }
