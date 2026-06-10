import { useState, useRef, useEffect, type ReactNode } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Bot, BotMessageSquare, XCircle, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@buddy/ui"
import { TextShimmer } from "../../text-shimmer"
import { ToolErrorPanel } from "../../tool-error-panel"
import { Markdown } from "@/components/markdown/Markdown"
import type { ToolIconRenderer } from "../../tool-registry-types"
import { TASK_CARD_TRANSITION } from "../task-motion"

export type SubagentCardStatus = "pending" | "running" | "completed" | "error"

const STARTING_COPY = "Starting specialist..."
const WORKING_COPY = "Working..."
const DEFAULT_TASK_TITLE = "Delegated task"
const ICON_CLS = "h-3.5 w-3.5 shrink-0"

type SubagentCardProps = {
  agentName?: string
  taskTitle?: string
  status: SubagentCardStatus
  onOpenSession?: () => void
  /** Activity text: shimmers when `activityActive`, static when done. */
  activityLine?: string
  /** Structured file-tool activity (verb + file target). Takes precedence over `activityLine`. */
  activityContent?: ReactNode
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

function ExpandableMarkdown({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setExpanded(false)
    const node = contentRef.current
    if (!node) return

    const measure = () => {
      if (!contentRef.current) return
      setIsOverflowing(contentRef.current.scrollHeight > 300)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [text])

  return (
    <div className="relative flex flex-col">
      <motion.div
        initial={false}
        animate={{ height: !isOverflowing ? "auto" : expanded ? "auto" : "10vh" }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="overflow-hidden"
      >
        <div ref={contentRef}>
          <Markdown text={text} className="px-3 py-2.5 text-sm text-text-base" />
        </div>
      </motion.div>

      {(isOverflowing || expanded) && (
        <div className="mt-2 flex flex-col relative">
          {!expanded && (
            <div className="pointer-events-none absolute bottom-full left-0 right-0 h-16 bg-gradient-to-t from-surface-base to-transparent" />
          )}
          <div className="h-px w-full bg-border-weak-base" />
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center py-2 text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base rounded-b-xl"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  )
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
  taskTitle: string
  activityLine?: string
  activityContent?: ReactNode
  activityActive?: boolean
  activityIcon?: ToolIconRenderer
}

function CardHeader({
  status,
  displayName,
  taskTitle,
  activityLine,
  activityContent,
  activityActive,
  activityIcon,
}: CardHeaderProps) {
  if (status === "pending" || status === "running") {
    const startupPending = status === "pending"
    return (
      <div className="flex min-w-0 items-start gap-2">
        {activityIcon ? (
          <span className="mt-0.5 shrink-0 text-text-weaker">{activityIcon(ICON_CLS)}</span>
        ) : (
          <Bot className={cn(ICON_CLS, "mt-0.5 text-text-weaker")} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-base">{taskTitle}</p>
          <div className="mt-0.5 min-w-0">
            {activityContent ?? (
              <TextShimmer
                text={startupPending ? STARTING_COPY : (activityLine ?? WORKING_COPY)}
                active={startupPending || (activityActive ?? true)}
                className="block min-w-0 truncate text-[11px] text-text-weaker"
              />
            )}
          </div>
        </div>
        <span className="shrink-0 rounded bg-surface-weak px-1.5 py-0.5 text-[11px] font-medium text-text-weak">
          {displayName}
        </span>
      </div>
    )
  }

  if (status === "completed") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <BotMessageSquare className={cn(ICON_CLS, "text-icon-success-base")} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-base">
          {taskTitle}
        </span>
        <span className="shrink-0 text-xs text-text-weak">{displayName}</span>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <XCircle className={cn(ICON_CLS, "text-icon-critical-base")} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-base">
        {taskTitle}
      </span>
      <span className="shrink-0 text-xs text-text-weak">{displayName}</span>
    </div>
  )
}

export function SubagentCard({
  agentName,
  taskTitle,
  status,
  onOpenSession,
  activityLine,
  activityContent,
  activityActive,
  activityIcon,
  children,
  error,
}: SubagentCardProps) {
  const hasChildBody = status === "completed" && !!children
  const hasErrorBody = status === "error" && !!error
  const hasBody = hasChildBody || hasErrorBody
  const displayName = agentName ?? "Specialist"
  const displayTaskTitle = taskTitle ?? DEFAULT_TASK_TITLE

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
          taskTitle={displayTaskTitle}
          activityLine={activityLine}
          activityContent={activityContent}
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
            className="flex flex-col"
          >
            {typeof children === "string" ? <ExpandableMarkdown text={children} /> : children}
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
