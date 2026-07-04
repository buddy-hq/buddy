import { createStore, type StoreApi } from "zustand/vanilla"
import { getPlatform } from "@/context/platform"
import {
  BENCH_CHAT_LAYOUT_FLOATING,
  benchTargetKey,
  isSameBenchTarget,
  type BenchMode,
  type BenchModeRequest,
  type BenchTarget,
} from "@/lib/bench-navigation"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"

export const WORKSPACE_DRAWER_SOURCES = "sources"
export const WORKSPACE_DRAWER_SEARCH = "search"
export const WORKSPACE_DRAWER_PRACTICE = "practice"
export const WORKSPACE_DRAWER_CREATIONS = "creations"
export const WORKSPACE_DRAWER_BOARDS = "boards"
export const WORKSPACE_DRAWER_FILES = "files"
export const WORKSPACE_VISIBILITY_COLLAPSED = "collapsed"
export const WORKSPACE_VISIBILITY_EXPANDED = "expanded"
export const BENCH_ROUTE_STATUS_CLOSED = "closed"
export const BENCH_ROUTE_STATUS_OPEN = "open"
export const WORKSPACE_PENDING_KIND_NAVIGATION = "navigation"
export const WORKSPACE_PENDING_KIND_WORKSPACE_ONLY = "workspace-only"
export const WORKSPACE_HYDRATION_PENDING = "pending"
export const WORKSPACE_HYDRATION_READY = "ready"
export const WORKSPACE_HYDRATION_FAILED = "failed"
export const WORKSPACE_COMMAND_QUEUE_LIMIT = 64
export const DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER = WORKSPACE_DRAWER_SOURCES
export const DIRECTORY_WORKSPACE_PERSISTENCE_VERSION = 2
export const DIRECTORY_WORKSPACE_STORAGE_FILE = "buddy.directory-workspace.v2.dat"
const DIRECTORY_WORKSPACE_STORAGE_KEY_PREFIX = "directory-workspace:"

export type DrawerKind =
  | typeof WORKSPACE_DRAWER_SEARCH
  | typeof WORKSPACE_DRAWER_SOURCES
  | typeof WORKSPACE_DRAWER_PRACTICE
  | typeof WORKSPACE_DRAWER_CREATIONS
  | typeof WORKSPACE_DRAWER_BOARDS
  | typeof WORKSPACE_DRAWER_FILES

export type BenchRouteSnapshot =
  | { status: typeof BENCH_ROUTE_STATUS_CLOSED }
  | {
      status: typeof BENCH_ROUTE_STATUS_OPEN
      target: BenchTarget
      mode: BenchMode
    }

export type DockedWorkspaceState =
  | {
      visibility: typeof WORKSPACE_VISIBILITY_COLLAPSED
      drawer: null
    }
  | {
      visibility: typeof WORKSPACE_VISIBILITY_EXPANDED
      drawer: DrawerKind | null
    }

export type PersistedDirectoryWorkspaceState = {
  visibility: typeof WORKSPACE_VISIBILITY_COLLAPSED | typeof WORKSPACE_VISIBILITY_EXPANDED
  lastDrawer: DrawerKind
}

export type DirectoryWorkspacePersistenceStorage = {
  getItem(name: string): string | null | Promise<string | null>
  setItem(name: string, value: string): void | Promise<void>
  removeItem(name: string): void | Promise<void>
}

export type DirectoryWorkspacePersistenceReadResult =
  | {
      status: typeof WORKSPACE_HYDRATION_READY
      state: PersistedDirectoryWorkspaceState | null
    }
  | {
      status: typeof WORKSPACE_HYDRATION_FAILED
      state: null
      message: string
    }

type PersistedDirectoryWorkspacePayload = {
  version: typeof DIRECTORY_WORKSPACE_PERSISTENCE_VERSION
  state: PersistedDirectoryWorkspaceState
}

export type EffectiveBenchVisibility = "visible" | "parked" | "closed"

