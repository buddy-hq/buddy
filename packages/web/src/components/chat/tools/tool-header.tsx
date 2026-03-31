import { cn } from "@buddy/ui"
import { AnimatePresence, motion } from "motion/react"
import { language } from "@/context/language"
import type { ToolInfo, ToolState } from "./registry"

interface ToolHeaderProps {
  info: ToolInfo
  status: ToolState["status"]
  running: boolean
}

function statusLabel(status: ToolState["status"]): string {
  if (status === "completed") return language.t("chatTools.status.completed")
  if (status === "running") return language.t("chatTools.status.running")
  if (status === "error") return language.t("chatTools.status.error")
  return language.t("chatTools.status.pending")
}

function statusDotColor(status: ToolState["status"]): string {
  if (status === "completed") return "bg-text-interactive-base/60"
  if (status === "error") return "bg-icon-critical-base/70"
  if (status === "running" || status === "pending") return "bg-text-weak/40"
  return "bg-text-weak/40"
}

export function ToolStatusBadge({ status }: { status: ToolState["status"] }) {
  const visible = status !== "running" && status !== "pending"

  return (
    <AnimatePresence>
      {visible ? (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 25, mass: 0.6 }}
          className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", statusDotColor(status))}
          title={statusLabel(status)}
        />
      ) : null}
    </AnimatePresence>
  )
}

export function ToolHeader({ info, status, running }: ToolHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("text-xs font-medium text-text-weak", running && "animate-pulse")}>
        {info.title}
      </span>
      {info.subtitle ? (
        <span className="min-w-0 truncate text-xs text-text-weak/50">{info.subtitle}</span>
      ) : null}
      {info.detail ? (
        <span className="min-w-0 truncate text-xs text-text-weak/50">{info.detail}</span>
      ) : null}
      {info.args?.map((arg) => (
        <span
          key={arg}
          className="rounded bg-surface-weak/60 px-1 py-px text-[11px] text-text-weak/50"
        >
          {arg}
        </span>
      ))}
      <ToolStatusBadge status={status} />
    </div>
  )
}
