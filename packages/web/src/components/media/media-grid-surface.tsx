import type { ReactNode } from "react"
import { cn } from "@buddy/ui"

export function MediaGridSurface(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative size-full overflow-hidden bg-background-base bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:24px_24px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]",
        props.className,
      )}
    >
      {props.children}
    </div>
  )
}
