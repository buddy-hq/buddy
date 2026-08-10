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
  WORKSPACE_DRAWER_SKILLS,
  WORKSPACE_DRAWER_SOURCES,
  WORKSPACE_PENDING_KIND_NAVIGATION,
  WORKSPACE_PENDING_KIND_WORKSPACE_ONLY,
  WORKSPACE_VISIBILITY_COLLAPSED,
  WORKSPACE_VISIBILITY_EXPANDED,
  DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
  createCollapsedWorkspaceState,
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  defaultWorkspacePresentationSlot,
  effectiveWorkspaceProjection,
  isSameBenchRouteSnapshot,
  persistedDirectoryWorkspaceStateFromStore,
  readPersistedDirectoryWorkspace,
  readPersistedWorkspaceSlot,
  writePersistedDirectoryWorkspace,
  writePersistedWorkspaceSlot,
  type BenchRouteSnapshot,
  type DirectoryWorkspacePersistenceStorage,
  type DirectoryWorkspaceProjectionState,
  type EffectiveWorkspaceProjection,
  type PendingWorkspaceIntent,
  type WorkspacePresentationSlot,
} from "../src/state/directory-workspace-store"
import {
  workspaceChatKeyForSession,
  workspaceChatKeyForTransition,
} from "../src/lib/workspace-chat-key"
import { upsertBenchTab } from "../src/lib/bench-tabs"

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

