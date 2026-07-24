import { create } from "zustand"

/**
 * Durable UI state for right-workspace drawers.
 *
 * Drawers are deliberately not kept alive: they are directory-scoped views with live queries, and
 * mounting them while hidden means every notebook fetches and polls drawer data for chats the user
 * is not in. They therefore unmount on every chat switch — including a switch that reopens the same
 * drawer — and lose tree expansion and scroll.
 *
 * This store holds those small serializable values so the drawer comes back where the user left it.
 * The listings themselves come back from the query cache; nothing here caches data.
 */

export const WORKSPACE_DRAWER_UI_EXPLORER = "explorer"

type WorkspaceDrawerUiKey = string

type WorkspaceDrawerUiState = {
  scrollTop?: number
  expandedPaths?: string[]
}

type WorkspaceDrawerUiStateStore = {
  byKey: Record<WorkspaceDrawerUiKey, WorkspaceDrawerUiState>
  read: (key: WorkspaceDrawerUiKey) => WorkspaceDrawerUiState | undefined
  write: (key: WorkspaceDrawerUiKey, state: WorkspaceDrawerUiState) => void
  clearDirectory: (directory: string) => void
}

export function workspaceDrawerUiKey(input: { directory: string; drawer: string }): string {
  return `${input.directory}::${input.drawer}`
}

export const useWorkspaceDrawerUiState = create<WorkspaceDrawerUiStateStore>((set, get) => ({
  byKey: {},
  read: (key) => get().byKey[key],
  write: (key, state) =>
    set((current) => ({
      byKey: { ...current.byKey, [key]: { ...current.byKey[key], ...state } },
    })),
  clearDirectory: (directory) =>
    set((current) => {
      const prefix = `${directory}::`
      const remaining = Object.fromEntries(
        Object.entries(current.byKey).filter(([key]) => !key.startsWith(prefix)),
      )
      return { byKey: remaining }
    }),
}))

export function readWorkspaceDrawerUiState(
  key: WorkspaceDrawerUiKey,
): WorkspaceDrawerUiState | undefined {
  return useWorkspaceDrawerUiState.getState().read(key)
}

export function writeWorkspaceDrawerUiState(
  key: WorkspaceDrawerUiKey,
  state: WorkspaceDrawerUiState,
): void {
  useWorkspaceDrawerUiState.getState().write(key, state)
}
