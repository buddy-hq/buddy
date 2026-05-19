import { useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent, ChevronRightIcon } from "@buddy/ui"
import { ToolStatusIndicator } from "../tools/tool-header"
import { MOTION_SNAPPY } from "../tools/tool-motion"
import { TextShimmer } from "../tools/text-shimmer"
import { ToolRowAction, ToolRowSubject, ToolRowArg } from "../tools/tool-row"
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

  return (
    <Collapsible
      open={open}
      onOpenChange={(value) => {
        if (running) return
        setOpen(value)
      }}
      className="min-w-0 w-full max-w-full"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-w-0 w-full max-w-full items-center gap-1.5 text-left"
        >
          {icon ? <span className="shrink-0 text-text-weaker">{icon}</span> : null}
          {isTriggerTitle(trigger) ? (
            <>
              <ToolRowAction>
                <TextShimmer text={trigger.title} active={running} />
              </ToolRowAction>
              {trigger.subtitle && !running ? (
                <ToolRowSubject>{trigger.subtitle}</ToolRowSubject>
              ) : null}
              {!running && trigger.args?.map((arg) => <ToolRowArg key={arg}>{arg}</ToolRowArg>)}
              {!running && trigger.action}
              {trigger.trailing}
            </>
          ) : (
            trigger
          )}
          {!hideStatus && status ? <ToolStatusIndicator status={status} /> : null}
          {!hideDetails && !running && children ? (
            <motion.div
              animate={{ rotate: open ? 90 : 0 }}
              transition={MOTION_SNAPPY}
              className="ml-auto"
            >
              <ChevronRightIcon className="h-3 w-3 shrink-0 text-text-weaker group-hover:text-text-weak" />
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