function workspaceSlot(
  slot: Omit<WorkspacePresentationSlot, "tabs"> & {
    tabs?: WorkspacePresentationSlot["tabs"]
  },
): WorkspacePresentationSlot {
  return {
    ...slot,
    tabs:
      slot.tabs ??
      (slot.route.status === BENCH_ROUTE_STATUS_OPEN
        ? upsertBenchTab([], slot.route.target).tabs
        : []),
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
  test("adds an auto-open target to an inactive chat without changing the active chat", () => {
    const activeChatKey = workspaceChatKeyForSession("active")
    const inactiveChatKey = workspaceChatKeyForSession("inactive")
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: { activeChatKey, hydration: { status: "ready" } },
    })

    store.getState().presentBackground({
      chatKey: inactiveChatKey,
      target: OBJECT_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    })

    expect(store.getState().activeChatKey).toBe(activeChatKey)
    expect(store.getState().slots[inactiveChatKey]).toMatchObject({
      route: { status: BENCH_ROUTE_STATUS_OPEN, target: OBJECT_TARGET },
      docked: { visibility: WORKSPACE_VISIBILITY_COLLAPSED },
      tabs: [{ target: OBJECT_TARGET }],
    })
  })

  test("keeps the active chat when a background open exceeds the persisted slot limit", () => {
    const activeChatKey = workspaceChatKeyForSession("active-oldest")
    const backgroundChatKey = workspaceChatKeyForSession("background-newest")
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: { activeChatKey, hydration: { status: "ready" } },
    })
    for (let index = 0; index < 23; index += 1) {
      store.getState().captureChatSlot({
        chatKey: workspaceChatKeyForSession(`session-${index}`),
        route: DOCKED_OBJECT_ROUTE,
      })
    }

    store.getState().presentBackground({
      chatKey: backgroundChatKey,
      target: FILE_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    })

    expect(Object.keys(store.getState().slots)).toHaveLength(24)
    expect(store.getState().slots[activeChatKey]).toBeDefined()
    expect(store.getState().slots[backgroundChatKey]).toMatchObject({
      route: { status: BENCH_ROUTE_STATUS_OPEN, target: FILE_TARGET },
      tabs: [{ target: FILE_TARGET }],
    })
  })

  test("preserves the saved mode when background presentation refreshes the selected tab", () => {
    const chatKey = workspaceChatKeyForSession("selected")
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: { activeChatKey: chatKey, hydration: { status: "ready" } },
    })
    store.getState().captureChatSlot({ chatKey, route: DOCKED_OBJECT_ROUTE })

    store.getState().presentBackground({
      chatKey,
      target: OBJECT_TARGET,
      mode: BENCH_CHAT_LAYOUT_FLOATING,
    })

    expect(store.getState().slots[chatKey]?.route).toEqual({
      status: BENCH_ROUTE_STATUS_OPEN,
      target: OBJECT_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    })
  })

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

  test("bounds the persisted slot map and evicts least recently touched chats", () => {
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: { hydration: { status: "ready" } },
    })
    const chatKeys = Array.from({ length: 30 }, (_unused, index) =>
      workspaceChatKeyForSession(`session-${index}`),
    )

    for (const chatKey of chatKeys) {
      store.getState().captureChatSlot({ chatKey, route: DOCKED_OBJECT_ROUTE })
    }

    const slots = store.getState().slots
    expect(Object.keys(slots)).toHaveLength(24)
    expect(slots[chatKeys[0] as (typeof chatKeys)[number]]).toBeUndefined()
    expect(slots[chatKeys.at(-1) as (typeof chatKeys)[number]]).toBeDefined()
  })

  test("keeps a re-touched chat slot instead of evicting it by insertion age", () => {
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: { hydration: { status: "ready" } },
    })
    const oldest = workspaceChatKeyForSession("session-oldest")
    store.getState().captureChatSlot({ chatKey: oldest, route: DOCKED_OBJECT_ROUTE })
    for (let index = 0; index < 23; index += 1) {
      store.getState().captureChatSlot({
        chatKey: workspaceChatKeyForSession(`session-${index}`),
        route: DOCKED_OBJECT_ROUTE,
      })
    }
    store.getState().captureChatSlot({ chatKey: oldest, route: DOCKED_OBJECT_ROUTE })
    store.getState().captureChatSlot({
      chatKey: workspaceChatKeyForSession("session-new"),
      route: DOCKED_OBJECT_ROUTE,
    })

    expect(store.getState().slots[oldest]).toBeDefined()
  })

  test("releases a transient destination slot when the transition moves on", () => {
    const transitionKey = workspaceChatKeyForTransition(3)
    const durableChatKey = workspaceChatKeyForSession("session-created-from-transition")
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: { hydration: { status: "ready" } },
    })

    store.getState().stageChatTransition({
      commandID: "command-transition",
      chatKey: transitionKey,
      destinationSlot: defaultWorkspacePresentationSlot(),
      previousProjection: commandProjection(),
    })

    expect(store.getState().activeChatKey).toBe(transitionKey)
    expect(store.getState().slots[transitionKey]).toBeDefined()

    store.getState().stageChatTransition({
      commandID: "command-restore",
      chatKey: durableChatKey,
      previousProjection: commandProjection(),
    })

    expect(store.getState().activeChatKey).toBe(durableChatKey)
    expect(store.getState().slots[transitionKey]).toBeUndefined()
  })

  test("keeps a persisted slot when the transition moves on", () => {
    const chatAKey = workspaceChatKeyForSession("session-a")
    const chatBKey = workspaceChatKeyForSession("session-b")
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: { activeChatKey: chatAKey, hydration: { status: "ready" } },
    })
    store.getState().captureChatSlot({ chatKey: chatAKey, route: DOCKED_OBJECT_ROUTE })

    store.getState().stageChatTransition({
      commandID: "command-transition",
      chatKey: chatBKey,
      previousProjection: commandProjection(),
    })

    expect(store.getState().slots[chatAKey]).toMatchObject({ route: DOCKED_OBJECT_ROUTE })
  })

  test("promotes a draft slot to its durable chat without changing the presentation", () => {
    const draftChatKey = workspaceChatKeyForSession(undefined)
    const durableChatKey = workspaceChatKeyForSession("session-created-from-draft")
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: {
        activeChatKey: draftChatKey,
        docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_SKILLS),
        lastDrawer: WORKSPACE_DRAWER_SKILLS,
        hydration: { status: "ready" },
      },
    })
    store.getState().captureChatSlot({
      chatKey: draftChatKey,
      route: DOCKED_OBJECT_ROUTE,
    })

    store.getState().promoteChatSlot({
      from: draftChatKey,
      to: durableChatKey,
    })

    expect(store.getState()).toMatchObject({
      activeChatKey: durableChatKey,
      docked: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        drawer: WORKSPACE_DRAWER_SKILLS,
      },
      lastDrawer: WORKSPACE_DRAWER_SKILLS,
      pendingIntent: null,
    })
    expect(store.getState().slots[draftChatKey]).toBeUndefined()
    expect(store.getState().slots[durableChatKey]).toEqual(workspaceSlot({
      route: DOCKED_OBJECT_ROUTE,
      docked: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        drawer: WORKSPACE_DRAWER_SKILLS,
      },
      lastDrawer: WORKSPACE_DRAWER_SKILLS,
    }))
  })

  test("does not promote a draft over an existing chat slot", () => {
    const draftChatKey = workspaceChatKeyForSession(undefined)
    const existingChatKey = workspaceChatKeyForSession("existing-session")
    const existingSlot = workspaceSlot({
      route: CLOSED_ROUTE,
      docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_FILES),
      lastDrawer: WORKSPACE_DRAWER_FILES,
    })
    const store = createDirectoryWorkspaceStore({
      directory: "/workspace",
      initialState: {
        activeChatKey: draftChatKey,
        slots: { [existingChatKey]: existingSlot },
        docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_SKILLS),
        lastDrawer: WORKSPACE_DRAWER_SKILLS,
        hydration: { status: "ready" },
      },
    })
    store.getState().captureChatSlot({ chatKey: draftChatKey, route: DOCKED_OBJECT_ROUTE })
    const stateBeforePromotion = store.getState()

    store.getState().promoteChatSlot({ from: draftChatKey, to: existingChatKey })

    expect(store.getState()).toBe(stateBeforePromotion)
    expect(store.getState().slots[existingChatKey]).toEqual(existingSlot)
  })
})

