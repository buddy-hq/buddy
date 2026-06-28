import { ToolStatusIndicator } from "./tool-header"
import { cn } from "@buddy/ui"
import type { ToolState } from "./types"

export type ObjectCardProps = {
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
  headerPosition?: "top" | "bottom"
}

export function ObjectCard({
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
  headerPosition = "top",
}: ObjectCardProps) {
  const header = (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-4 bg-surface-base px-3 py-2",
        headerPosition === "top"
          ? "border-b border-border-base/40 rounded-t-[inherit]"
          : "border-t border-border-base/40 rounded-b-[inherit]",
      )}
    >
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
  )

  return (
    <div
      data-component="object-card"
      className="flex min-w-0 w-full max-w-full flex-col overflow-hidden rounded-xl bg-background-base shadow-sm ring-1 ring-border-base/50"
    >
      {headerPosition === "top" ? header : null}
      {children ? (
        <div
          className={cn(
            "scrollbar-hover relative w-full min-w-0 max-w-full overflow-auto",
            headerPosition === "top" ? "rounded-b-[inherit]" : "rounded-t-[inherit]",
            contentClassName,
          )}
        >
          {showGrid ? (
            <div
              className={cn(
                "relative h-full w-full overflow-hidden bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:24px_24px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]",
                headerPosition === "top" ? "rounded-b-[inherit]" : "rounded-t-[inherit]",
              )}
            >
              <div
                className={cn(
                  "relative z-10 h-full overflow-hidden",
                  headerPosition === "top" ? "rounded-b-[inherit]" : "rounded-t-[inherit]",
                  innerClassName,
                )}
              >
                {children}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "relative h-full overflow-hidden",
                headerPosition === "top" ? "rounded-b-[inherit]" : "rounded-t-[inherit]",
                innerClassName,
              )}
            >
              {children}
            </div>
          )}
        </div>
      ) : null}
      {headerPosition === "bottom" ? header : null}
    </div>
  )
}
