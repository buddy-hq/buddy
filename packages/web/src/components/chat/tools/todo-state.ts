import type { MessageWithParts } from "@/state/chat-types"

import { isChatToolPart } from "../utils/part-guards"
import { parseToolState } from "./parse-tool-state"
import { isRecord, readNonEmptyString } from "./types"
import type { ToolState } from "./registry"

export const TODO_WRITE_TOOL_ID = "todowrite"

export type TodoStatus = "in_progress" | "pending" | "completed" | "cancelled"

export type TodoItem = {
  key: string
  content: string
  status: TodoStatus
}

export type TodoSnapshot = {
  revision: string
  todos: TodoItem[]
  isCurrentTurn: boolean
}

export type TodoProgressState = "pending" | "in_progress" | "completed"

export type TodoProgress = {
  completedCount: number
  totalCount: number
  state: TodoProgressState
}

const STATUS_ALIASES = new Map<string, TodoStatus>(Object.entries({
  in_progress: "in_progress",
  "in-progress": "in_progress",
  inprogress: "in_progress",
  running: "in_progress",
  pending: "pending",
  todo: "pending",
  not_started: "pending",
  completed: "completed",
  complete: "completed",
  done: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  skipped: "cancelled",
}))

function normalizeStatus(status: string): TodoStatus {
  return STATUS_ALIASES.get(status.trim().toLowerCase()) ?? "pending"
}

export function readTodoItems<TValue>(value: TValue): TodoItem[] | undefined {
  if (!Array.isArray(value)) return undefined

  return value.flatMap((item, index): TodoItem[] => {
    if (!isRecord(item)) return []

    const content = readNonEmptyString(item.content)
    if (!content) return []

    const rawStatus = readNonEmptyString(item.status) ?? "pending"
    return [
      {
        key: `${index}:${content}`,
        content,
        status: normalizeStatus(rawStatus),
      },
    ]
  })
}

export function readTodosFromToolState(state: ToolState): TodoItem[] | undefined {
  const metadataTodos = readTodoItems(state.metadata.todos)
  if (metadataTodos) return metadataTodos
  return readTodoItems(state.input.todos)
}

export function todoProgress(todos: readonly TodoItem[]): TodoProgress {
  const completedCount = todos.filter((todo) => todo.status === "completed").length
  let state: TodoProgressState = "pending"
  if (todos.some((todo) => todo.status === "in_progress")) {
    state = "in_progress"
  } else if (
    todos.length > 0 &&
    todos.every((todo) => todo.status === "completed" || todo.status === "cancelled")
  ) {
    state = "completed"
  }

  return {
    completedCount,
    totalCount: todos.length,
    state,
  }
}

export function findLatestTodoSnapshot(input: {
  messages: readonly MessageWithParts[]
  revertMessageID?: string
}): TodoSnapshot | undefined {
  const latestVisibleUserMessageIndex = input.messages.findLastIndex(
    (message) =>
      message.info.role === "user" &&
      (!input.revertMessageID || message.info.id < input.revertMessageID),
  )

  for (let messageIndex = input.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = input.messages[messageIndex]
    if (!message) continue
    if (input.revertMessageID && message.info.id >= input.revertMessageID) continue

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex]
      if (!part || !isChatToolPart(part) || part.tool !== TODO_WRITE_TOOL_ID) continue

      const state = parseToolState(part)
      if (state.status === "error") continue

      const todos = readTodosFromToolState(state)
      if (!todos) continue
      return {
        revision: part.id,
        todos,
        isCurrentTurn: messageIndex > latestVisibleUserMessageIndex,
      }
    }
  }

  return undefined
}
