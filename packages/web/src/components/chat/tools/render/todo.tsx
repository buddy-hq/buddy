import { Checkbox, cn } from "@buddy/ui"

import { BasicTool } from "../../tools/basic-tool"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { isRecord, readNonEmptyString } from "../../tools/types"
import type { ToolPartProps, ToolState } from "../registry"

type TodoItem = {
  key: string
  content: string
  status: string
}

function readTodoItems(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index): TodoItem[] => {
    if (!isRecord(item)) return []

    const content = readNonEmptyString(item.content)
    if (!content) return []

    const status = readNonEmptyString(item.status) ?? "pending"
    return [
      {
        key: `${index}:${status}:${content}`,
        content,
        status,
      },
    ]
  })
}

function readTodos(state: ToolState): TodoItem[] {
  if (Array.isArray(state.metadata.todos)) {
    return readTodoItems(state.metadata.todos)
  }

  return readTodoItems(state.input.todos)
}

function todoIsComplete(status: string): boolean {
  return status === "completed"
}

function todoIsFinished(status: string): boolean {
  return status === "completed" || status === "cancelled"
}

function todoProgress(todos: TodoItem[]): string | undefined {
  if (todos.length === 0) return undefined

  const completed = todos.filter((todo) => todoIsComplete(todo.status)).length
  return `${completed}/${todos.length}`
}

function TodoCheckbox({ status }: { status: string }) {
  const inProgress = status === "in_progress"

  return (
    <span className="relative mt-px flex size-4 shrink-0 items-center justify-center">
      <Checkbox
        checked={todoIsComplete(status)}
        tabIndex={-1}
        aria-hidden
        aria-readonly="true"
        className={cn(
          "pointer-events-none",
          inProgress ? "border-border-interactive-base bg-surface-base" : undefined,
        )}
      />
      {inProgress ? (
        <span className="pointer-events-none absolute size-1.5 rounded-full bg-text-strong motion-safe:animate-pulse" />
      ) : null}
    </span>
  )
}

function TodoList({ todos }: { todos: TodoItem[] }) {
  return (
    <ul className="flex max-h-48 min-w-0 flex-col gap-1.5 overflow-y-auto py-2 pb-6">
      {todos.map((todo) => {
        const finished = todoIsFinished(todo.status)
        return (
          <li key={todo.key} className="flex min-w-0 items-start gap-2" data-state={todo.status}>
            <TodoCheckbox status={todo.status} />
            <span
              className={cn(
                "min-w-0 flex-1 break-words text-sm leading-normal transition-colors",
                finished ? "text-text-weak line-through" : "text-text-strong",
                todo.status === "pending" ? "opacity-[0.92]" : undefined,
              )}
            >
              {todo.content}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function renderTodoTool({ state, defaultOpen, icon, info }: ToolPartProps) {
  const todos = readTodos(state)
  const error = state.status === "error" ? (state.error ?? "") : ""
  const hasError = error.trim().length > 0
  return (
    <BasicTool
      icon={icon?.("size-3.5")}
      trigger={{
        title: info.title,
        subtitle: todoProgress(todos),
      }}
      status={state.status}
      defaultOpen={defaultOpen ?? true}
      hideDetails={todos.length === 0 && !hasError}
    >
      {todos.length > 0 ? <TodoList todos={todos} /> : null}
      {hasError ? <ToolErrorPanel error={error} /> : null}
    </BasicTool>
  )
}
