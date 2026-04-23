import { motion } from "motion/react"
import { ToolStatusIndicator } from "./tool-header"
import { MOTION_SOFT } from "./tool-motion"
import { cn } from "@buddy/ui"
import type { ToolState } from "./types"

export type ArtifactCardProps = {
  title: string
  subtitle?: string
  badge?: string
  status?: ToolState["status"]
  hideStatus?: boolean
  actions?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  innerClassName?: string
  showGrid?: boolean
}

export function ArtifactCard({
  title,
  subtitle,
  badge,
  status,
  hideStatus = false,
  actions,
  children,
  contentClassName,
  innerClassName,
  showGrid = false,
}: ArtifactCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_SOFT}
      className="flex min-w-0 w-full max-w-full flex-col overflow-hidden rounded-xl bg-background-base shadow-sm ring-1 ring-border-base/50"
    >
      <div className="flex w-full items-center justify-between gap-4 border-b border-border-base/40 bg-surface-base px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {badge ? (
            <span className="shrink-0 rounded-md border border-border-base/60 bg-background-base px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-text-weak uppercase shadow-xs">
              {badge}
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col">
            <span className="min-w-0 truncate text-xs font-semibold text-text-base">{title}</span>
            {subtitle ? (
              <span className="text-[11px] leading-tight text-text-weak">{subtitle}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {!hideStatus && status ? (
            <div className="shrink-0">
              <ToolStatusIndicator status={status} />
            </div>
          ) : null}
        </div>
      </div>
      {children ? (
        <div
          className={cn(
            "scrollbar-hover relative w-full min-w-0 max-w-full overflow-auto",
            contentClassName,
          )}
        >
          {showGrid ? (
            <div className="relative h-full w-full bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:24px_24px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]">
              <div className={cn("relative z-10 h-full", innerClassName)}>{children}</div>
            </div>
          ) : (
            <div className={cn("relative h-full", innerClassName)}>{children}</div>
          )}
        </div>
      ) : null}
    </motion.div>
  )
}
