import { cn } from "@buddy/ui"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import {
  restingItemIcon,
  SECTION_ORDER,
  STATUS_META,
} from "@/components/chat/tools/todo-status-meta"
import type { TodoItem, TodoStatus } from "@/components/chat/tools/todo-state"
import { language } from "@/context/language"

import "@/components/chat/tools/render/todo-canvas.css"

export type TodoDockView = "list" | "board"

const CARD_SPRING = {
  type: "spring",
  stiffness: 460,
  damping: 38,
  mass: 0.8,
} as const

/**
 * Board columns kept stable so cards visibly travel between them, ordered as a
 * left-to-right lifecycle: To-do → Doing → Done.
 */
const BOARD_PRIMARY_COLUMNS: readonly TodoStatus[] = ["pending", "in_progress", "completed"]

type SectionGroup = { status: TodoStatus; items: TodoItem[] }

function groupTodos(todos: readonly TodoItem[]): SectionGroup[] {
  return SECTION_ORDER.map((status) => ({
    status,
    items: todos.filter((todo) => todo.status === status),
  }))
}

/**
 * Item icon that pops in when a todo first lands in its status. Because rows
 * remount when they change status (they move to a different section/column),
 * this mount animation fires exactly on a status change — e.g. the check pops
 * the moment a task completes.
 */
function TodoStatusIcon(props: {
  status: TodoStatus
  turnActive: boolean
  reduceMotion: boolean
  className?: string
}) {
  const meta = STATUS_META[props.status]
  const spinning = meta.spinItem && props.turnActive
  const Icon = meta.spinItem && !props.turnActive ? restingItemIcon(props.status) : meta.ItemIcon

  return (
    <motion.span
      className="flex"
      initial={props.reduceMotion ? false : { scale: 0.35, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={CARD_SPRING}
    >
      <Icon
        className={cn(
          "shrink-0",
          meta.accent,
          spinning && "motion-safe:animate-spin",
          props.className,
        )}
      />
    </motion.span>
  )
}

/**
 * Todo text. `strike` renders a real multiline-correct line-through (the
 * `.todo-strike` class draws itself in on mount). The list uses it for
 * done/cancelled items; the board never strikes — it only mutes the colour.
 */
function TodoLabel(props: { content: string; strike: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "break-words transition-colors duration-300",
        props.strike && "todo-strike",
        props.className,
      )}
    >
      {props.content}
    </span>
  )
}

// ─── Animated list view ──────────────────────────────────────────────────────

function TodoListRow(props: { todo: TodoItem; turnActive: boolean; reduceMotion: boolean }) {
  const meta = STATUS_META[props.todo.status]

  return (
    <motion.li
      layout={props.reduceMotion ? false : "position"}
      layoutId={props.reduceMotion ? undefined : `list:${props.todo.key}`}
      initial={false}
      transition={CARD_SPRING}
      className={cn(
        "flex items-start gap-2 py-0.5 transition-opacity duration-300",
        // Done / cancelled items recede so the live work reads first.
        meta.isDone && "opacity-65",
      )}
      data-state={props.todo.status}
    >
      <span className="mt-px flex shrink-0 items-center justify-center">
        <TodoStatusIcon
          status={props.todo.status}
          turnActive={props.turnActive}
          reduceMotion={props.reduceMotion}
          className="size-3"
        />
      </span>
      <TodoLabel
        content={props.todo.content}
        strike={meta.isDone}
        className={cn("min-w-0 flex-1 text-[13px] leading-5", meta.itemText)}
      />
    </motion.li>
  )
}

function TodoListSection(props: {
  status: TodoStatus
  items: TodoItem[]
  turnActive: boolean
  reduceMotion: boolean
}) {
  const meta = STATUS_META[props.status]
  const { TitleIcon } = meta

  return (
    <motion.section
      layout={props.reduceMotion ? false : "position"}
      transition={CARD_SPRING}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 px-0.5">
        <TitleIcon className={cn("size-3 shrink-0", meta.accent)} />
        <h4
          className={cn(
            "todo-canvas-heading text-xs font-bold uppercase leading-4 tracking-wide whitespace-nowrap",
            meta.accent,
          )}
        >
          {language.t(meta.labelKey)} ({props.items.length})
        </h4>
      </div>

      <ul className="flex flex-col gap-1 pl-5">
        {props.items.map((todo) => (
          <TodoListRow
            key={todo.key}
            todo={todo}
            turnActive={props.turnActive}
            reduceMotion={props.reduceMotion}
          />
        ))}
      </ul>
    </motion.section>
  )
}

export function TodoDockListView(props: { todos: TodoItem[]; turnActive: boolean }) {
  const reduceMotion = useReducedMotion() === true
  const sections = groupTodos(props.todos).filter((section) => section.items.length > 0)

  return (
    <LayoutGroup id="todo-dock-list">
      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <TodoListSection
            key={section.status}
            status={section.status}
            items={section.items}
            turnActive={props.turnActive}
            reduceMotion={reduceMotion}
          />
        ))}
      </div>
    </LayoutGroup>
  )
}

