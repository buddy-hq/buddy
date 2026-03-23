import { Badge, cn } from "@buddy/ui"
import type { ToolInfo, ToolState } from "../tools/registry"

interface ToolHeaderProps {
  info: ToolInfo
  status: ToolState["status"]
  running: boolean
}

function statusLabel(status: ToolState["status"]): string {
  if (status === "completed") return "completed"
  if (status === "running") return "running"
  if (status === "error") return "error"
  return "pending"
}

function toolStatusTone(status: ToolState["status"]): string {
  if (status === "completed") {
    return "border-border-interactive-base/40 bg-surface-interactive-base/10 text-text-interactive-base"
  }
  if (status === "error") {
    return "border-border-critical-base/40 bg-surface-critical-base/10 text-icon-critical-base"
  }
  if (status === "running" || status === "pending") {
    return "border-border-base bg-surface-weak text-text-weak"
  }
  return "border-border-base bg-surface-weak text-text-weak"
}

export function ToolStatusBadge({ status }: { status: ToolState["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        toolStatusTone(status),
      )}
    >
      {statusLabel(status)}
    </Badge>
  )
}

export function ToolHeader({ info, status, running }: ToolHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={cn("text-sm font-medium text-text-base", running && "animate-pulse")}>
          {info.title}
        </span>
        {info.subtitle ? (
          <span className="truncate text-sm text-text-weak">{info.subtitle}</span>
        ) : null}
        {info.detail ? (
          <span className="truncate text-sm text-text-weak">{info.detail}</span>
        ) : null}
        {info.args?.map((arg) => (
          <span key={arg} className="rounded bg-surface-weak px-1.5 py-0.5 text-xs text-text-weak">
            {arg}
          </span>
        ))}
      </div>
      <ToolStatusBadge status={status} />
    </div>
  )
}
