import { useState, useRef, useEffect, type ReactNode } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { ChevronDown, ChevronUp } from "@/icons/app-icons"
import { cn } from "@buddy/ui"
import { ConwayGlider } from "../../conway-glider"
import { seedPhase } from "../../seed-phase"
import { ToolErrorPanel } from "../../tool-error-panel"
import { Markdown } from "@/components/markdown/Markdown"
import { TASK_CARD_ENTER_ANIMATE, TASK_CARD_TRANSITION, taskCardEnterInitial } from "../task-motion"
import { parseTString } from "../../types"

export type SubagentCardStatus = "pending" | "running" | "completed" | "error"

// No ellipsis: the glider carries liveness, so trailing dots would be a second,
// weaker indicator saying the same thing.
const STARTING_COPY = "Starting specialist"
const WORKING_COPY = "Working"
const DEFAULT_TASK_TITLE = "Delegated task"
/** The left column. Every status uses it, so titles line up down a fan-out. */
const GLYPH_CLS = "size-7 shrink-0"
const BREATH_DURATION_S = 3.6
const BREATH_PHASES = 6
const BREATH_PHASE_STEP_S = BREATH_DURATION_S / BREATH_PHASES

type SubagentCardProps = {
  taskTitle?: string
  status: SubagentCardStatus
  onOpenSession?: () => void
  /** Activity text for the live line beneath the task title. */
  activityLine?: string
  /** Structured file-tool activity (verb + file target). Takes precedence over `activityLine`. */
  activityContent?: ReactNode
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
  taskTitle: string
  activityLine?: string
  activityContent?: ReactNode
}

function CardHeader({ status, taskTitle, activityLine, activityContent }: CardHeaderProps) {
  if (status === "pending" || status === "running") {
    const startupPending = status === "pending"
    return (
      <div className="flex min-w-0 items-center gap-3">
        <ConwayGlider seed={taskTitle} className={cn(GLYPH_CLS, "text-icon-interactive-base")} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-base">{taskTitle}</p>
          <div className="mt-0.5 min-w-0">
            {activityContent ?? (
              <p className="min-w-0 truncate text-xs text-text-weaker">
                {startupPending ? STARTING_COPY : (activityLine ?? WORKING_COPY)}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* The same board, settled into a still life — so the terminal state keeps
          the board's footprint instead of dropping to a floating chip, and sits
          symmetric about both axes. Only the colour changes. */}
      <ConwayGlider
        pattern="still"
        className={cn(
          GLYPH_CLS,
          status === "completed" ? "text-icon-success-base" : "text-icon-critical-base",
        )}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-base">
        {taskTitle}
      </span>
    </div>
  )
}

export function SubagentCard({
  taskTitle,
  status,
  onOpenSession,
  activityLine,
  activityContent,
  children,
  error,
}: SubagentCardProps) {
  const hasChildBody = status === "completed" && !!children
  const hasErrorBody = status === "error" && !!error
  const hasBody = hasChildBody || hasErrorBody
  const displayTaskTitle = taskTitle ?? DEFAULT_TASK_TITLE
  const reducedMotion = useReducedMotion() === true
  const working = status === "pending" || status === "running"
  const childText = parseTString(children)

  return (
    <div
      data-component="subagent-card"
      className="relative w-full overflow-hidden rounded-xl bg-surface-base"
    >
      {/* The whole card breathes while the specialist is working, on its own
          seeded phase so a fan-out doesn't inhale in unison. */}
      {working && !reducedMotion ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-surface-raised-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0] }}
          transition={{
            duration: BREATH_DURATION_S,
            delay: seedPhase(displayTaskTitle, BREATH_PHASES) * BREATH_PHASE_STEP_S,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ) : null}

      <HeaderArea
        onClick={onOpenSession && status !== "pending" ? onOpenSession : undefined}
        className={cn(
          "relative w-full px-3.5 py-3 text-left",
          hasBody && "border-b border-border-weak-base",
        )}
      >
        <CardHeader
          status={status}
          taskTitle={displayTaskTitle}
          activityLine={activityLine}
          activityContent={activityContent}
        />
      </HeaderArea>

      <AnimatePresence initial={false}>
        {hasChildBody ? (
          <motion.div
            key="completed"
            data-component="subagent-card-completed-body"
            initial={taskCardEnterInitial(reducedMotion)}
            animate={TASK_CARD_ENTER_ANIMATE}
            transition={TASK_CARD_TRANSITION}
            className="flex flex-col"
          >
            {childText !== undefined ? <ExpandableMarkdown text={childText} /> : children}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {hasErrorBody ? (
          <motion.div
            key="error"
            data-component="subagent-card-error-body"
            initial={taskCardEnterInitial(reducedMotion)}
            animate={TASK_CARD_ENTER_ANIMATE}
            transition={TASK_CARD_TRANSITION}
          >
            <ToolErrorPanel error={error} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
