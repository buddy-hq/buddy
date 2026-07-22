import { describe, expect, test } from "bun:test"

import {
  TODO_DOCK_MODE_HIDDEN,
  TODO_DOCK_MODE_OPEN,
  TODO_DOCK_MODE_UNSEEN,
  reconcileTodoDockViewState,
  todoDockModeForScope,
  type TodoDockViewState,
} from "../src/components/prompt/todo-dock-state"

const SCOPE = "directory:session"

function reconcile(
  current: TodoDockViewState,
  input: { hasTodos: boolean; autoOpenBlocked?: boolean },
) {
  return reconcileTodoDockViewState({
    current,
    scope: SCOPE,
    hasTodos: input.hasTodos,
    autoOpenBlocked: input.autoOpenBlocked ?? false,
  })
}

describe("todo dock state", () => {
  test("opens the first non-empty todo lifecycle automatically", () => {
    const state = reconcile({}, { hasTodos: true })

    expect(todoDockModeForScope(state, SCOPE)).toBe(TODO_DOCK_MODE_OPEN)
  })

  test("does not displace a user-owned composer surface", () => {
    const state = reconcile({}, { hasTodos: true, autoOpenBlocked: true })

    expect(todoDockModeForScope(state, SCOPE)).toBe(TODO_DOCK_MODE_HIDDEN)
  })

  test("keeps the user's hidden override across later updates", () => {
    const hidden = { [SCOPE]: TODO_DOCK_MODE_HIDDEN } satisfies TodoDockViewState

    expect(reconcile(hidden, { hasTodos: true })).toBe(hidden)
  })

  test("clearing the list resets automatic opening for the next lifecycle", () => {
    const cleared = reconcile(
      { [SCOPE]: TODO_DOCK_MODE_HIDDEN },
      { hasTodos: false },
    )
    const reopened = reconcile(cleared, { hasTodos: true })

    expect(todoDockModeForScope(cleared, SCOPE)).toBe(TODO_DOCK_MODE_UNSEEN)
    expect(todoDockModeForScope(reopened, SCOPE)).toBe(TODO_DOCK_MODE_OPEN)
  })

  test("keeps visibility choices scoped to their sessions", () => {
    const state = { "other-session": TODO_DOCK_MODE_HIDDEN } satisfies TodoDockViewState

    expect(todoDockModeForScope(state, SCOPE)).toBe(TODO_DOCK_MODE_UNSEEN)
    expect(todoDockModeForScope(state, "other-session")).toBe(TODO_DOCK_MODE_HIDDEN)
  })
})
