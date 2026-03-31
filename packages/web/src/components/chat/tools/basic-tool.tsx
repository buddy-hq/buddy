import { useState, useEffect, type ReactNode } from "react"
import { motion } from "motion/react"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  ChevronRightIcon,
  cn,
} from "@buddy/ui"
import { ToolStatusBadge } from "../tools/tool-header"
import type { ToolState } from "../tools/registry"

export interface BasicToolTrigger {
  title: string
  subtitle?: string
  args?: string[]
  action?: ReactNode
  trailing?: ReactNode
}

export interface BasicToolProps {
  icon?: ReactNode
  trigger: BasicToolTrigger | ReactNode
  status?: ToolState["status"]
  hideStatus?: boolean
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
  hideStatus = false,
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
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 w-full max-w-full">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 w-full max-w-full items-start gap-2 py-1 text-left"
        >
          {icon ? <span className="shrink-0 text-text-weak">{icon}</span> : null}
          {isTriggerTitle(trigger) ? (
            <>
              <span
                className={cn(
                  "min-w-0 whitespace-normal break-words text-xs font-medium text-text-weak",
                  running && "animate-pulse",
                )}
              >
                {trigger.title}
              </span>
              {trigger.subtitle && !running ? (
                <span className="min-w-0 flex-1 truncate text-xs text-text-weak/50">
                  {trigger.subtitle}
                </span>
              ) : null}
              {trigger.args?.map((arg) => (
                <span
                  key={arg}
                  className="rounded bg-surface-weak/60 px-1 py-px text-[11px] text-text-weak/50"
                >
                  {arg}
                </span>
              ))}
              {trigger.action}
              {trigger.trailing}
            </>
          ) : (
            trigger
          )}
          {!hideStatus && status ? <ToolStatusBadge status={status} /> : null}
          {!hideDetails && !running && children ? (
            <motion.div
              animate={{ rotate: open ? 90 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
              className="ml-auto"
            >
              <ChevronRightIcon className="h-3 w-3 shrink-0 text-text-weak/50 group-hover:text-text-weak" />
            </motion.div>
          ) : null}
        </button>
      </CollapsibleTrigger>
      {children ? (
        hideDetails ? (
          <div className="mt-2 min-w-0 w-full max-w-full pl-3">{children}</div>
        ) : (
          <CollapsibleContent className="min-w-0 w-full max-w-full">
            <div className="mt-2 min-w-0 w-full max-w-full pl-3">{children}</div>
          </CollapsibleContent>
        )
      ) : null}
    </Collapsible>
  )
}
