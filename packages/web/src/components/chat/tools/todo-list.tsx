import { cn } from "@buddy/ui"

import { language } from "@/context/language"
import { Progress03 } from "@/icons/app-icons"

import { SECTION_ORDER, STATUS_META } from "./todo-status-meta"
import type { TodoItem, TodoStatus } from "./todo-state"

import "./render/todo-canvas.css"

function TodoSection(props: { status: TodoStatus; items: TodoItem[]; turnActive: boolean }) {
  const meta = STATUS_META[props.status]
  const { TitleIcon } = meta
  const spinning = meta.spinItem && props.turnActive
  const ItemIcon = meta.spinItem && !props.turnActive ? Progress03 : meta.ItemIcon

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        <TitleIcon className={cn("size-3 shrink-0", meta.accent)} />
        {/* Excalifont sits high in its em box; nudge ink down to meet the icon. em tracks font-size. */}
        <h4
          className={cn(
            "todo-canvas-heading translate-y-[0.08em] text-xs font-bold uppercase leading-4 tracking-wide whitespace-nowrap",
            meta.accent,
          )}
        >
          {language.t(meta.labelKey)} ({props.items.length})
        </h4>
      </div>

      <ul className="flex flex-col gap-1 pl-5">
        {props.items.map((todo) => (
          <li key={todo.key} className="flex items-start gap-2 py-0.5" data-state={todo.status}>
            <span className="mt-1 flex shrink-0 items-center justify-center">
              <ItemIcon
                className={cn(
                  "size-3 shrink-0",
                  meta.accent,
                  spinning && "motion-safe:animate-spin",
                )}
              />
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 break-words text-[13px] leading-5",
                meta.itemText,
                meta.isDone && "line-through decoration-text-weaker",
              )}
            >
              {todo.content}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TodoList(props: { todos: TodoItem[]; turnActive: boolean }) {
  const sections = SECTION_ORDER.map((status) => ({
    status,
    items: props.todos.filter((todo) => todo.status === status),
  })).filter((section) => section.items.length > 0)

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => (
        <TodoSection
          key={section.status}
          status={section.status}
          items={section.items}
          turnActive={props.turnActive}
        />
      ))}
    </div>
  )
}
