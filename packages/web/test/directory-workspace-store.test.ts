import { describe, expect, test } from "bun:test"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  benchTargetKey,
  isSameBenchTarget,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import {
  BENCH_ROUTE_STATUS_CLOSED,
  BENCH_ROUTE_STATUS_OPEN,
  DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  WORKSPACE_DRAWER_FILES,
  WORKSPACE_DRAWER_SEARCH,
  WORKSPACE_DRAWER_SOURCES,
  WORKSPACE_PENDING_KIND_NAVIGATION,
  WORKSPACE_PENDING_KIND_WORKSPACE_ONLY,
  WORKSPACE_VISIBILITY_COLLAPSED,
  WORKSPACE_VISIBILITY_EXPANDED,
  DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
  createCollapsedWorkspaceState,
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  isSameBenchRouteSnapshot,
  persistedDirectoryWorkspaceStateFromStore,
  readPersistedDirectoryWorkspace,
  writePersistedDirectoryWorkspace,
  type BenchRouteSnapshot,
  type DirectoryWorkspacePersistenceStorage,
  type DirectoryWorkspaceProjectionState,
  type EffectiveWorkspaceProjection,
  type PendingWorkspaceIntent,
} from "../src/state/directory-workspace-store"

const FILE_TARGET = {
  type: "workspace-file",
  path: "docs/intro.md",
  viewer: "markdown",
} satisfies BenchTarget

const FILE_TARGET_AS_FILE = {
  type: "workspace-file",
  path: "docs/intro.md",
  viewer: "file",
} satisfies BenchTarget

const OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: "revision-1",
    itemID: "item-1",
  },
  viewID: "reader",
} satisfies BenchTarget

const OBJECT_TARGET_NEXT_VIEW = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: "revision-1",
    itemID: "item-1",
  },
  viewID: "summary",
} satisfies BenchTarget

const BENCH_TARGET_KEY_PART_SEPARATOR = "\u0000"
const BENCH_TARGET_KEY_NULL_PART = "\u2400"
const CLOSED_ROUTE = { status: BENCH_ROUTE_STATUS_CLOSED } satisfies BenchRouteSnapshot
const DOCKED_OBJECT_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: OBJECT_TARGET,
  mode: BENCH_CHAT_LAYOUT_DOCKED,
} satisfies BenchRouteSnapshot
const FLOATING_OBJECT_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: OBJECT_TARGET,
  mode: BENCH_CHAT_LAYOUT_FLOATING,
} satisfies BenchRouteSnapshot

function projectionState(input: {
  visibility: "collapsed" | "expanded"
  drawer: "files" | "sources" | null
  lastDrawer?: "files" | "sources"
}): DirectoryWorkspaceProjectionState {
  return {
    docked:
      input.visibility === WORKSPACE_VISIBILITY_COLLAPSED
        ? createCollapsedWorkspaceState()
        : createExpandedWorkspaceState(input.drawer),
    lastDrawer: input.lastDrawer ?? WORKSPACE_DRAWER_FILES,
  }
}

function commandProjection(): EffectiveWorkspaceProjection {
  return effectiveWorkspaceProjection(
    DOCKED_OBJECT_ROUTE,
    projectionState({ visibility: WORKSPACE_VISIBILITY_EXPANDED, drawer: null }),
    null,
  )
}

function createMemoryStorage(): DirectoryWorkspacePersistenceStorage & {
  entries: Map<string, string>
} {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem(name) {
      return entries.get(name) ?? null
    },
    setItem(name, value) {
      entries.set(name, value)
    },
    removeItem(name) {
      entries.delete(name)
    },
  }
}

