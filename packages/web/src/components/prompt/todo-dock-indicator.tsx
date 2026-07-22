import { cn } from "@buddy/ui"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import type { TodoItem, TodoProgressState } from "@/components/chat/tools/todo-state"
import { todoProgress } from "@/components/chat/tools/todo-state"
import { CheckmarkCircle01, ListTodo, Loader2Icon, type AppIcon } from "@/icons/app-icons"

const TODO_INDICATOR_TRANSITION = {
  duration: 0.16,
  ease: [0.23, 1, 0.32, 1],
} as const

export const TODO_STATUS_AFFORDANCE_DURATION_MS = 2_500
export const TODO_STATUS_AFFORDANCE_DEBOUNCE_MS = 180

const TODO_INDICATOR_COLOR = {
  pending: "text-current",
  in_progress: "text-text-warning-base",
  completed: "text-text-success-base",
} satisfies Record<TodoProgressState, string>

function todoIndicatorIcon(state: TodoProgressState): AppIcon {
  if (state === "completed") return CheckmarkCircle01
  if (state === "in_progress") return Loader2Icon
  return ListTodo
}

type TodoDockIndicatorProps = {
  revision: string
  todos: readonly TodoItem[]
  turnActive: boolean
  isCurrentTurn: boolean
  selected: boolean
  statusDurationMs?: number
  statusDebounceMs?: number
}

function useTransientTodoStatus(props: {
  revision: string
  turnActive: boolean
  isCurrentTurn: boolean
  state: TodoProgressState
  durationMs: number
  debounceMs: number
}): TodoProgressState | undefined {
  const [visibleState, setVisibleState] = useState<TodoProgressState>()
  const latestStateRef = useRef(props.state)
  const announcedRevisionRef = useRef<string | undefined>(
    props.turnActive && props.isCurrentTurn ? undefined : props.revision,
  )
  latestStateRef.current = props.state

  useEffect(() => {
    if (!props.turnActive || !props.isCurrentTurn) {
      announcedRevisionRef.current = props.revision
      setVisibleState(undefined)
      return
    }
    if (announcedRevisionRef.current === props.revision) return

    let expirationTimeout: number | undefined
    const debounceTimeout = window.setTimeout(() => {
      announcedRevisionRef.current = props.revision
      setVisibleState(latestStateRef.current)
      expirationTimeout = window.setTimeout(() => {
        setVisibleState(undefined)
      }, props.durationMs)
    }, props.debounceMs)

    return () => {
      window.clearTimeout(debounceTimeout)
      if (expirationTimeout !== undefined) {
        window.clearTimeout(expirationTimeout)
      }
    }
  }, [props.debounceMs, props.durationMs, props.isCurrentTurn, props.revision, props.turnActive])

  return props.turnActive && props.isCurrentTurn ? visibleState : undefined
}

export function TodoDockIndicator(props: TodoDockIndicatorProps) {
  const reduceMotion = useReducedMotion() === true
  const progress = todoProgress(props.todos)
  const visibleState = useTransientTodoStatus({
    revision: props.revision,
    turnActive: props.turnActive,
    isCurrentTurn: props.isCurrentTurn,
    state: progress.state,
    durationMs: props.statusDurationMs ?? TODO_STATUS_AFFORDANCE_DURATION_MS,
    debounceMs: props.statusDebounceMs ?? TODO_STATUS_AFFORDANCE_DEBOUNCE_MS,
  })
  const Icon = todoIndicatorIcon(visibleState ?? "pending")
  const hidden = reduceMotion ? { opacity: 0 } : { opacity: 0, transform: "scale(0.9)" }
  const visible = reduceMotion ? { opacity: 1 } : { opacity: 1, transform: "scale(1)" }

  if (!visibleState) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex size-3.5 items-center justify-center"
        data-todo-indicator-state="idle"
      >
        <ListTodo className="size-3.5" />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className="inline-grid size-3.5 place-items-center"
      data-todo-indicator-state={visibleState}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={props.revision}
          className="flex [grid-area:1/1]"
          initial={hidden}
          animate={visible}
          exit={hidden}
          transition={TODO_INDICATOR_TRANSITION}
        >
          <Icon
            className={cn(
              "size-3.5",
              props.selected ? "text-current" : TODO_INDICATOR_COLOR[visibleState],
              visibleState === "in_progress" && "motion-safe:animate-spin",
            )}
          />
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
