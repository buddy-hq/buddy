import { cn } from "@buddy/ui"
import { AnimatePresence, motion } from "motion/react"
import { XCircleIcon } from "lucide-react"
import { language } from "@/context/language"
import { MOTION_SNAPPY } from "./tool-motion"
import { TextShimmer } from "./text-shimmer"
import type { ToolInfo, ToolState } from "./registry"

interface ToolHeaderProps {
  info: ToolInfo
  status: ToolState["status"]
  running: boolean
}

/**
 * Unified status indicator for all tool renderers.
 *
 * - `pending` / `running`: nothing — the TextShimmer on the title is the indicator
 * - `completed`: nothing — absence of shimmer is sufficient
 * - `error`: red XCircleIcon with pop-in spring
 */
export function ToolStatusIndicator({ status }: { status: ToolState["status"] }) {
  const isError = status === "error"

  return (
    <AnimatePresence mode="wait">
      {isError ? (
        <motion.span
          key="error"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={MOTION_SNAPPY}
          className="inline-flex shrink-0"
          title={language.t("chatTools.status.error")}
        >
          <XCircleIcon className="size-3 text-icon-critical-base" />
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}

/** @deprecated Use `ToolStatusIndicator` instead */
export const ToolStatusBadge = ToolStatusIndicator

export function ToolHeader({ info, status, running }: ToolHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "text-xs font-medium",
          status === "error" ? "text-icon-critical-base" : "text-text-weak",
        )}
      >
        <TextShimmer text={info.title} active={running} />
      </span>
      {info.subtitle && !running ? (
        <span className="min-w-0 truncate text-xs text-text-weaker">{info.subtitle}</span>
      ) : null}
      {info.detail && !running ? (
        <span className="min-w-0 truncate text-xs text-text-weaker">{info.detail}</span>
      ) : null}
      {!running &&
        info.args?.map((arg) => (
          <span
            key={arg}
            className="rounded bg-surface-weak px-1 py-px text-[11px] text-text-weaker"
          >
            {arg}
          </span>
        ))}
      <ToolStatusIndicator status={status} />
    </div>
  )
}
