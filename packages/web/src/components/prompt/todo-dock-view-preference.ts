import { useCallback, useState } from "react"

import type { TodoDockView } from "./todo-dock-views"

const STORAGE_KEY = "buddy.todoDock.view"

function isTodoDockView(value: unknown): value is TodoDockView {
  return value === "list" || value === "board"
}

function readStoredView(): TodoDockView {
  if (typeof window === "undefined") return "list"
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isTodoDockView(stored) ? stored : "list"
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
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore persistence failures
    }
  }, [])

  return [view, setView] as const
}
