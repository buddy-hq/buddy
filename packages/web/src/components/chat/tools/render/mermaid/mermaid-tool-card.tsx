import type { ToolPartProps } from "../../registry"
import { ToolStatusBadge } from "../../tool-header"
import { cn } from "@buddy/ui"

type MermaidToolCardProps = {
  title: string
  diagramType?: string
  status?: ToolPartProps["state"]["status"]
  hideStatus?: boolean
  actions?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
}

export function MermaidToolCard({
  title,
  diagramType,
  status,
  hideStatus = false,
  actions,
  children,
  contentClassName,
}: MermaidToolCardProps) {
  return (
    <div className="flex min-w-0 w-full max-w-full flex-col overflow-hidden rounded-xl bg-background-base shadow-sm">
      <div className="flex w-full items-center justify-between gap-4 border-b border-border-base/40 bg-surface-base px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {diagramType ? (
            <span className="shrink-0 rounded-md border border-border-base/60 bg-background-base px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-text-weak uppercase shadow-xs">
              {diagramType}
            </span>
          ) : null}
          <span className="min-w-0 truncate text-xs font-semibold text-text-base">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {!hideStatus && status ? (
            <div className="shrink-0">
              <ToolStatusBadge status={status} />
            </div>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className={cn("relative w-full min-w-0 max-w-full overflow-auto", contentClassName)}>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:24px_24px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]" />
          <div className="relative z-10">{children}</div>
        </div>
      ) : null}
    </div>
  )
}
