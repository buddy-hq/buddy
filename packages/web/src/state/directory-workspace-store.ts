import { createStore, type StoreApi } from "zustand/vanilla"
import { getPlatform } from "@/context/platform"
import {
  benchTabKey,
  closeBenchTab,
  readBenchTab,
  upsertBenchTab,
  type BenchTab,
} from "@/lib/bench-tabs"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  benchTargetKey,
  readBenchChatLayoutMode,
  readBenchTabTarget,
  isSameBenchTarget,
  type BenchMode,
  type BenchModeRequest,
  type BenchTabTarget,
} from "@/lib/bench-targets"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import {
  WORKSPACE_CHAT_DRAFT_KEY,
  WORKSPACE_CHAT_TRANSITION_KEY_PREFIX,
  isPersistedWorkspaceChatKey,
  workspaceChatKeyForTransition,
  workspaceSessionIDFromChatKey,
  type PersistedWorkspaceChatKey,
  type WorkspaceChatKey,
} from "@/lib/workspace-chat-key"
import { z } from "zod"
import {
  browserLocalStorage,
  hasFunctionValue,
  parseBuddyConfigObject,
  parseWithSchema,
} from "./parse-external"

export const WORKSPACE_DRAWER_SOURCES = "sources"
export const WORKSPACE_DRAWER_SEARCH = "search"
export const WORKSPACE_DRAWER_PRACTICE = "practice"
export const WORKSPACE_DRAWER_CREATIONS = "creations"
export const WORKSPACE_DRAWER_BOARDS = "boards"
export const WORKSPACE_DRAWER_FILES = "files"
export const WORKSPACE_DRAWER_SKILLS = "skills"
export const WORKSPACE_DRAWER_NONE = "none"
export const WORKSPACE_VISIBILITY_COLLAPSED = "collapsed"
export const WORKSPACE_VISIBILITY_EXPANDED = "expanded"
export const BENCH_ROUTE_STATUS_CLOSED = "closed"
export const BENCH_ROUTE_STATUS_OPEN = "open"
export const WORKSPACE_PENDING_KIND_NAVIGATION = "navigation"
export const WORKSPACE_PENDING_KIND_WORKSPACE_ONLY = "workspace-only"
export const WORKSPACE_PENDING_KIND_CHAT_TRANSITION = "chat-transition"
export const WORKSPACE_DESTINATION_RESTORE = "restore"
export const WORKSPACE_DESTINATION_EMPTY = "empty"
export const WORKSPACE_DESTINATION_INHERIT_CURRENT = "inherit-current"
export const WORKSPACE_HYDRATION_PENDING = "pending"
export const WORKSPACE_HYDRATION_READY = "ready"
export const WORKSPACE_HYDRATION_FAILED = "failed"
export const WORKSPACE_COMMAND_QUEUE_LIMIT = 64
export const DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER = WORKSPACE_DRAWER_SOURCES
export const DIRECTORY_WORKSPACE_PERSISTENCE_VERSION = 4
export const DIRECTORY_WORKSPACE_STORAGE_FILE = "buddy.directory-workspace.v4.dat"
const DIRECTORY_WORKSPACE_STORAGE_KEY_PREFIX = "directory-workspace:"

export type DrawerKind =
  | typeof WORKSPACE_DRAWER_SEARCH
  | typeof WORKSPACE_DRAWER_SOURCES
  | typeof WORKSPACE_DRAWER_PRACTICE
  | typeof WORKSPACE_DRAWER_CREATIONS
  | typeof WORKSPACE_DRAWER_BOARDS
  | typeof WORKSPACE_DRAWER_FILES
  | typeof WORKSPACE_DRAWER_SKILLS

export type BenchRouteSnapshot =
  | { status: typeof BENCH_ROUTE_STATUS_CLOSED }
  | {
      status: typeof BENCH_ROUTE_STATUS_OPEN
      target: BenchTabTarget
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
  slots: Partial<Record<PersistedWorkspaceChatKey, WorkspacePresentationSlot>>
}

export type WorkspacePresentationSlot = {
  route: BenchRouteSnapshot
  tabs: BenchTab[]
  docked: DockedWorkspaceState
  lastDrawer: DrawerKind
}

