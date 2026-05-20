import type { ReactNode } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Bot, BotMessageSquare, PhoneCall, XCircle } from "lucide-react"
import { cn } from "@buddy/ui"
import { TextShimmer } from "../../text-shimmer"
import { ToolErrorPanel } from "../../tool-error-panel"
import type { ToolIconRenderer } from "../../tool-registry-types"
import { TASK_CARD_TRANSITION } from "../task-motion"

export type SubagentCardStatus = "pending" | "running" | "completed" | "error"

const HANDOFF_COPY = "Handing off to a specialist..."
const ICON_CLS = "h-3.5 w-3.5 shrink-0"

type SubagentCardProps = {
  agentName?: string
  status: SubagentCardStatus
  onOpenSession?: () => void
  /** Activity text: shimmers when `activityActive`, static when done. */
  activityLine?: string
  activityActive?: boolean
  /** Dominant tool icon from the child session's tool activity. */
  activityIcon?: ToolIconRenderer
  /** Artifact content shown only in completed state. */
  children?: ReactNode
  error?: string
}

type HeaderAreaProps = {
  onClick?: () => void
  className: string
  children: ReactNode
}

function HeaderArea({ onClick, className, children }: HeaderAreaProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(className, "cursor-default transition-colors hover:bg-surface-weak/50")}
      >
        {children}
      </button>
    )
  }
  return <div className={className}>{children}</div>
}

type CardHeaderProps = {
  status: SubagentCardStatus
  displayName: string
  activityLine?: string
  activityActive?: boolean
  activityIcon?: ToolIconRenderer
}

function CardHeader({ status, displayName, activityLine, activityActive, activityIcon }: CardHeaderProps) {
  if (status === "pending") {
    return (
      <div className="flex items-center gap-2">
        <PhoneCall className={cn(ICON_CLS, "text-text-weaker")} />
        <TextShimmer text={HANDOFF_COPY} active className="text-sm text-text-base" />
      </div>
    )
  }

  if (status === "running") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        {activityIcon ? (
          <span className="shrink-0 text-text-weaker">{activityIcon(ICON_CLS)}</span>
        ) : (
          <Bot className={cn(ICON_CLS, "text-text-weaker")} />
        )}
        <TextShimmer
          text={activityLine ?? "Working..."}
          active={activityActive ?? true}
          className="min-w-0 flex-1 truncate text-[11px] text-text-weaker"
        />
        <Bot className={cn(ICON_CLS, "text-text-weaker")} />
        <span className="shrink-0 rounded bg-surface-weak px-1.5 py-0.5 text-[11px] font-medium text-text-weak">
          {displayName}
        </span>
      </div>
    )
  }

  if (status === "completed") {
    return (
      <div className="flex items-center gap-2">
        <BotMessageSquare className={cn(ICON_CLS, "text-icon-success-base")} />
        <span className="text-sm font-medium text-text-base">{displayName}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <XCircle className={cn(ICON_CLS, "text-icon-critical-base")} />
      <span className="text-sm font-medium text-text-base">{displayName}</span>
    </div>
  )
}

export function SubagentCard({
  agentName,
  status,
  onOpenSession,
  activityLine,
  activityActive,
  activityIcon,
  children,
  error,
}: SubagentCardProps) {
  const hasChildBody = status === "completed" && !!children
  const hasErrorBody = status === "error" && !!error
  const hasBody = hasChildBody || hasErrorBody
  const displayName = agentName ?? "Specialist"

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={TASK_CARD_TRANSITION}
      className="w-full overflow-hidden rounded-xl border border-border-base bg-surface-base"
    >
      <HeaderArea
        onClick={onOpenSession && status !== "pending" ? onOpenSession : undefined}
        className={cn(
          "w-full px-3 py-2.5 text-left",
          hasBody && "border-b border-border-weak-base",
        )}
      >
        <CardHeader
          status={status}
          displayName={displayName}
          activityLine={activityLine}
          activityActive={activityActive}
          activityIcon={activityIcon}
        />
      </HeaderArea>

      <AnimatePresence initial={false}>
        {hasChildBody ? (
          <motion.div
            key="completed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={TASK_CARD_TRANSITION}
            className="flex flex-col gap-1.5 p-2"
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {hasErrorBody ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={TASK_CARD_TRANSITION}
          >
            <ToolErrorPanel error={error} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