describe("directory workspace persistence", () => {
  test("serializes per-chat slot writes without allowing an older write to win", async () => {
    const entries = new Map<string, string>()
    let writeCount = 0
    let releaseFirstWrite: (() => void) | undefined
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve
    })
    const storage: DirectoryWorkspacePersistenceStorage = {
      getItem: (name) => entries.get(name) ?? null,
      setItem: async (name, value) => {
        writeCount += 1
        if (writeCount === 1) await firstWriteGate
        entries.set(name, value)
      },
      removeItem: (name) => {
        entries.delete(name)
      },
    }

    const chatAKey = workspaceChatKeyForSession("session-a")
    const chatBKey = workspaceChatKeyForSession("session-b")
    const firstWrite = writePersistedDirectoryWorkspace({
      directory: "/workspace",
      storage,
      state: {
        slots: {
          [chatAKey]: workspaceSlot({
            route: DOCKED_OBJECT_ROUTE,
            docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_SKILLS),
            lastDrawer: WORKSPACE_DRAWER_SKILLS,
          }),
        },
      },
    })
    await Promise.resolve()
    const secondWrite = writePersistedWorkspaceSlot({
      directory: "/workspace",
      storage,
      chatKey: chatBKey,
      slot: workspaceSlot({
        route: CLOSED_ROUTE,
        docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_SEARCH),
        lastDrawer: WORKSPACE_DRAWER_SEARCH,
      }),
    })
    releaseFirstWrite?.()

    await firstWrite
    await secondWrite
    await expect(
      readPersistedDirectoryWorkspace({ directory: "/workspace", storage }),
    ).resolves.toEqual({
      status: "ready",
      state: {
        slots: {
          [chatAKey]: workspaceSlot({
            route: DOCKED_OBJECT_ROUTE,
            docked: {
              visibility: WORKSPACE_VISIBILITY_EXPANDED,
              drawer: WORKSPACE_DRAWER_SKILLS,
            },
            lastDrawer: WORKSPACE_DRAWER_SKILLS,
          }),
          [chatBKey]: workspaceSlot({
            route: CLOSED_ROUTE,
            docked: {
              visibility: WORKSPACE_VISIBILITY_EXPANDED,
              drawer: WORKSPACE_DRAWER_SEARCH,
            },
            lastDrawer: WORKSPACE_DRAWER_SEARCH,
          }),
        },
      },
    })
  })

  test("reads one chat slot without mixing it with another chat", async () => {
    const storage = createMemoryStorage()
    const chatAKey = workspaceChatKeyForSession("session-a")
    const chatBKey = workspaceChatKeyForSession("session-b")
    await writePersistedDirectoryWorkspace({
      directory: "/workspace",
      storage,
      state: {
        slots: {
          [chatAKey]: workspaceSlot({
            route: DOCKED_OBJECT_ROUTE,
            docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_FILES),
            lastDrawer: WORKSPACE_DRAWER_FILES,
          }),
          [chatBKey]: workspaceSlot({
            route: CLOSED_ROUTE,
            docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_SKILLS),
            lastDrawer: WORKSPACE_DRAWER_SKILLS,
          }),
        },
      },
    })

    await expect(
      readPersistedWorkspaceSlot({
        directory: "/workspace",
        chatKey: chatBKey,
        storage,
      }),
    ).resolves.toEqual(workspaceSlot({
      route: CLOSED_ROUTE,
      docked: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        drawer: WORKSPACE_DRAWER_SKILLS,
      },
      lastDrawer: WORKSPACE_DRAWER_SKILLS,
    }))
  })

  test("persists the versioned slot map", async () => {
    const storage = createMemoryStorage()
    const chatKey = workspaceChatKeyForSession("session-a")
    await writePersistedDirectoryWorkspace({
      directory: "/workspace",
      storage,
      state: {
        slots: {
          [chatKey]: workspaceSlot({
            route: CLOSED_ROUTE,
            docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_SEARCH),
            lastDrawer: WORKSPACE_DRAWER_SEARCH,
          }),
        },
      },
    })

    const raw = Array.from(storage.entries.values())[0]
    if (!raw) throw new Error("Expected persisted workspace payload.")
    expect(JSON.parse(raw)).toEqual({
      version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
      state: {
        slots: {
          [chatKey]: workspaceSlot({
            route: CLOSED_ROUTE,
            docked: {
              visibility: WORKSPACE_VISIBILITY_EXPANDED,
              drawer: WORKSPACE_DRAWER_SEARCH,
            },
            lastDrawer: WORKSPACE_DRAWER_SEARCH,
          }),
        },
      },
    })
  })

  test("ignores legacy persistence instead of treating directory state as a chat slot", async () => {
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

  test("derives the active chat slot and excludes transition-only slots", () => {
    const chatKey = workspaceChatKeyForSession("session-a")
    const transitionKey = workspaceChatKeyForTransition(9)
    expect(
      persistedDirectoryWorkspaceStateFromStore({
        slots: {
          [chatKey]: workspaceSlot({
            route: DOCKED_OBJECT_ROUTE,
            docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_FILES),
            lastDrawer: WORKSPACE_DRAWER_SOURCES,
          }),
          [transitionKey]: defaultWorkspacePresentationSlot(),
        },
      }),
    ).toEqual({
      slots: {
        [chatKey]: workspaceSlot({
          route: DOCKED_OBJECT_ROUTE,
          docked: {
            visibility: WORKSPACE_VISIBILITY_EXPANDED,
            drawer: WORKSPACE_DRAWER_FILES,
          },
          lastDrawer: WORKSPACE_DRAWER_SOURCES,
        }),
      },
    })
  })
})