export type WorkspaceDestinationInitialization =
  | typeof WORKSPACE_DESTINATION_RESTORE
  | typeof WORKSPACE_DESTINATION_EMPTY
  | typeof WORKSPACE_DESTINATION_INHERIT_CURRENT

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

export type WorkspaceTransitionFrame =
  | { kind: "closed" }
  | { kind: "selector" }
  | { kind: "docked-bench" }
  | { kind: "floating-bench" }

type TRetainedPreviousPending = {
  status: "retained-previous"
  commandID: string
  transitionFrame?: WorkspaceTransitionFrame
}

export type EffectiveWorkspaceProjection = {
  route: BenchRouteSnapshot
  dockedState: DockedWorkspaceState
  bench:
    | {
        visibility: "visible" | "parked"
        target: BenchTabTarget
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
    | TRetainedPreviousPending
    | { status: "expected-route"; commandID: string }
    | { status: "workspace-only"; commandID: string }
    | {
        status: "chat-transition"
        commandID: string
        transitionFrame: WorkspaceTransitionFrame
      }
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
  | {
      kind: typeof WORKSPACE_PENDING_KIND_CHAT_TRANSITION
      commandID: string
      previousProjection: EffectiveWorkspaceProjection
      workspaceCommit: DockedWorkspaceState
    }

export type DirectoryWorkspaceProjectionState = {
  docked: DockedWorkspaceState
  lastDrawer: DrawerKind
}

type DirectoryWorkspaceInitialState = Partial<DirectoryWorkspaceProjectionState> & {
  activeChatKey?: WorkspaceChatKey
  slots?: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
  hydration?: DirectoryWorkspaceHydrationState
}

export type DirectoryWorkspaceCommand =
  | { type: "present"; directory: string; target: BenchTabTarget; mode: BenchModeRequest }
  | { type: "close" }
  | { type: "focus-tab"; tabKey: string }
  | {
      type: "present-background"
      chatKey: PersistedWorkspaceChatKey
      target: BenchTabTarget
      mode: BenchMode
    }
  | { type: "close-tab"; tabKey: string }
  | { type: "close-other-tabs"; tabKey: string }
  | { type: "close-tabs-to-right"; tabKey: string }
  | { type: "close-all-tabs" }
  | { type: "remove-session-targets"; sessionIDs: readonly string[] }
  | {
      type: "prepare-chat-change"
      outgoingChatKey: WorkspaceChatKey
      destinationChatKey: WorkspaceChatKey
      destinationInitialization: WorkspaceDestinationInitialization
    }
  | { type: "restore-chat"; chatKey: WorkspaceChatKey }
  | { type: "promote-chat"; from: WorkspaceChatKey; to: PersistedWorkspaceChatKey }
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
  activeChatKey: WorkspaceChatKey
  slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
  pendingIntent: PendingWorkspaceIntent | null
  hydration: DirectoryWorkspaceHydrationState
  setPendingIntent: (intent: PendingWorkspaceIntent) => void
  clearPendingIntent: (commandID: string) => void
  commitDockedState: (input: {
    commandID: string
    docked: DockedWorkspaceState
    route?: BenchRouteSnapshot
    tabs?: BenchTab[]
  }) => void
  setHydrationReady: () => void
  setHydrationFailed: (message: string) => void
  finishHydration: (input: {
    activeChatKey?: WorkspaceChatKey
    slots?: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
    docked: DockedWorkspaceState
    lastDrawer: DrawerKind
    hydration: DirectoryWorkspaceHydrationState
  }) => void
  setLastDrawer: (drawer: DrawerKind) => void
  captureChatSlot: (input: { chatKey: WorkspaceChatKey; route: BenchRouteSnapshot }) => void
  stageChatTransition: (input: {
    commandID: string
    chatKey: WorkspaceChatKey
    destinationSlot?: WorkspacePresentationSlot
    previousProjection: EffectiveWorkspaceProjection
  }) => void
  promoteChatSlot: (input: { from: WorkspaceChatKey; to: PersistedWorkspaceChatKey }) => void
  presentBackground: (input: {
    chatKey: WorkspaceChatKey
    target: BenchTabTarget
    mode: BenchMode
  }) => void
  removeSessionTargets: (input: {
    sessionIDs: readonly string[]
    excludeChatKey?: WorkspaceChatKey
  }) => void
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

const drawerKindSchema = z.enum([
  WORKSPACE_DRAWER_SEARCH,
  WORKSPACE_DRAWER_SOURCES,
  WORKSPACE_DRAWER_PRACTICE,
  WORKSPACE_DRAWER_CREATIONS,
  WORKSPACE_DRAWER_BOARDS,
  WORKSPACE_DRAWER_FILES,
  WORKSPACE_DRAWER_SKILLS,
])
const workspaceVisibilitySchema = z.enum([
  WORKSPACE_VISIBILITY_COLLAPSED,
  WORKSPACE_VISIBILITY_EXPANDED,
])

export function isDrawerKind<TValue>(value: TValue): value is TValue & DrawerKind {
  return parseWithSchema(drawerKindSchema, value) !== undefined
}

function parseWorkspaceVisibility<TValue>(
  value: TValue,
): DockedWorkspaceState["visibility"] | undefined {
  return parseWithSchema(workspaceVisibilitySchema, value)
}

function parseWorkspaceChatKey(value: string): WorkspaceChatKey | undefined {
  if (isPersistedWorkspaceChatKey(value)) return value
  if (!value.startsWith(WORKSPACE_CHAT_TRANSITION_KEY_PREFIX)) return undefined
  const suffix = value.slice(WORKSPACE_CHAT_TRANSITION_KEY_PREFIX.length)
  const id = Number(suffix)
  if (!Number.isInteger(id) || String(id) !== suffix) return undefined
  return workspaceChatKeyForTransition(id)
}

function readDockedWorkspaceState<TValue>(value: TValue): DockedWorkspaceState | undefined {
  const record = parseBuddyConfigObject(value)
  const visibility = parseWorkspaceVisibility(record?.visibility)
  if (!record || visibility === undefined) return undefined
  if (visibility === WORKSPACE_VISIBILITY_COLLAPSED) {
    return record.drawer === null ? createCollapsedWorkspaceState() : undefined
  }
  if (record.drawer !== null && !isDrawerKind(record.drawer)) return undefined
  return createExpandedWorkspaceState(record.drawer)
}

function readBenchRouteSnapshot<TValue>(value: TValue): BenchRouteSnapshot | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  if (record.status === BENCH_ROUTE_STATUS_CLOSED) {
    return { status: BENCH_ROUTE_STATUS_CLOSED }
  }
  if (record.status !== BENCH_ROUTE_STATUS_OPEN) return undefined
  const target = readBenchTabTarget(record.target)
  const mode = readBenchChatLayoutMode(record.mode)
  if (!target || !mode) return undefined
  return {
    status: BENCH_ROUTE_STATUS_OPEN,
    target,
    mode,
  }
}

function readWorkspacePresentationSlot<TValue>(value: TValue): WorkspacePresentationSlot | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  const route = readBenchRouteSnapshot(record.route)
  if (!Array.isArray(record.tabs)) return undefined
  const tabs = record.tabs.map(readBenchTab)
  const docked = readDockedWorkspaceState(record.docked)
  const lastDrawer = record.lastDrawer
  if (!route || tabs.some((tab) => !tab) || !docked || !isDrawerKind(lastDrawer)) return undefined
  const parsedTabs = tabs.flatMap((tab) => (tab ? [tab] : []))
  return {
    route,
    tabs: tabsForRoute(parsedTabs, route),
    docked,
    lastDrawer,
  }
}