// ─── Animated kanban board view ───────────────────────────────────────────────

function TodoBoardCard(props: { todo: TodoItem; turnActive: boolean; reduceMotion: boolean }) {
  const meta = STATUS_META[props.todo.status]
  const labelRef = useRef<HTMLSpanElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [truncated, setTruncated] = useState(false)

  // Only cards whose clamped label actually overflows advertise the expand
  // affordance. Skip while expanded (the clamp is off, so nothing overflows —
  // we keep the last measured value so the collapse control stays live). The
  // observer re-measures when the viewport height crosses a clamp breakpoint.
  useEffect(() => {
    if (expanded) return
    const el = labelRef.current
    if (!el) return
    const measure = () => setTruncated(el.scrollHeight - el.clientHeight > 1)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [props.todo.content, expanded])

  const interactive = truncated || expanded
  const toggle = () => {
    if (interactive) setExpanded((prev) => !prev)
  }

  return (
    <motion.li
      layout={!props.reduceMotion}
      layoutId={props.reduceMotion ? undefined : `board:${props.todo.key}`}
      initial={false}
      transition={CARD_SPRING}
      data-state={props.todo.status}
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border-weak-base/40 bg-surface-base/60 px-2.5 py-2 shadow-sm [@media(max-height:640px)]:py-1.5",
        meta.isDone && "opacity-80",
        interactive && "cursor-pointer hover:border-border-base",
      )}
      onClick={interactive ? toggle : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? expanded : undefined}
      // Full text on hover for a truncated card, without expanding it.
      title={truncated && !expanded ? props.todo.content : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                toggle()
              }
            }
          : undefined
      }
    >
      <span className="mt-px flex shrink-0 items-center justify-center">
        <TodoStatusIcon
          status={props.todo.status}
          turnActive={props.turnActive}
          reduceMotion={props.reduceMotion}
          className="size-3.5"
        />
      </span>
      {/* Long tasks cap at three lines (fewer as the viewport shortens), then
          ellipsize — click to expand the full text in place. */}
      <span
        ref={labelRef}
        className={cn(
          "min-w-0 flex-1 break-words text-xs leading-4 transition-colors duration-300",
          !expanded &&
            "line-clamp-3 [@media(max-height:640px)_and_(min-height:481px)]:line-clamp-2 [@media(max-height:480px)]:line-clamp-1",
          meta.itemText,
        )}
      >
        {props.todo.content}
      </span>
    </motion.li>
  )
}

function TodoBoardColumn(props: {
  status: TodoStatus
  items: TodoItem[]
  turnActive: boolean
  reduceMotion: boolean
}) {
  const meta = STATUS_META[props.status]
  const { TitleIcon } = meta

  return (
    <motion.section
      layout={props.reduceMotion ? false : "position"}
      transition={CARD_SPRING}
      className="flex min-h-0 min-w-[9.5rem] flex-1 flex-col gap-2"
      data-column={props.status}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-0.5">
        <TitleIcon className={cn("size-3 shrink-0", meta.accent)} />
        <h4
          className={cn(
            "todo-canvas-heading text-[11px] font-bold uppercase leading-4 tracking-wide whitespace-nowrap",
            meta.accent,
          )}
        >
          {language.t(meta.labelKey)} ({props.items.length})
        </h4>
      </div>

      <ul className="composer-scroll-hover flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl bg-surface-inset-base/40 p-1.5">
        {props.items.map((todo) => (
          <TodoBoardCard
            key={todo.key}
            todo={todo}
            turnActive={props.turnActive}
            reduceMotion={props.reduceMotion}
          />
        ))}
        {props.items.length === 0 ? (
          <li className="flex flex-1 items-center justify-center py-2 text-[11px] text-text-weaker">
            —
          </li>
        ) : null}
      </ul>
    </motion.section>
  )
}

export function TodoDockBoardView(props: { todos: TodoItem[]; turnActive: boolean }) {
  const reduceMotion = useReducedMotion() === true
  const grouped = groupTodos(props.todos)
  const byStatus = new Map(grouped.map((group) => [group.status, group.items]))
  const cancelled = byStatus.get("cancelled") ?? []
  const columns: TodoStatus[] =
    cancelled.length > 0 ? [...BOARD_PRIMARY_COLUMNS, "cancelled"] : [...BOARD_PRIMARY_COLUMNS]

  return (
    <LayoutGroup id="todo-dock-board">
      <div className="flex min-h-0 w-full flex-1 items-stretch gap-2.5 overflow-x-auto p-4 [@media(max-height:640px)]:px-3 [@media(max-height:640px)]:py-2">
        {columns.map((status) => (
          <TodoBoardColumn
            key={status}
            status={status}
            items={byStatus.get(status) ?? []}
            turnActive={props.turnActive}
            reduceMotion={reduceMotion}
          />
        ))}
      </div>
    </LayoutGroup>
  )
}
