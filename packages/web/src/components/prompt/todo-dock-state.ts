export const TODO_DOCK_MODE_UNSEEN = "unseen"
export const TODO_DOCK_MODE_OPEN = "open"
export const TODO_DOCK_MODE_HIDDEN = "hidden"

export type TodoDockMode =
  | typeof TODO_DOCK_MODE_UNSEEN
  | typeof TODO_DOCK_MODE_OPEN
  | typeof TODO_DOCK_MODE_HIDDEN

export type TodoDockViewState = Readonly<Record<string, TodoDockMode>>

export function todoDockModeForScope(state: TodoDockViewState, scope: string): TodoDockMode {
  return state[scope] ?? TODO_DOCK_MODE_UNSEEN
}

export function resetTodoDockAfterTurn(
  current: TodoDockViewState,
  scope: string,
): TodoDockViewState {
  if (todoDockModeForScope(current, scope) !== TODO_DOCK_MODE_OPEN) return current
  return { ...current, [scope]: TODO_DOCK_MODE_UNSEEN }
}

export function reconcileTodoDockViewState(input: {
  current: TodoDockViewState
  scope: string
  hasTodos: boolean
  autoOpenBlocked: boolean
}): TodoDockViewState {
  const currentMode = todoDockModeForScope(input.current, input.scope)

  if (!input.hasTodos) {
    if (currentMode === TODO_DOCK_MODE_UNSEEN) return input.current
    return { ...input.current, [input.scope]: TODO_DOCK_MODE_UNSEEN }
  }

  if (currentMode !== TODO_DOCK_MODE_UNSEEN) return input.current

  return {
    ...input.current,
    [input.scope]: input.autoOpenBlocked ? TODO_DOCK_MODE_HIDDEN : TODO_DOCK_MODE_OPEN,
  }
}