describe("bench target keys", () => {
  test("preserves the canonical backend key format", () => {
    expect(
      benchTargetKey({
        type: "workspace-file",
        path: "docs/intro notes.md",
        viewer: "markdown",
      }),
    ).toBe(
      ["workspace-file", "markdown", "docs%2Fintro%20notes.md"].join(
        BENCH_TARGET_KEY_PART_SEPARATOR,
      ),
    )

    expect(
      benchTargetKey({
        type: "workspace-file",
        path: "docs/intro notes.md",
        viewer: "file",
      }),
    ).toBe(
      ["workspace-file", "file", "docs%2Fintro%20notes.md"].join(BENCH_TARGET_KEY_PART_SEPARATOR),
    )

    expect(
      benchTargetKey({
        type: "object",
        ref: {
          kind: "resource",
          objectID: "01KG1A0KH77HJ9QGAQ5QK0N4BD",
          revisionID: null,
          itemID: null,
        },
        viewID: "reader",
      }),
    ).toBe(
      [
        "object",
        "resource",
        "01KG1A0KH77HJ9QGAQ5QK0N4BD",
        BENCH_TARGET_KEY_NULL_PART,
        BENCH_TARGET_KEY_NULL_PART,
        "reader",
      ].join(BENCH_TARGET_KEY_PART_SEPARATOR),
    )

    expect(
      benchTargetKey({
        type: "object",
        ref: {
          kind: "resource",
          objectID: "01KG1A0KH77HJ9QGAQ5QK0N4BD",
          revisionID: "rev 2",
          itemID: "item/3",
        },
        viewID: "reader notes",
      }),
    ).toBe(
      [
        "object",
        "resource",
        "01KG1A0KH77HJ9QGAQ5QK0N4BD",
        "rev%202",
        "item%2F3",
        "reader%20notes",
      ].join(BENCH_TARGET_KEY_PART_SEPARATOR),
    )
  })

  test("derives shared content keys while keeping route-only fragments separate", () => {
    expect(benchTargetKey(FILE_TARGET)).not.toBe(benchTargetKey(FILE_TARGET_AS_FILE))
    expect(benchTargetKey(FILE_TARGET)).toBe(
      benchTargetKey({ ...FILE_TARGET, fragment: "Details" }),
    )
    expect(isSameBenchTarget(FILE_TARGET, { ...FILE_TARGET, fragment: "Details" })).toBe(false)
    expect(benchTargetKey(OBJECT_TARGET)).not.toBe(benchTargetKey(OBJECT_TARGET_NEXT_VIEW))

    expect(
      isSameBenchRouteSnapshot(
        {
          status: BENCH_ROUTE_STATUS_OPEN,
          target: OBJECT_TARGET,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
        },
        {
          status: BENCH_ROUTE_STATUS_OPEN,
          target: OBJECT_TARGET,
          mode: BENCH_CHAT_LAYOUT_FLOATING,
        },
      ),
    ).toBe(false)
  })
})

