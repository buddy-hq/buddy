import { afterEach, describe, expect, test } from "bun:test"
import {
  activateChatDirectory,
  runPreparedActiveChatMutation,
} from "../src/lib/active-chat-transition-coordinator"
import { resetActiveChatTransitionStateForTests } from "../src/lib/active-chat-transition-state"
import {
  DirectoryWorkspaceBlocker,
  DirectoryWorkspaceController,
} from "../src/lib/directory-workspace-controller"
import {
  registerLiveDirectoryWorkspace,
  resetLiveDirectoryWorkspaceRegistryForTests,
} from "../src/lib/directory-workspace-registry"
import { BENCH_CHAT_LAYOUT_DOCKED, type BenchTarget } from "../src/lib/bench-navigation"
import { encodeDirectory } from "../src/lib/directory-token"
import {
  BENCH_ROUTE_STATUS_CLOSED,
  BENCH_ROUTE_STATUS_OPEN,
  WORKSPACE_DRAWER_FILES,
  WORKSPACE_DRAWER_SKILLS,
  WORKSPACE_VISIBILITY_EXPANDED,
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  writePersistedWorkspaceSlot,
  type BenchRouteSnapshot,
  type WorkspacePresentationSlot,
} from "../src/state/directory-workspace-store"
import { workspaceChatKeyForSession, type WorkspaceChatKey } from "../src/lib/workspace-chat-key"
import { useChatStore } from "../src/state/chat-store"
import { BUSY_SESSION_STATUS } from "../src/state/session-status"
import type { SessionInfo } from "../src/state/chat-types"

const DIRECTORY = "/workspace/chat-transition"
const OTHER_DIRECTORY = "/workspace/chat-transition-other"
const WHITEBOARD_TARGET = {
  type: "object",
  ref: {
    kind: "whiteboard",
    objectID: "whiteboard-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "canvas",
} satisfies BenchTarget
const WHITEBOARD_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: WHITEBOARD_TARGET,
  mode: BENCH_CHAT_LAYOUT_DOCKED,
} satisfies BenchRouteSnapshot
const CLOSED_ROUTE = { status: BENCH_ROUTE_STATUS_CLOSED } satisfies BenchRouteSnapshot
const CHAT_A_KEY = workspaceChatKeyForSession("session-a")
const CHAT_B_KEY = workspaceChatKeyForSession("session-b")
const OTHER_CHAT_KEY = workspaceChatKeyForSession("session-other")
const controllers: DirectoryWorkspaceController[] = []

function session(id: string, updated: number): SessionInfo {
  return {
    id,
    title: id,
    time: {
      created: updated,
      updated,
    },
  }
}

function deferredValue<T>() {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve(value: T) {
      resolvePromise?.(value)
    },
  }
}

function routeLocation(directory: string, route: BenchRouteSnapshot) {
  if (route.status === BENCH_ROUTE_STATUS_CLOSED) {
    return {
      pathname: `/${encodeDirectory(directory)}/chat`,
      search: {},
    }
  }
  if (route.target.type === "workspace-file") {
    return {
      pathname: `/${encodeDirectory(directory)}/${route.target.viewer}`,
      search: { path: route.target.path },
    }
  }
  return {
    pathname: `/${encodeDirectory(directory)}/objects/${route.target.ref.kind}/${route.target.ref.objectID}`,
    search: { view: route.target.viewID },
  }
}

function registerBlockingWhiteboardWorkspace() {
  const store = createDirectoryWorkspaceStore({
    directory: DIRECTORY,
    initialState: {
      docked: createExpandedWorkspaceState(null),
      hydration: { status: "ready" },
    },
  })
  const blocker = new DirectoryWorkspaceBlocker({
    directory: DIRECTORY,
    getCurrentRoute: () => WHITEBOARD_ROUTE,
    guardLeave: () => ({
      status: "block",
      reason: "dirty",
      message: "Save the whiteboard before leaving.",
    }),
  })
  const controller = new DirectoryWorkspaceController({
    directory: DIRECTORY,
    store,
    blocker,
    getRoute: () => WHITEBOARD_ROUTE,
    navigate: async () => {
      const blocked = await blocker.shouldBlockNavigation({
        pathname: `/${encodeDirectory(DIRECTORY)}/chat`,
        search: {},
      })
      return blocked
        ? {
            pathname: `/${encodeDirectory(DIRECTORY)}/objects/whiteboard/whiteboard-1`,
            search: { view: "canvas" },
          }
        : {
            pathname: `/${encodeDirectory(DIRECTORY)}/chat`,
            search: {},
          }
    },
  })
  controllers.push(controller)
  registerLiveDirectoryWorkspace({
    directory: DIRECTORY,
    controller,
    getRoute: () => WHITEBOARD_ROUTE,
    setActiveSessionContext: async () => undefined,
    persist: async () => undefined,
    isDisposed: () => controller.isDisposed(),
  })
}

