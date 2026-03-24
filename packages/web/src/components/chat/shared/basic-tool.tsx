import { useState, useEffect, type ReactNode } from "react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  ChevronRightIcon,
  cn,
} from "@buddy/ui"
import { ToolStatusBadge } from "./tool-header"
import type { ToolState } from "../tools/registry"

export interface BasicToolTrigger {
  title: string
  subtitle?: string
  args?: string[]
  action?: ReactNode
}

export interface BasicToolProps {
  icon?: ReactNode
  trigger: BasicToolTrigger | ReactNode
  status?: ToolState["status"]
  defaultOpen?: boolean
  hideDetails?: boolean
  children?: ReactNode
}

function isTriggerTitle(val: unknown): val is BasicToolTrigger {
  return (
    typeof val === "object" &&
    val !== null &&
    "title" in val &&
    typeof (val as BasicToolTrigger).title === "string"
  )
}

export function BasicTool({
  icon,
  trigger,
  status,
  defaultOpen = false,
  hideDetails = false,
  children,
}: BasicToolProps) {
  const [open, setOpen] = useState(defaultOpen)
  const running = status === "pending" || status === "running"

  useEffect(() => {
    if (status === "error") setOpen(true)
  }, [status])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="w-full rounded-lg border border-border-base bg-surface-raised-base p-3"
    >
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {icon ? <span className="shrink-0 text-text-weak">{icon}</span> : null}
              {isTriggerTitle(trigger) ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    className={cn("text-sm font-medium text-text-base", running && "animate-pulse")}
                  >
                    {trigger.title}
                  </span>
                  {trigger.subtitle && !running ? (
                    <span className="truncate text-sm text-text-weak">{trigger.subtitle}</span>
                  ) : null}
                  {trigger.args?.map((arg) => (
                    <span
                      key={arg}
                      className="rounded bg-surface-weak px-1.5 py-0.5 text-xs text-text-weak"
                    >
                      {arg}
                    </span>
                  ))}
                  {trigger.action}
                </div>
              ) : (
                trigger
              )}
            </div>
            <div className="flex items-center gap-2">
              {status ? <ToolStatusBadge status={status} /> : null}
              {!hideDetails && !running && children ? (
                <ChevronRightIcon
                  className={cn(
                    "h-4 w-4 shrink-0 text-text-weak transition-transform",
                    open && "rotate-90",
                  )}
                />
              ) : null}
            </div>
          </div>
        </button>
      </CollapsibleTrigger>
      {children ? (
        hideDetails ? (
          <div className="mt-2">{children}</div>
        ) : (
          <CollapsibleContent>
            <div className="mt-2">{children}</div>
          </CollapsibleContent>
        )
      ) : null}
    </Collapsible>
  )
}
