import type { MessageWithParts } from "@/state/chat-types"
import { createBeforeRevertFilter } from "@/state/session-revert"

import { isChatToolPart } from "../utils/part-guards"
import { parseToolState, readToolSummaryKind } from "./parse-tool-state"
import type { ToolState } from "./registry"

const UPDATE_PLAN_TOOL_KIND = "update-plan"

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

export function readTodosFromToolState(state: ToolState): TodoItem[] | undefined {
  return state.todos?.map((todo, index) => ({
    key: `${index}:${todo.text}`,
    content: todo.text,
    status: todo.status,
  }))
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
  transcriptComplete: boolean
}): TodoSnapshot | undefined {
  const isBeforeRevert = createBeforeRevertFilter({
    messages: input.messages,
    revertMessageID: input.revertMessageID,
    transcriptComplete: input.transcriptComplete,
  })
  const latestVisibleUserMessageIndex = input.messages.findLastIndex(
    (message) => message.info.role === "user" && isBeforeRevert(message),
  )

  for (let messageIndex = input.messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = input.messages[messageIndex]
    if (!message) continue
    if (!isBeforeRevert(message)) continue

    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex]
      if (!part || !isChatToolPart(part) || readToolSummaryKind(part) !== UPDATE_PLAN_TOOL_KIND) continue

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