describe("effectiveWorkspaceProjection", () => {
  test("keeps a closed collapsed workspace empty", () => {
    expect(
      effectiveWorkspaceProjection(
        CLOSED_ROUTE,
        projectionState({ visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null }),
        null,
      ),
    ).toMatchObject({
      bench: { visibility: "closed", target: null, targetKey: null, mode: null },
      drawer: null,
      renderedSurface: "empty",
      pending: { status: "none" },
    })
  })

  test("derives the no-target expanded drawer from last drawer without storing it", () => {
    const state = projectionState({
      visibility: WORKSPACE_VISIBILITY_EXPANDED,
      drawer: null,
      lastDrawer: WORKSPACE_DRAWER_SOURCES,
    })

    const projection = effectiveWorkspaceProjection(CLOSED_ROUTE, state, null)

    expect(projection).toMatchObject({
      bench: { visibility: "closed" },
      drawer: WORKSPACE_DRAWER_SOURCES,
      renderedSurface: "drawer",
    })
    expect(state.docked.drawer).toBeNull()
  })

  test("shows a docked target when expanded and parks it when collapsed", () => {
    expect(
      effectiveWorkspaceProjection(
        DOCKED_OBJECT_ROUTE,
        projectionState({ visibility: WORKSPACE_VISIBILITY_EXPANDED, drawer: null }),
        null,
      ),
    ).toMatchObject({
      bench: {
        visibility: "visible",
        targetKey: benchTargetKey(OBJECT_TARGET),
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      drawer: null,
      renderedSurface: "docked-bench",
    })

    expect(
      effectiveWorkspaceProjection(
        DOCKED_OBJECT_ROUTE,
        projectionState({ visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null }),
        null,
      ),
    ).toMatchObject({
      bench: {
        visibility: "parked",
        targetKey: benchTargetKey(OBJECT_TARGET),
      },
      drawer: null,
      renderedSurface: "parked-bench",
    })
  })

  test("represents drawers over docked targets but never in floating mode", () => {
    expect(
      effectiveWorkspaceProjection(
        DOCKED_OBJECT_ROUTE,
        projectionState({
          visibility: WORKSPACE_VISIBILITY_EXPANDED,
          drawer: WORKSPACE_DRAWER_FILES,
        }),
        null,
      ),
    ).toMatchObject({
      bench: { visibility: "visible" },
      drawer: WORKSPACE_DRAWER_FILES,
      renderedSurface: "drawer-over-bench",
    })

    expect(
      effectiveWorkspaceProjection(
        FLOATING_OBJECT_ROUTE,
        projectionState({
          visibility: WORKSPACE_VISIBILITY_COLLAPSED,
          drawer: WORKSPACE_DRAWER_SOURCES,
        }),
        null,
      ),
    ).toMatchObject({
      bench: { visibility: "visible", mode: BENCH_CHAT_LAYOUT_FLOATING },
      drawer: null,
      renderedSurface: "floating-bench",
    })
  })

  test("retains the previous projection while navigation is pending and the expected route has not committed", () => {
    const previousProjection = commandProjection()
    const intent = {
      kind: WORKSPACE_PENDING_KIND_NAVIGATION,
      commandID: "command-1",
      attemptID: "attempt-1",
      previousProjection,
      expectedRoute: FLOATING_OBJECT_ROUTE,
      workspaceCommit: createExpandedWorkspaceState(null),
    } satisfies PendingWorkspaceIntent

    expect(
      effectiveWorkspaceProjection(
        CLOSED_ROUTE,
        projectionState({ visibility: "collapsed", drawer: null }),
        intent,
      ),
    ).toMatchObject({
      route: previousProjection.route,
      bench: previousProjection.bench,
      pending: { status: "retained-previous", commandID: "command-1" },
    })
  })

  test("applies a navigation workspace commit only after the exact expected route appears", () => {
    const intent = {
      kind: WORKSPACE_PENDING_KIND_NAVIGATION,
      commandID: "command-2",
      attemptID: "attempt-2",
      previousProjection: commandProjection(),
      expectedRoute: FLOATING_OBJECT_ROUTE,
      workspaceCommit: createCollapsedWorkspaceState(),
    } satisfies PendingWorkspaceIntent

    expect(
      effectiveWorkspaceProjection(
        FLOATING_OBJECT_ROUTE,
        projectionState({
          visibility: WORKSPACE_VISIBILITY_EXPANDED,
          drawer: WORKSPACE_DRAWER_SOURCES,
        }),
        intent,
      ),
    ).toMatchObject({
      dockedState: { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null },
      bench: { visibility: "visible", mode: BENCH_CHAT_LAYOUT_FLOATING },
      pending: { status: "expected-route", commandID: "command-2" },
    })
  })

  test("applies workspace-only intents without inventing a target", () => {
    const intent = {
      kind: WORKSPACE_PENDING_KIND_WORKSPACE_ONLY,
      commandID: "command-3",
      previousProjection: commandProjection(),
      workspaceCommit: createExpandedWorkspaceState(WORKSPACE_DRAWER_FILES),
    } satisfies PendingWorkspaceIntent

    expect(
      effectiveWorkspaceProjection(
        CLOSED_ROUTE,
        projectionState({ visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null }),
        intent,
      ),
    ).toMatchObject({
      bench: { visibility: "closed", target: null },
      drawer: WORKSPACE_DRAWER_FILES,
      renderedSurface: "drawer",
      pending: { status: "workspace-only", commandID: "command-3" },
    })
  })
})

describe("createDirectoryWorkspaceStore", () => {
  test("creates a collapsed directory-scoped store with Sources as the default last drawer", () => {
    const store = createDirectoryWorkspaceStore({ directory: "/workspace" })

    expect(store.getState()).toMatchObject({
      directory: "/workspace",
      docked: { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null },
      lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
      pendingIntent: null,
      hydration: { status: "pending" },
    })
  })

  test("clears and commits only the matching command intent", () => {
    const store = createDirectoryWorkspaceStore({ directory: "/workspace" })
    const intent = {
      kind: WORKSPACE_PENDING_KIND_WORKSPACE_ONLY,
      commandID: "command-4",
      previousProjection: commandProjection(),
      workspaceCommit: createExpandedWorkspaceState(WORKSPACE_DRAWER_SOURCES),
    } satisfies PendingWorkspaceIntent

    store.getState().setPendingIntent(intent)
    store.getState().clearPendingIntent("other-command")
    expect(store.getState().pendingIntent).toBe(intent)

    store.getState().commitDockedState({
      commandID: "command-4",
      docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_SOURCES),
    })

    expect(store.getState()).toMatchObject({
      docked: { visibility: WORKSPACE_VISIBILITY_EXPANDED, drawer: WORKSPACE_DRAWER_SOURCES },
      pendingIntent: null,
    })
  })

  test("finishes hydration with the persisted durable workspace slice", () => {
    const store = createDirectoryWorkspaceStore({ directory: "/workspace" })

    store.getState().finishHydration({
      docked: createExpandedWorkspaceState(null),
      lastDrawer: WORKSPACE_DRAWER_SOURCES,
      hydration: { status: "ready" },
    })

    expect(store.getState()).toMatchObject({
      docked: { visibility: WORKSPACE_VISIBILITY_EXPANDED, drawer: null },
      lastDrawer: WORKSPACE_DRAWER_SOURCES,
      hydration: { status: "ready" },
    })
  })
})

