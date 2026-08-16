import { useCallback, useState } from "react"

import { browserLocalStorage } from "@/state/parse-external"
import type { TodoDockView } from "./todo-dock-views"

const STORAGE_KEY = "buddy.todoDock.view"

function parseTTodoDockView<TValue>(value: TValue): TodoDockView | undefined {
  if (value === "list" || value === "board") return value
  return undefined
}

function readStoredView(): TodoDockView {
  const storage = browserLocalStorage()
  if (!storage) return "list"
  try {
    return parseTTodoDockView(storage.getItem(STORAGE_KEY)) ?? "list"
  } catch {
    return "list"
  }
}

/**
 * The dock's list/board choice, persisted to localStorage so it survives
 * reloads and new sessions. Persistence is best-effort — storage failures
 * (private mode, disabled storage) fall back to in-memory state.
 */
export function useTodoDockView(): readonly [TodoDockView, (view: TodoDockView) => void] {
  const [view, setViewState] = useState<TodoDockView>(readStoredView)

  const setView = useCallback((next: TodoDockView) => {
    setViewState(next)
    const storage = browserLocalStorage()
    if (!storage) return
    try {
      storage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore persistence failures
    }
  }, [])

  return [view, setView] as const
}
