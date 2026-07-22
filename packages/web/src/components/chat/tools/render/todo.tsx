import { TodoList } from "../todo-list"
import { readTodosFromToolState } from "../todo-state"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import type { ToolPartProps } from "../registry"

import "@/components/prompt/composer-surfaces.css"
export function renderTodoTool({ state }: ToolPartProps) {
  const todos = readTodosFromToolState(state) ?? []
  const error = state.status === "error" ? (state.error ?? "") : ""
  const hasError = error.trim().length > 0

  if (todos.length === 0 && !hasError) return null

  return (
    <div className="composer-surface composer-grain relative min-w-0 w-full max-w-full border border-border-weak-base/30 p-4 shadow-md">
      {todos.length > 0 ? (
        <div className="composer-scroll-hover max-h-48 overflow-y-auto pr-1">
          <TodoList
            todos={todos}
            turnActive={state.status === "pending" || state.status === "running"}
          />
        </div>
      ) : null}

      {hasError ? <ToolErrorPanel error={error} /> : null}
    </div>
  )
}