export type EffectiveWorkspaceProjection = {
  route: BenchRouteSnapshot
  dockedState: DockedWorkspaceState
  bench:
    | {
        visibility: "visible" | "parked"
        target: BenchTarget
        targetKey: string
        mode: BenchMode
      }
    | {
        visibility: "closed"
        target: null
        targetKey: null
        mode: null
      }
  drawer: DrawerKind | null
  renderedSurface:
    | "empty"
    | "docked-bench"
    | "floating-bench"
    | "parked-bench"
    | "drawer"
    | "drawer-over-bench"
  pending:
    | { status: "none" }
    | { status: "retained-previous"; commandID: string }
    | { status: "expected-route"; commandID: string }
    | { status: "workspace-only"; commandID: string }
}

export type PendingWorkspaceIntent =
  | {
      kind: typeof WORKSPACE_PENDING_KIND_NAVIGATION
      commandID: string
      attemptID: string
      previousProjection: EffectiveWorkspaceProjection
      expectedRoute: BenchRouteSnapshot
      workspaceCommit: DockedWorkspaceState
    }
  | {
      kind: typeof WORKSPACE_PENDING_KIND_WORKSPACE_ONLY
      commandID: string
      previousProjection: EffectiveWorkspaceProjection
      workspaceCommit: DockedWorkspaceState
    }

export type DirectoryWorkspaceProjectionState = {
  docked: DockedWorkspaceState
  lastDrawer: DrawerKind
}

type DirectoryWorkspaceInitialState = Partial<DirectoryWorkspaceProjectionState> & {
  hydration?: DirectoryWorkspaceHydrationState
}

export type DirectoryWorkspaceCommand =
  | { type: "present"; directory: string; target: BenchTarget; mode: BenchModeRequest }
  | { type: "close" }
  | { type: "set-mode"; mode: BenchMode }
  | { type: "reveal" }
  | { type: "collapse" }
  | { type: "open-drawer"; drawer: DrawerKind }
  | { type: "close-drawer" }

export type DirectoryWorkspaceCommandResult =
  | { outcome: "committed"; changed: boolean; projection: EffectiveWorkspaceProjection }
  | { outcome: "blocked"; reason: "leave_guard_blocked"; projection: EffectiveWorkspaceProjection }
  | {
      outcome: "failed"
      reason: "navigation_failed" | "context_sync_failed"
      projection: EffectiveWorkspaceProjection
    }
  | { outcome: "inactive"; reason: "session_inactive"; projection: EffectiveWorkspaceProjection }
  | { outcome: "superseded"; reason: "newer_command"; projection: EffectiveWorkspaceProjection }

export type DirectoryWorkspaceHydrationState =
  | { status: typeof WORKSPACE_HYDRATION_PENDING }
  | { status: typeof WORKSPACE_HYDRATION_READY }
  | { status: typeof WORKSPACE_HYDRATION_FAILED; message: string }

export type DirectoryWorkspaceStoreState = DirectoryWorkspaceProjectionState & {
  directory: string
  pendingIntent: PendingWorkspaceIntent | null
  hydration: DirectoryWorkspaceHydrationState
  setPendingIntent: (intent: PendingWorkspaceIntent) => void
  clearPendingIntent: (commandID: string) => void
  commitDockedState: (input: { commandID: string; docked: DockedWorkspaceState }) => void
  setHydrationReady: () => void
  setHydrationFailed: (message: string) => void
  finishHydration: (input: {
    docked: DockedWorkspaceState
    lastDrawer: DrawerKind
    hydration: DirectoryWorkspaceHydrationState
  }) => void
  setLastDrawer: (drawer: DrawerKind) => void
}

export type DirectoryWorkspaceStore = StoreApi<DirectoryWorkspaceStoreState>

function isSameBenchRouteSnapshot(left: BenchRouteSnapshot, right: BenchRouteSnapshot): boolean {
  if (left.status !== right.status) return false
  if (left.status === BENCH_ROUTE_STATUS_CLOSED || right.status === BENCH_ROUTE_STATUS_CLOSED) {
    return true
  }
  return left.mode === right.mode && isSameBenchTarget(left.target, right.target)
}

