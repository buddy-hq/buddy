import { afterEach, describe, expect, test } from "bun:test"
import {
  DirectoryWorkspaceBlocker,
  DirectoryWorkspaceController,
} from "../src/lib/directory-workspace-controller"
import {
  getLiveDirectoryWorkspace,
  registerLiveDirectoryWorkspace,
  resetLiveDirectoryWorkspaceRegistryForTests,
} from "../src/lib/directory-workspace-registry"
import {
  BENCH_ROUTE_STATUS_CLOSED,
  createCollapsedWorkspaceState,
  createDirectoryWorkspaceStore,
  effectiveWorkspaceProjection,
  type BenchRouteSnapshot,
} from "../src/state/directory-workspace-store"

const DIRECTORY = "/workspace/registry"
const CLOSED_ROUTE = { status: BENCH_ROUTE_STATUS_CLOSED } satisfies BenchRouteSnapshot
const controllers: DirectoryWorkspaceController[] = []

function createLiveHandle(directory = DIRECTORY) {
  const store = createDirectoryWorkspaceStore({
    directory,
    initialState: {
      docked: createCollapsedWorkspaceState(),
      hydration: { status: "ready" },
    },
  })
  const blocker = new DirectoryWorkspaceBlocker({
    directory,
    getCurrentRoute: () => CLOSED_ROUTE,
    guardLeave: () => ({ status: "allow" }),
  })
  const controller = new DirectoryWorkspaceController({
    directory,
    store,
    blocker,
    getRoute: () => CLOSED_ROUTE,
    navigate: async () => ({ pathname: "/workspace/registry/chat", search: {} }),
  })
  controllers.push(controller)
  return {
    directory,
    controller,
    getRoute: () => CLOSED_ROUTE,
    getProjection: () =>
      effectiveWorkspaceProjection(
        CLOSED_ROUTE,
        {
          docked: store.getState().docked,
          lastDrawer: store.getState().lastDrawer,
        },
        store.getState().pendingIntent,
      ),
    setActiveSessionContext: async () => undefined,
    persist: async () => undefined,
    isDisposed: () => controller.isDisposed(),
  }
}

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.dispose()
  }
  resetLiveDirectoryWorkspaceRegistryForTests()
})

describe("directory workspace registry", () => {
  test("canonicalizes directory keys", () => {
    const handle = createLiveHandle()
    registerLiveDirectoryWorkspace(handle)

    expect(getLiveDirectoryWorkspace(`${DIRECTORY}/`)?.controller).toBe(handle.controller)
  })

  test("an older unregister cannot remove a newer registration", () => {
    const first = createLiveHandle()
    const unregisterFirst = registerLiveDirectoryWorkspace(first)
    const second = createLiveHandle()
    registerLiveDirectoryWorkspace(second)

    unregisterFirst()

    expect(getLiveDirectoryWorkspace(DIRECTORY)?.controller).toBe(second.controller)
  })

  test("drops disposed controllers instead of returning stale handles", () => {
    const handle = createLiveHandle()
    registerLiveDirectoryWorkspace(handle)

    handle.controller.dispose()

    expect(getLiveDirectoryWorkspace(DIRECTORY)).toBeUndefined()
  })
})