function storageKeyForDirectory(directory: string): string {
  return `${DIRECTORY_WORKSPACE_STORAGE_KEY_PREFIX}${encodeURIComponent(directory)}`
}

const memoryWorkspaceStorage = new Map<string, string>()
const directoryWorkspaceWriteQueue = new Map<string, Promise<void>>()

function discardStorageWriteResult<TResult>(result: TResult): void | Promise<void> {
  if (result instanceof Promise) {
    return result.then(() => undefined)
  }
  if (!(result instanceof Object) || Array.isArray(result)) return undefined
  if (!("then" in result) || !hasFunctionValue(result.then)) return undefined
  return Promise.resolve(result).then(() => undefined)
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
  const localStorageNode = browserLocalStorage()
  if (localStorageNode) return localStorageNode
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

function persistenceQueueKey(directory: string): string {
  return storageKeyForDirectory(directory)
}

function enqueueDirectoryWorkspaceWrite(
  directory: string,
  write: () => Promise<void>,
): Promise<void> {
  const queueKey = persistenceQueueKey(directory)
  const previous = directoryWorkspaceWriteQueue.get(queueKey) ?? Promise.resolve()
  const queued = previous.catch(() => undefined).then(write)
  directoryWorkspaceWriteQueue.set(queueKey, queued)
  void queued.then(
    () => {
      if (directoryWorkspaceWriteQueue.get(queueKey) === queued) {
        directoryWorkspaceWriteQueue.delete(queueKey)
      }
    },
    () => {
      if (directoryWorkspaceWriteQueue.get(queueKey) === queued) {
        directoryWorkspaceWriteQueue.delete(queueKey)
      }
    },
  )
  return queued
}

async function waitForDirectoryWorkspaceWrites(directory: string): Promise<void> {
  await directoryWorkspaceWriteQueue.get(persistenceQueueKey(directory))?.catch(() => undefined)
}

function readPersistedDirectoryWorkspaceState<TValue>(
  value: TValue,
): PersistedDirectoryWorkspaceState | undefined {
  const record = parseBuddyConfigObject(value)
  const slotsRecord = parseBuddyConfigObject(record?.slots)
  if (!record || !slotsRecord) return undefined
  const slots: Partial<Record<PersistedWorkspaceChatKey, WorkspacePresentationSlot>> = {}
  for (const [key, slotValue] of Object.entries(slotsRecord)) {
    if (!isPersistedWorkspaceChatKey(key)) continue
    const slot = readWorkspacePresentationSlot(slotValue)
    if (slot) slots[key] = slot
  }
  return { slots }
}

function readPersistedDirectoryWorkspacePayload<TValue>(
  value: TValue,
): PersistedDirectoryWorkspacePayload | undefined {
  const record = parseBuddyConfigObject(value)
  if (!record) return undefined
  if (record.version !== DIRECTORY_WORKSPACE_PERSISTENCE_VERSION) return undefined
  const state = readPersistedDirectoryWorkspaceState(record.state)
  if (!state) return undefined
  return {
    version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
    state,
  }
}

async function readPersistedDirectoryWorkspaceImmediately(input: {
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
  return {
    status: WORKSPACE_HYDRATION_READY,
    state: withoutTransientBrowserTabs(payload.state),
  }
}

export async function readPersistedDirectoryWorkspace(input: {
  directory: string
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<DirectoryWorkspacePersistenceReadResult> {
  await waitForDirectoryWorkspaceWrites(input.directory)
  return readPersistedDirectoryWorkspaceImmediately(input)
}

async function writePersistedDirectoryWorkspaceImmediately(input: {
  directory: string
  state: PersistedDirectoryWorkspaceState
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<void> {
  const storage = input.storage ?? defaultDirectoryWorkspaceStorage()
  const payload: PersistedDirectoryWorkspacePayload = {
    version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
    state: withoutTransientBrowserTabs(input.state),
  }
  await storage.setItem(storageKeyForDirectory(input.directory), JSON.stringify(payload))
}

export async function writePersistedDirectoryWorkspace(input: {
  directory: string
  state: PersistedDirectoryWorkspaceState
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<void> {
  await enqueueDirectoryWorkspaceWrite(input.directory, () =>
    writePersistedDirectoryWorkspaceImmediately(input),
  )
}

export async function readPersistedWorkspaceSlot(input: {
  directory: string
  chatKey: PersistedWorkspaceChatKey
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<WorkspacePresentationSlot | undefined> {
  const persisted = await readPersistedDirectoryWorkspace(input)
  if (persisted.status === WORKSPACE_HYDRATION_FAILED) return undefined
  return persisted.state?.slots[input.chatKey]
}

export async function writePersistedWorkspaceSlot(input: {
  directory: string
  chatKey: PersistedWorkspaceChatKey
  slot: WorkspacePresentationSlot
  storage?: DirectoryWorkspacePersistenceStorage
}): Promise<void> {
  await enqueueDirectoryWorkspaceWrite(input.directory, async () => {
    const persisted = await readPersistedDirectoryWorkspaceImmediately(input)
    const slots =
      persisted.status === WORKSPACE_HYDRATION_READY && persisted.state ? persisted.state.slots : {}
    await writePersistedDirectoryWorkspaceImmediately(
      Object.assign(
        {
          directory: input.directory,
          state: {
            slots: {
              ...slots,
              [input.chatKey]: input.slot,
            },
          },
        },
        input.storage ? { storage: input.storage } : undefined,
      ),
    )
  })
}

export function defaultWorkspacePresentationSlot(): WorkspacePresentationSlot {
  return {
    route: { status: BENCH_ROUTE_STATUS_CLOSED },
    tabs: [],
    docked: createCollapsedWorkspaceState(),
    lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  }
}

function withoutTransientBrowserTabs(
  state: PersistedDirectoryWorkspaceState,
): PersistedDirectoryWorkspaceState {
  const slots: Partial<Record<PersistedWorkspaceChatKey, WorkspacePresentationSlot>> = {}
  for (const [chatKey, slot] of Object.entries(state.slots)) {
    if (!slot || !isPersistedWorkspaceChatKey(chatKey)) continue
    const tabs = slot.tabs.filter((tab) => tab.target.type !== "browser")
    const tabsChanged = tabs.length !== slot.tabs.length
    if (slot.route.status !== BENCH_ROUTE_STATUS_OPEN || slot.route.target.type !== "browser") {
      slots[chatKey] = tabsChanged ? { ...slot, tabs } : slot
      continue
    }

    const fallbackTab = tabs.at(-1)
    slots[chatKey] = {
      ...slot,
      tabs,
      route: fallbackTab
        ? {
            status: BENCH_ROUTE_STATUS_OPEN,
            target: fallbackTab.target,
            mode: slot.route.mode,
          }
        : { status: BENCH_ROUTE_STATUS_CLOSED },
    }
  }
  return { slots }
}

function tabsForRoute(tabs: readonly BenchTab[], route: BenchRouteSnapshot): BenchTab[] {
  if (route.status === BENCH_ROUTE_STATUS_CLOSED) return []
  return upsertBenchTab(tabs, route.target).tabs
}

export function removeSessionBenchTargetsFromSlot(input: {
  slot: WorkspacePresentationSlot
  sessionIDs: ReadonlySet<string>
}): WorkspacePresentationSlot {
  const removedTabKeys = input.slot.tabs
    .filter((tab) => tab.target.type === "session" && input.sessionIDs.has(tab.target.sessionID))
    .map((tab) => tab.key)
  if (removedTabKeys.length === 0) return input.slot

  let selection = {
    tabs: input.slot.tabs,
    activeTabKey:
      input.slot.route.status === BENCH_ROUTE_STATUS_OPEN
        ? benchTabKey(input.slot.route.target)
        : null,
  }
  for (const tabKey of removedTabKeys) {
    selection = closeBenchTab({ ...selection, tabKey })
  }

  const activeTab = selection.tabs.find((tab) => tab.key === selection.activeTabKey)
  const route: BenchRouteSnapshot = activeTab
    ? {
        status: BENCH_ROUTE_STATUS_OPEN,
        target: activeTab.target,
        mode:
          input.slot.route.status === BENCH_ROUTE_STATUS_OPEN
            ? input.slot.route.mode
            : BENCH_CHAT_LAYOUT_DOCKED,
      }
    : { status: BENCH_ROUTE_STATUS_CLOSED }

  return {
    ...input.slot,
    route,
    tabs: selection.tabs,
    docked: activeTab ? input.slot.docked : createCollapsedWorkspaceState(),
  }
}

export function removeSessionBenchTargetsFromSlots(input: {
  slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
  sessionIDs: ReadonlySet<string>
  excludeChatKey?: WorkspaceChatKey
}): Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>> {
  let changed = false
  const slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>> = {}
  for (const [key, slot] of Object.entries(input.slots)) {
    if (!slot) continue
    const chatKey = parseWorkspaceChatKey(key)
    if (!chatKey) continue
    const ownerSessionID = workspaceSessionIDFromChatKey(chatKey)
    if (
      chatKey !== input.excludeChatKey &&
      ownerSessionID !== undefined &&
      input.sessionIDs.has(ownerSessionID)
    ) {
      changed = true
      continue
    }
    const nextSlot =
      chatKey === input.excludeChatKey
        ? slot
        : removeSessionBenchTargetsFromSlot({ slot, sessionIDs: input.sessionIDs })
    slots[chatKey] = nextSlot
    changed ||= nextSlot !== slot
  }
  return changed ? slots : input.slots
}

export function workspacePresentationSlotForChat(
  slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>,
  chatKey: WorkspaceChatKey,
): WorkspacePresentationSlot {
  return slots[chatKey] ?? defaultWorkspacePresentationSlot()
}

/**
 * Bounds ordinary per-chat slots while preserving slots that own live Browser pages.
 *
 * A slot is created for every chat activated in a notebook, so ordinary inactive slots are bounded.
 * A Browser slot is exempt because eviction would destroy a live page; session archive/delete
 * removes it through `removeSessionTargets`. The touched chat is re-inserted last so the map doubles
 * as a recency order, and eviction drops the least recently touched eligible persisted slots.
 */
const WORKSPACE_CHAT_SLOT_LIMIT = 24

function slotKeepsLiveBrowserPage(slot: WorkspacePresentationSlot | undefined): boolean {
  return slot?.tabs.some((tab) => tab.target.type === "browser") ?? false
}

function retainWorkspaceChatSlots(input: {
  slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
  touchedChatKey: WorkspaceChatKey
  protectedChatKeys?: readonly WorkspaceChatKey[]
}) {
  const touched = input.slots[input.touchedChatKey]
  const ordered: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>> = {}
  for (const [key, slot] of Object.entries(input.slots)) {
    if (key === input.touchedChatKey || !slot) continue
    const chatKey = parseWorkspaceChatKey(key)
    if (!chatKey) continue
    ordered[chatKey] = slot
  }
  if (touched) ordered[input.touchedChatKey] = touched

  const persistedKeys = Object.keys(ordered).filter((key) => isPersistedWorkspaceChatKey(key))
  const excess = persistedKeys.length - WORKSPACE_CHAT_SLOT_LIMIT
  if (excess <= 0) return ordered

  const protectedChatKeys = new Set<string>([
    input.touchedChatKey,
    ...(input.protectedChatKeys ?? []),
    ...Object.entries(ordered).flatMap(([key, slot]) =>
      slotKeepsLiveBrowserPage(slot) ? [key] : [],
    ),
  ])
  const evicted = new Set<string>(
    persistedKeys.filter((key) => !protectedChatKeys.has(key)).slice(0, excess),
  )
  const bounded: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>> = {}
  for (const [key, slot] of Object.entries(ordered)) {
    if (evicted.has(key) || !slot) continue
    const chatKey = parseWorkspaceChatKey(key)
    if (!chatKey) continue
    bounded[chatKey] = slot
  }
  return bounded
}

function releaseTransientChatSlot(input: {
  slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
  releasedChatKey: WorkspaceChatKey
  nextChatKey: WorkspaceChatKey
}): Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>> {
  if (input.releasedChatKey === input.nextChatKey) return input.slots
  if (isPersistedWorkspaceChatKey(input.releasedChatKey)) return input.slots
  if (!(input.releasedChatKey in input.slots)) return input.slots
  const { [input.releasedChatKey]: _released, ...remaining } = input.slots
  return remaining
}

export function persistedDirectoryWorkspaceStateFromStore(input: {
  slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>>
}): PersistedDirectoryWorkspaceState {
  const slots: Partial<Record<PersistedWorkspaceChatKey, WorkspacePresentationSlot>> = {}
  for (const [key, slot] of Object.entries(input.slots)) {
    if (slot && isPersistedWorkspaceChatKey(key)) {
      slots[key] = slot
    }
  }
  return { slots }
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

function workspaceTransitionFrameFor(
  projection: EffectiveWorkspaceProjection,
): WorkspaceTransitionFrame {
  if (
    projection.pending.status === "chat-transition" ||
    projection.pending.status === "retained-previous"
  ) {
    const retainedFrame = projection.pending.transitionFrame
    if (retainedFrame) return retainedFrame
  }
  if (
    projection.bench.visibility === "visible" &&
    projection.bench.mode === BENCH_CHAT_LAYOUT_FLOATING
  ) {
    return { kind: "floating-bench" }
  }
  if (
    projection.bench.visibility === "visible" &&
    projection.bench.mode === BENCH_CHAT_LAYOUT_DOCKED
  ) {
    return { kind: "docked-bench" }
  }
  if (
    projection.dockedState.visibility === WORKSPACE_VISIBILITY_EXPANDED &&
    projection.drawer !== null
  ) {
    return { kind: "selector" }
  }
  return { kind: "closed" }
}

function retainedTransitionFrame(
  projection: EffectiveWorkspaceProjection,
): WorkspaceTransitionFrame | undefined {
  if (
    projection.pending.status === "chat-transition" ||
    projection.pending.status === "retained-previous"
  ) {
    return projection.pending.transitionFrame
  }
  return undefined
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

  if (pendingIntent.kind === WORKSPACE_PENDING_KIND_CHAT_TRANSITION) {
    return projectCommittedState({
      route: { status: BENCH_ROUTE_STATUS_CLOSED },
      state: {
        docked: pendingIntent.workspaceCommit,
        lastDrawer: committedState.lastDrawer,
      },
      pending: {
        status: "chat-transition",
        commandID: pendingIntent.commandID,
        transitionFrame: workspaceTransitionFrameFor(pendingIntent.previousProjection),
      },
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
    const transitionFrame = retainedTransitionFrame(pendingIntent.previousProjection)
    const pending: TRetainedPreviousPending = Object.assign(
      {
        status: "retained-previous" as const,
        commandID: pendingIntent.commandID,
      },
      transitionFrame ? { transitionFrame } : undefined,
    )
    return {
      ...pendingIntent.previousProjection,
      pending,
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
  const initialActiveChatKey = input.initialState?.activeChatKey ?? WORKSPACE_CHAT_DRAFT_KEY
  const initialDocked = normalizeDockedState(
    input.initialState?.docked ?? createCollapsedWorkspaceState(),
  )
  const initialLastDrawer =
    input.initialState?.lastDrawer ?? DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER
  const initialSlots = {
    ...input.initialState?.slots,
    [initialActiveChatKey]: {
      route:
        input.initialState?.slots?.[initialActiveChatKey]?.route ??
        defaultWorkspacePresentationSlot().route,
      tabs: tabsForRoute(
        input.initialState?.slots?.[initialActiveChatKey]?.tabs ?? [],
        input.initialState?.slots?.[initialActiveChatKey]?.route ??
          defaultWorkspacePresentationSlot().route,
      ),
      docked: initialDocked,
      lastDrawer: initialLastDrawer,
    },
  }
  return createStore<DirectoryWorkspaceStoreState>()((set) => ({
    directory: input.directory,
    activeChatKey: initialActiveChatKey,
    slots: initialSlots,
    docked: initialDocked,
    lastDrawer: initialLastDrawer,
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
        const currentSlot = workspacePresentationSlotForChat(state.slots, state.activeChatKey)
        const route = commit.route ?? currentSlot.route
        const tabs = tabsForRoute(commit.tabs ?? currentSlot.tabs, route)
        logBenchToggleStep("directory-workspace-store-commit-docked-state-commit", {
          directory: input.directory,
          commit,
          nextDocked: docked,
        })
        return {
          docked,
          slots: retainWorkspaceChatSlots({
            slots: {
              ...state.slots,
              [state.activeChatKey]: {
                ...currentSlot,
                route,
                tabs,
                docked,
                lastDrawer: state.lastDrawer,
              },
            },
            touchedChatKey: state.activeChatKey,
          }),
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
      set((state) => {
        const activeChatKey = hydrationInput.activeChatKey ?? state.activeChatKey
        const docked = normalizeDockedState(hydrationInput.docked)
        const lastDrawer = hydrationInput.lastDrawer
        const hydratedSlots = hydrationInput.slots ?? state.slots
        const activeSlot = workspacePresentationSlotForChat(hydratedSlots, activeChatKey)
        return {
          activeChatKey,
          slots: {
            ...hydratedSlots,
            [activeChatKey]: {
              ...activeSlot,
              tabs: tabsForRoute(activeSlot.tabs, activeSlot.route),
              docked,
              lastDrawer,
            },
          },
          docked,
          lastDrawer,
          hydration: hydrationInput.hydration,
        }
      })
    },
    setLastDrawer: (drawer) => {
      logBenchToggleStep("directory-workspace-store-set-last-drawer", {
        directory: input.directory,
        drawer,
      })
      set((state) => ({
        lastDrawer: drawer,
        slots: {
          ...state.slots,
          [state.activeChatKey]: {
            ...workspacePresentationSlotForChat(state.slots, state.activeChatKey),
            docked: state.docked,
            lastDrawer: drawer,
          },
        },
      }))
    },
    captureChatSlot: ({ chatKey, route }) =>
      set((state) => ({
        slots: retainWorkspaceChatSlots({
          slots: {
            ...state.slots,
            [chatKey]: {
              route,
              tabs: tabsForRoute(
                workspacePresentationSlotForChat(state.slots, chatKey).tabs,
                route,
              ),
              docked: normalizeDockedState(state.docked),
              lastDrawer: state.lastDrawer,
            },
          },
          touchedChatKey: chatKey,
        }),
      })),
    stageChatTransition: ({ commandID, chatKey, destinationSlot, previousProjection }) =>
      set((state) => {
        const stagedSlots = destinationSlot
          ? {
              ...state.slots,
              [chatKey]: destinationSlot,
            }
          : state.slots
        // Transient destination keys exist only for the duration of one transition. Drop the
        // outgoing one here so the slot map cannot grow by a dead entry per new chat or fork.
        const slots = retainWorkspaceChatSlots({
          slots: releaseTransientChatSlot({
            slots: stagedSlots,
            releasedChatKey: state.activeChatKey,
            nextChatKey: chatKey,
          }),
          touchedChatKey: chatKey,
        })
        const slot = workspacePresentationSlotForChat(slots, chatKey)
        return {
          activeChatKey: chatKey,
          slots,
          docked: createCollapsedWorkspaceState(),
          lastDrawer: slot.lastDrawer,
          pendingIntent: {
            kind: WORKSPACE_PENDING_KIND_CHAT_TRANSITION,
            commandID,
            previousProjection,
            workspaceCommit: createCollapsedWorkspaceState(),
          },
        }
      }),
    promoteChatSlot: ({ from, to }) =>
      set((state) => {
        const source = workspacePresentationSlotForChat(state.slots, from)
        const { [from]: _removed, ...remainingSlots } = state.slots
        // A destination that already has a slot is an existing chat that was simply selected late,
        // not a draft becoming durable. Promoting over it would replace that chat's saved
        // presentation with the draft's closed one.
        if (state.slots[to]) return state
        return {
          activeChatKey: state.activeChatKey === from ? to : state.activeChatKey,
          slots: retainWorkspaceChatSlots({
            slots: { ...remainingSlots, [to]: source },
            touchedChatKey: to,
          }),
        }
      }),
    presentBackground: ({ chatKey, target, mode }) =>
      set((state) => {
        const slot = workspacePresentationSlotForChat(state.slots, chatKey)
        const tabs = upsertBenchTab(slot.tabs, target).tabs
        const targetTabKey = benchTabKey(target)
        const selectedTabKey =
          slot.route.status === BENCH_ROUTE_STATUS_OPEN ? benchTabKey(slot.route.target) : null
        const route: BenchRouteSnapshot =
          slot.route.status === BENCH_ROUTE_STATUS_CLOSED
            ? { status: BENCH_ROUTE_STATUS_OPEN, target, mode }
            : selectedTabKey === targetTabKey
              ? { ...slot.route, target }
              : slot.route
        return {
          slots: retainWorkspaceChatSlots({
            slots: {
              ...state.slots,
              [chatKey]: {
                ...slot,
                route,
                tabs,
              },
            },
            touchedChatKey: chatKey,
            protectedChatKeys: [state.activeChatKey],
          }),
        }
      }),
    removeSessionTargets: ({ sessionIDs, excludeChatKey }) =>
      set((state) => {
        const removedSessionIDs = new Set(sessionIDs)
        if (removedSessionIDs.size === 0) return state
        const slots = removeSessionBenchTargetsFromSlots(
          Object.assign(
            {
              slots: state.slots,
              sessionIDs: removedSessionIDs,
            },
            excludeChatKey ? { excludeChatKey } : undefined,
          ),
        )
        if (slots === state.slots) return state
        const activeSlot = workspacePresentationSlotForChat(slots, state.activeChatKey)
        return {
          slots,
          docked: activeSlot.docked,
          lastDrawer: activeSlot.lastDrawer,
        }
      }),
  }))
}

export { isSameBenchRouteSnapshot }