function registerRestoringWorkspace() {
  let route: BenchRouteSnapshot = WHITEBOARD_ROUTE
  const chatASlot: WorkspacePresentationSlot = {
    route: WHITEBOARD_ROUTE,
    docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_FILES),
    lastDrawer: WORKSPACE_DRAWER_FILES,
  }
  const chatBSlot: WorkspacePresentationSlot = {
    route: CLOSED_ROUTE,
    docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_SKILLS),
    lastDrawer: WORKSPACE_DRAWER_SKILLS,
  }
  const slots: Partial<Record<WorkspaceChatKey, WorkspacePresentationSlot>> = {}
  slots[CHAT_A_KEY] = chatASlot
  slots[CHAT_B_KEY] = chatBSlot
  const store = createDirectoryWorkspaceStore({
    directory: DIRECTORY,
    initialState: {
      activeChatKey: CHAT_A_KEY,
      slots,
      docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_FILES),
      lastDrawer: WORKSPACE_DRAWER_FILES,
      hydration: { status: "ready" },
    },
  })
  const guardCalls: BenchTarget[] = []
  const sessionContexts: Array<string | undefined> = []
  const blocker = new DirectoryWorkspaceBlocker({
    directory: DIRECTORY,
    getCurrentRoute: () => route,
    guardLeave: (input) => {
      guardCalls.push(input.current)
      return { status: "allow" }
    },
  })
  const controller = new DirectoryWorkspaceController({
    directory: DIRECTORY,
    store,
    blocker,
    getRoute: () => route,
    navigate: async () => {
      route = store.getState().slots[store.getState().activeChatKey]?.route ?? CLOSED_ROUTE
      return routeLocation(DIRECTORY, route)
    },
  })
  controllers.push(controller)
  registerLiveDirectoryWorkspace({
    directory: DIRECTORY,
    controller,
    getRoute: () => route,
    setActiveSessionContext: async (sessionID) => {
      sessionContexts.push(sessionID)
    },
    persist: async () => undefined,
    isDisposed: () => controller.isDisposed(),
  })
  return {
    store,
    blocker,
    guardCalls,
    sessionContexts,
    readRoute: () => route,
  }
}

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.dispose()
  }
  resetLiveDirectoryWorkspaceRegistryForTests()
  resetActiveChatTransitionStateForTests()
  useChatStore.getState().resetRuntimeState()
  if (typeof localStorage !== "undefined") localStorage.clear()
})

