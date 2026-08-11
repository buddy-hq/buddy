import type { ComponentProps } from "react"
import { cn } from "@buddy/ui"

type ReaderFloatingSurfaceProps = ComponentProps<"div">

export function ReaderFloatingSurface({
  children,
  className,
  ...props
}: ReaderFloatingSurfaceProps) {
  return (
    <div
      {...props}
      className={cn(
        "inline-flex flex-col rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha shadow-xl",
        className,
      )}
    >
      {children}
    </div>
  )
}