function normalizeDockedState(state: DockedWorkspaceState): DockedWorkspaceState {
  if (state.visibility === WORKSPACE_VISIBILITY_COLLAPSED) {
    return { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null }
  }
  return state
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isDrawerKind(value: unknown): value is DrawerKind {
  return (
    value === WORKSPACE_DRAWER_SEARCH ||
    value === WORKSPACE_DRAWER_SOURCES ||
    value === WORKSPACE_DRAWER_PRACTICE ||
    value === WORKSPACE_DRAWER_CREATIONS ||
    value === WORKSPACE_DRAWER_BOARDS ||
    value === WORKSPACE_DRAWER_FILES
  )
}

function isWorkspaceVisibility(
  value: unknown,
): value is PersistedDirectoryWorkspaceState["visibility"] {
  return value === WORKSPACE_VISIBILITY_COLLAPSED || value === WORKSPACE_VISIBILITY_EXPANDED
}

function storageKeyForDirectory(directory: string): string {
  return `${DIRECTORY_WORKSPACE_STORAGE_KEY_PREFIX}${encodeURIComponent(directory)}`
}

const memoryWorkspaceStorage = new Map<string, string>()

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  )
}

function discardStorageWriteResult(result: unknown): void | Promise<void> {
  if (isThenable(result)) {
    return Promise.resolve(result).then(() => undefined)
  }
  return undefined
}

function defaultDirectoryWorkspaceStorage(): DirectoryWorkspacePersistenceStorage {
  const platformStorage = getPlatform().storage?.(DIRECTORY_WORKSPACE_STORAGE_FILE)
  if (platformStorage) {
    return {
      getItem(name) {
        return platformStorage.getItem(name)
      },
      setItem(name, value) {
        return discardStorageWriteResult(platformStorage.setItem(name, value))
      },
      removeItem(name) {
        return discardStorageWriteResult(platformStorage.removeItem(name))
      },
    }
  }
  if (typeof localStorage !== "undefined") return localStorage
  return {
    getItem(name) {
      return memoryWorkspaceStorage.get(name) ?? null
    },
    setItem(name, value) {
      memoryWorkspaceStorage.set(name, value)
    },
    removeItem(name) {
      memoryWorkspaceStorage.delete(name)
    },
  }
}

function readPersistedDirectoryWorkspaceState(
  value: unknown,
): PersistedDirectoryWorkspaceState | undefined {
  if (!isRecord(value)) return undefined
  const visibility = value.visibility
  const lastDrawer = value.lastDrawer
  if (!isWorkspaceVisibility(visibility) || !isDrawerKind(lastDrawer)) return undefined
  return { visibility, lastDrawer }
}

function readPersistedDirectoryWorkspacePayload(
  value: unknown,
): PersistedDirectoryWorkspacePayload | undefined {
  if (!isRecord(value)) return undefined
  if (value.version !== DIRECTORY_WORKSPACE_PERSISTENCE_VERSION) return undefined
  const state = readPersistedDirectoryWorkspaceState(value.state)
  if (!state) return undefined
  return {
    version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
    state,
  }
}