describe("active chat transition coordinator", () => {
  test("does not mutate chat state when a live workspace blocks preparation", async () => {
    useChatStore.getState().setActiveDirectory(DIRECTORY)
    registerBlockingWhiteboardWorkspace()
    let mutated = false

    const result = await runPreparedActiveChatMutation({
      directory: DIRECTORY,
      mutate: () => {
        mutated = true
        return "changed"
      },
    })

    expect(result.outcome).toBe("blocked")
    expect(mutated).toBeFalse()
    expect(useChatStore.getState().activeDirectory).toBe(DIRECTORY)
  })

  test("same-directory activation is a workspace no-op but still performs navigation", async () => {
    useChatStore.getState().setActiveDirectory(DIRECTORY)
    registerBlockingWhiteboardWorkspace()
    let navigatedDirectory: string | undefined

    const result = await activateChatDirectory({
      directory: DIRECTORY,
      navigate: (directory) => {
        navigatedDirectory = directory
      },
    })

    expect(result.outcome).toBe("noop")
    expect(navigatedDirectory).toBe(DIRECTORY)
  })

  test("keeps the previous global directory authoritative when mutation fails", async () => {
    useChatStore.getState().setActiveDirectory(DIRECTORY)

    const result = await runPreparedActiveChatMutation({
      directory: OTHER_DIRECTORY,
      mutate: () => {
        throw new Error("selection failed")
      },
    })

    expect(result).toMatchObject({ outcome: "failed" })
    expect(useChatStore.getState().activeDirectory).toBe(DIRECTORY)
  })

  test("restores each chat's own route and drawer through the serialized coordinator", async () => {
    useChatStore.getState().setActiveDirectory(DIRECTORY)
    useChatStore.getState().setActiveSession(DIRECTORY, "session-a")
    const workspace = registerRestoringWorkspace()

    const selectB = await runPreparedActiveChatMutation({
      directory: DIRECTORY,
      mutate: () => {
        useChatStore.getState().setActiveSession(DIRECTORY, "session-b")
        return "session-b"
      },
    })

    expect(selectB).toMatchObject({ outcome: "committed", value: "session-b" })
    expect(workspace.readRoute()).toEqual(CLOSED_ROUTE)
    expect(workspace.store.getState()).toMatchObject({
      activeChatKey: CHAT_B_KEY,
      docked: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        drawer: WORKSPACE_DRAWER_SKILLS,
      },
      lastDrawer: WORKSPACE_DRAWER_SKILLS,
      pendingIntent: null,
    })

    const selectA = await runPreparedActiveChatMutation({
      directory: DIRECTORY,
      mutate: () => {
        useChatStore.getState().setActiveSession(DIRECTORY, "session-a")
        return "session-a"
      },
    })

    expect(selectA).toMatchObject({ outcome: "committed", value: "session-a" })
    expect(workspace.readRoute()).toEqual(WHITEBOARD_ROUTE)
    expect(workspace.store.getState()).toMatchObject({
      activeChatKey: CHAT_A_KEY,
      docked: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        drawer: WORKSPACE_DRAWER_FILES,
      },
      lastDrawer: WORKSPACE_DRAWER_FILES,
      pendingIntent: null,
    })
    expect(workspace.guardCalls).toHaveLength(1)
    expect(workspace.sessionContexts).toEqual([undefined, "session-b", undefined, "session-a"])
  })

  test("restores the successor workspace when the deleted active session was busy", async () => {
    const store = useChatStore.getState()
    store.setActiveDirectory(DIRECTORY)
    store.setSessions(DIRECTORY, [session("session-a", 2), session("session-b", 1)])
    store.applySessionStatus(DIRECTORY, "session-a", BUSY_SESSION_STATUS)
    const workspace = registerRestoringWorkspace()

    const result = await runPreparedActiveChatMutation({
      directory: DIRECTORY,
      mutate: () => {
        useChatStore.getState().applySessionsDeleted(DIRECTORY, ["session-a"])
        return true
      },
    })

    expect(result).toMatchObject({ outcome: "committed", value: true })
    expect(useChatStore.getState().directories[DIRECTORY]).toMatchObject({
      isBusy: false,
      sessionID: "session-b",
      sessions: [session("session-b", 1)],
    })
    expect(workspace.readRoute()).toEqual(CLOSED_ROUTE)
    expect(workspace.store.getState().activeChatKey).toBe(CHAT_B_KEY)
    expect(workspace.sessionContexts).toEqual([undefined, "session-b"])
  })

  test("reads and navigates directly to a cross-directory chat slot", async () => {
    useChatStore.getState().setActiveSession(DIRECTORY, "session-a")
    useChatStore.getState().setActiveSession(OTHER_DIRECTORY, "session-other")
    useChatStore.getState().setActiveDirectory(DIRECTORY)
    const workspace = registerRestoringWorkspace()
    await writePersistedWorkspaceSlot({
      directory: OTHER_DIRECTORY,
      chatKey: OTHER_CHAT_KEY,
      slot: {
        route: WHITEBOARD_ROUTE,
        docked: createExpandedWorkspaceState(WORKSPACE_DRAWER_FILES),
        lastDrawer: WORKSPACE_DRAWER_FILES,
      },
    })
    let navigated:
      | {
          directory: string
          route: BenchRouteSnapshot
        }
      | undefined

    const result = await runPreparedActiveChatMutation({
      directory: OTHER_DIRECTORY,
      mutate: () => "changed-directory",
      navigate: async (directory, route) => {
        navigated = { directory, route }
        const blocked = await workspace.blocker.shouldBlockNavigation(
          routeLocation(directory, route),
        )
        expect(blocked).toBeFalse()
      },
    })

    expect(result).toMatchObject({
      outcome: "committed",
      value: "changed-directory",
    })
    expect(navigated).toEqual({
      directory: OTHER_DIRECTORY,
      route: WHITEBOARD_ROUTE,
    })
    expect(workspace.guardCalls).toHaveLength(1)
    expect(useChatStore.getState().activeDirectory).toBe(OTHER_DIRECTORY)
  })

  test("serializes mutations and lets the latest requested transition own the final state", async () => {
    const firstMutation = deferredValue<string>()
    const firstStarted = deferredValue<void>()
    const mutationOrder: string[] = []
    const first = runPreparedActiveChatMutation({
      directory: DIRECTORY,
      mutate: async () => {
        mutationOrder.push("first-started")
        firstStarted.resolve()
        const value = await firstMutation.promise
        mutationOrder.push("first-finished")
        return value
      },
    })
    await firstStarted.promise

    const second = runPreparedActiveChatMutation({
      directory: OTHER_DIRECTORY,
      mutate: () => {
        mutationOrder.push("second")
        return "second-value"
      },
    })
    firstMutation.resolve("first-value")

    await expect(first).resolves.toMatchObject({ outcome: "superseded" })
    await expect(second).resolves.toMatchObject({
      outcome: "committed",
      value: "second-value",
    })
    expect(mutationOrder).toEqual(["first-started", "first-finished", "second"])
    expect(useChatStore.getState().activeDirectory).toBe(OTHER_DIRECTORY)
  })
})