describe("directory workspace persistence", () => {
  test("accepts Search as a durable last drawer", async () => {
    const storage = createMemoryStorage()
    await writePersistedDirectoryWorkspace({
      directory: "/workspace",
      storage,
      state: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        lastDrawer: WORKSPACE_DRAWER_SEARCH,
      },
    })

    await expect(
      readPersistedDirectoryWorkspace({ directory: "/workspace", storage }),
    ).resolves.toEqual({
      status: "ready",
      state: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        lastDrawer: WORKSPACE_DRAWER_SEARCH,
      },
    })
  })

  test("persists only visibility and last drawer under a versioned payload", async () => {
    const storage = createMemoryStorage()
    await writePersistedDirectoryWorkspace({
      directory: "/workspace",
      storage,
      state: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        lastDrawer: WORKSPACE_DRAWER_SOURCES,
      },
    })

    const raw = Array.from(storage.entries.values())[0]
    if (!raw) throw new Error("Expected persisted workspace payload.")
    expect(JSON.parse(raw)).toEqual({
      version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
      state: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        lastDrawer: WORKSPACE_DRAWER_SOURCES,
      },
    })
    await expect(
      readPersistedDirectoryWorkspace({ directory: "/workspace", storage }),
    ).resolves.toEqual({
      status: "ready",
      state: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        lastDrawer: WORKSPACE_DRAWER_SOURCES,
      },
    })
  })

  test("ignores legacy or mismatched workspace persistence instead of migrating sidebar state", async () => {
    const storage = createMemoryStorage()
    storage.setItem(
      "directory-workspace:%2Fworkspace",
      JSON.stringify({
        version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION + 1,
        state: {
          visibility: WORKSPACE_VISIBILITY_EXPANDED,
          lastDrawer: WORKSPACE_DRAWER_SOURCES,
          rightSidebarOpen: true,
        },
      }),
    )

    await expect(
      readPersistedDirectoryWorkspace({ directory: "/workspace", storage }),
    ).resolves.toEqual({
      status: "ready",
      state: null,
    })
  })

  test("derives the persisted slice from committed workspace state", () => {
    expect(
      persistedDirectoryWorkspaceStateFromStore(
        projectionState({
          visibility: WORKSPACE_VISIBILITY_EXPANDED,
          drawer: WORKSPACE_DRAWER_FILES,
          lastDrawer: WORKSPACE_DRAWER_SOURCES,
        }),
      ),
    ).toEqual({
      visibility: WORKSPACE_VISIBILITY_EXPANDED,
      lastDrawer: WORKSPACE_DRAWER_SOURCES,
    })
  })
})