export async function readPersistedDirectoryWorkspace(input: {
  directory: string
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<DirectoryWorkspacePersistenceReadResult> {
  const storage = input.storage ?? defaultDirectoryWorkspaceStorage()
  const key = storageKeyForDirectory(input.directory)
  let raw: string | null
  try {
    raw = await storage.getItem(key)
  } catch (error) {
    return {
      status: WORKSPACE_HYDRATION_FAILED,
      state: null,
      message: error instanceof Error ? error.message : "Workspace persistence read failed.",
    }
  }
  if (!raw) return { status: WORKSPACE_HYDRATION_READY, state: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return {
      status: WORKSPACE_HYDRATION_FAILED,
      state: null,
      message:
        error instanceof Error ? error.message : "Workspace persistence payload was invalid JSON.",
    }
  }

  const payload = readPersistedDirectoryWorkspacePayload(parsed)
  if (!payload) return { status: WORKSPACE_HYDRATION_READY, state: null }
  return { status: WORKSPACE_HYDRATION_READY, state: payload.state }
}

export async function writePersistedDirectoryWorkspace(input: {
  directory: string
  state: PersistedDirectoryWorkspaceState
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<void> {
  const storage = input.storage ?? defaultDirectoryWorkspaceStorage()
  const payload: PersistedDirectoryWorkspacePayload = {
    version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
    state: input.state,
  }
  await storage.setItem(storageKeyForDirectory(input.directory), JSON.stringify(payload))
}

export function persistedDirectoryWorkspaceStateFromStore(
  state: DirectoryWorkspaceProjectionState,
): PersistedDirectoryWorkspaceState {
  return {
    visibility: state.docked.visibility,
    lastDrawer: state.lastDrawer,
  }
}

function drawerForClosedRoute(state: DirectoryWorkspaceProjectionState): DrawerKind | null {
  if (state.docked.visibility === WORKSPACE_VISIBILITY_COLLAPSED) return null
  return state.docked.drawer ?? state.lastDrawer
}

function renderedSurfaceFor(input: {
  route: BenchRouteSnapshot
  docked: DockedWorkspaceState
  drawer: DrawerKind | null
}): EffectiveWorkspaceProjection["renderedSurface"] {
  if (input.route.status === BENCH_ROUTE_STATUS_CLOSED) {
    return input.drawer ? "drawer" : "empty"
  }
  if (input.route.mode === BENCH_CHAT_LAYOUT_FLOATING) return "floating-bench"
  if (input.docked.visibility === WORKSPACE_VISIBILITY_COLLAPSED) return "parked-bench"
  return input.drawer ? "drawer-over-bench" : "docked-bench"
}

function projectCommittedState(input: {
  route: BenchRouteSnapshot
  state: DirectoryWorkspaceProjectionState
  pending: EffectiveWorkspaceProjection["pending"]
}): EffectiveWorkspaceProjection {
  const dockedState = normalizeDockedState(input.state.docked)
  const drawer =
    input.route.status === BENCH_ROUTE_STATUS_CLOSED
      ? drawerForClosedRoute({ docked: dockedState, lastDrawer: input.state.lastDrawer })
      : input.route.mode === BENCH_CHAT_LAYOUT_FLOATING
        ? null
        : dockedState.visibility === WORKSPACE_VISIBILITY_EXPANDED
          ? dockedState.drawer
          : null

  if (input.route.status === BENCH_ROUTE_STATUS_CLOSED) {
    return {
      route: input.route,
      dockedState,
      bench: {
        visibility: "closed",
        target: null,
        targetKey: null,
        mode: null,
      },
      drawer,
      renderedSurface: renderedSurfaceFor({ route: input.route, docked: dockedState, drawer }),
      pending: input.pending,
    }
  }

  const visibility =
    input.route.mode === BENCH_CHAT_LAYOUT_FLOATING ||
    dockedState.visibility === WORKSPACE_VISIBILITY_EXPANDED
      ? "visible"
      : "parked"

  return {
    route: input.route,
    dockedState,
    bench: {
      visibility,
      target: input.route.target,
      targetKey: benchTargetKey(input.route.target),
      mode: input.route.mode,
    },
    drawer,
    renderedSurface: renderedSurfaceFor({ route: input.route, docked: dockedState, drawer }),
    pending: input.pending,
  }
}

export function effectiveWorkspaceProjection(
  route: BenchRouteSnapshot,
  committedState: DirectoryWorkspaceProjectionState,
  pendingIntent: PendingWorkspaceIntent | null,
): EffectiveWorkspaceProjection {
  if (!pendingIntent) {
    return projectCommittedState({
      route,
      state: committedState,
      pending: { status: "none" },
    })
  }

  if (pendingIntent.kind === WORKSPACE_PENDING_KIND_WORKSPACE_ONLY) {
    return projectCommittedState({
      route,
      state: {
        docked: pendingIntent.workspaceCommit,
        lastDrawer: committedState.lastDrawer,
      },
      pending: { status: "workspace-only", commandID: pendingIntent.commandID },
    })
  }

  if (!isSameBenchRouteSnapshot(route, pendingIntent.expectedRoute)) {
    return {
      ...pendingIntent.previousProjection,
      pending: { status: "retained-previous", commandID: pendingIntent.commandID },
    }
  }

  return projectCommittedState({
    route,
    state: {
      docked: pendingIntent.workspaceCommit,
      lastDrawer: committedState.lastDrawer,
    },
    pending: { status: "expected-route", commandID: pendingIntent.commandID },
  })
}

export function createCollapsedWorkspaceState(): DockedWorkspaceState {
  return { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null }
}

export function createExpandedWorkspaceState(drawer: DrawerKind | null): DockedWorkspaceState {
  return { visibility: WORKSPACE_VISIBILITY_EXPANDED, drawer }
}

export function createDirectoryWorkspaceStore(input: {
  directory: string
  initialState?: DirectoryWorkspaceInitialState
}): DirectoryWorkspaceStore {
  logBenchToggleStep("directory-workspace-store-create", {
    directory: input.directory,
    initialState: input.initialState,
  })
  return createStore<DirectoryWorkspaceStoreState>()((set) => ({
    directory: input.directory,
    docked: input.initialState?.docked ?? createCollapsedWorkspaceState(),
    lastDrawer: input.initialState?.lastDrawer ?? DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
    pendingIntent: null,
    hydration: input.initialState?.hydration ?? { status: WORKSPACE_HYDRATION_PENDING },
    setPendingIntent: (intent) => {
      logBenchToggleStep("directory-workspace-store-set-pending-intent", {
        directory: input.directory,
        intent,
      })
      set({ pendingIntent: intent })
    },
    clearPendingIntent: (commandID) =>
      set((state) => {
        logBenchToggleStep("directory-workspace-store-clear-pending-intent-entry", {
          directory: input.directory,
          commandID,
          currentPendingIntent: state.pendingIntent,
        })
        if (state.pendingIntent?.commandID !== commandID) return {}
        logBenchToggleStep("directory-workspace-store-clear-pending-intent-commit", {
          directory: input.directory,
          commandID,
        })
        return { pendingIntent: null }
      }),
    commitDockedState: (commit) =>
      set((state) => {
        logBenchToggleStep("directory-workspace-store-commit-docked-state-entry", {
          directory: input.directory,
          commit,
          currentDocked: state.docked,
          currentPendingIntent: state.pendingIntent,
        })
        if (state.pendingIntent?.commandID !== commit.commandID) return {}
        const docked = normalizeDockedState(commit.docked)
        logBenchToggleStep("directory-workspace-store-commit-docked-state-commit", {
          directory: input.directory,
          commit,
          nextDocked: docked,
        })
        return {
          docked,
          pendingIntent: null,
        }
      }),
    setHydrationReady: () => {
      logBenchToggleStep("directory-workspace-store-set-hydration-ready", {
        directory: input.directory,
      })
      set({ hydration: { status: WORKSPACE_HYDRATION_READY } })
    },
    setHydrationFailed: (message) => {
      logBenchToggleStep("directory-workspace-store-set-hydration-failed", {
        directory: input.directory,
        message,
      })
      set({ hydration: { status: WORKSPACE_HYDRATION_FAILED, message } })
    },
    finishHydration: (hydrationInput) => {
      logBenchToggleStep("directory-workspace-store-finish-hydration", {
        directory: input.directory,
        hydrationInput,
      })
      set({
        docked: normalizeDockedState(hydrationInput.docked),
        lastDrawer: hydrationInput.lastDrawer,
        hydration: hydrationInput.hydration,
      })
    },
    setLastDrawer: (drawer) => {
      logBenchToggleStep("directory-workspace-store-set-last-drawer", {
        directory: input.directory,
        drawer,
      })
      set({ lastDrawer: drawer })
    },
  }))
}

export { isSameBenchRouteSnapshot }
