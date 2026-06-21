import { afterEach, describe, expect, test } from "bun:test"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import type { BenchLeaveGuardInput, BenchLeaveGuardResult } from "../src/lib/bench-leave-guard"
import { encodeDirectory } from "../src/lib/directory-token"
import {
  DirectoryWorkspaceBlocker,
  DirectoryWorkspaceController,
} from "../src/lib/directory-workspace-controller"
import {
  BENCH_ROUTE_STATUS_CLOSED,
  BENCH_ROUTE_STATUS_OPEN,
  WORKSPACE_DRAWER_LIBRARY,
  WORKSPACE_VISIBILITY_COLLAPSED,
  WORKSPACE_VISIBILITY_EXPANDED,
  createCollapsedWorkspaceState,
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  type BenchRouteSnapshot,
  type DirectoryWorkspaceCommand,
} from "../src/state/directory-workspace-store"

const DIRECTORY = "/workspace/controller-test"
const OTHER_DIRECTORY = "/workspace/controller-other"
const FILE_TARGET = {
  type: "workspace-file",
  path: "docs/intro.md",
  viewer: "markdown",
} satisfies BenchTarget
const NEXT_FILE_TARGET = {
  type: "workspace-file",
  path: "docs/next.md",
  viewer: "markdown",
} satisfies BenchTarget
const OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "resource-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget

const CLOSED_ROUTE = { status: BENCH_ROUTE_STATUS_CLOSED } satisfies BenchRouteSnapshot
const DOCKED_FILE_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: FILE_TARGET,
  mode: BENCH_CHAT_LAYOUT_DOCKED,
} satisfies BenchRouteSnapshot
const DOCKED_NEXT_FILE_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: NEXT_FILE_TARGET,
  mode: BENCH_CHAT_LAYOUT_DOCKED,
} satisfies BenchRouteSnapshot
const FLOATING_FILE_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: FILE_TARGET,
  mode: BENCH_CHAT_LAYOUT_FLOATING,
} satisfies BenchRouteSnapshot

const cleanupCallbacks: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanupCallbacks.splice(0).toReversed()) {
    cleanup()
  }
})

function routeLocation(
  route: BenchRouteSnapshot,
  targetDirectory = DIRECTORY,
): { pathname: string; search: Record<string, string> } {
  const directory = encodeDirectory(targetDirectory)
  if (route.status === BENCH_ROUTE_STATUS_CLOSED) {
    return { pathname: `/${directory}/chat`, search: {} }
  }

  const modeSearch: Record<string, string> =
    route.mode === BENCH_CHAT_LAYOUT_FLOATING
      ? { [BENCH_CHAT_SEARCH_PARAM]: BENCH_CHAT_LAYOUT_FLOATING }
      : {}

  if (route.target.type === "workspace-file") {
    return {
      pathname: `/${directory}/${route.target.viewer}`,
      search: { path: route.target.path, ...modeSearch },
    }
  }

  return {
    pathname: `/${directory}/objects/${route.target.ref.kind}/${encodeURIComponent(
      route.target.ref.objectID,
    )}`,
    search: {
      view: route.target.viewID,
      ...(route.target.ref.revisionID ? { revision: route.target.ref.revisionID } : {}),
      ...(route.target.ref.itemID ? { item: route.target.ref.itemID } : {}),
      ...modeSearch,
    },
  }
}

function allowLeave(): BenchLeaveGuardResult {
  return { status: "allow" }
}

function blockLeave(): BenchLeaveGuardResult {
  return {
    status: "block",
    reason: "dirty",
    message: "Dirty target",
  }
}

function createHarness(input?: {
  initialRoute?: BenchRouteSnapshot
  initialExpanded?: boolean
  hydrate?: boolean
  navigationFails?: boolean
  lagRouteCommit?: boolean
  guard?: (call: BenchLeaveGuardInput) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
}) {
  let route = input?.initialRoute ?? CLOSED_ROUTE
  let nextRoute: BenchRouteSnapshot | undefined
  let nextDirectory = DIRECTORY
  let navigatedLocation = routeLocation(route)
  const guardCalls: BenchLeaveGuardInput[] = []
  const store = createDirectoryWorkspaceStore({
    directory: DIRECTORY,
    initialState: {
      docked: input?.initialExpanded
        ? createExpandedWorkspaceState(null)
        : createCollapsedWorkspaceState(),
    },
  })
  const blocker = new DirectoryWorkspaceBlocker({
    directory: DIRECTORY,
    getCurrentRoute: () => route,
    guardLeave: async (call) => {
      guardCalls.push(call)
      return input?.guard ? input.guard(call) : allowLeave()
    },
  })
  const controller = new DirectoryWorkspaceController({
    directory: DIRECTORY,
    store,
    getRoute: () => route,
    blocker,
    navigate: async () => {
      if (input?.navigationFails) {
        throw new Error("Navigation failed")
      }
      const destination = nextRoute
      const destinationDirectory = nextDirectory
      nextRoute = undefined
      nextDirectory = DIRECTORY
      if (!destination) {
        throw new Error("Missing test destination route")
      }
      const destinationLocation = routeLocation(destination, destinationDirectory)
      const blocked = await blocker.shouldBlockNavigation(destinationLocation)
      if (!blocked) {
        navigatedLocation = destinationLocation
        if (destinationDirectory === DIRECTORY && !input?.lagRouteCommit) {
          route = destination
        }
      }
      return navigatedLocation
    },
  })
  if (input?.hydrate !== false) {
    store.getState().finishHydration({
      docked: input?.initialExpanded
        ? createExpandedWorkspaceState(null)
        : createCollapsedWorkspaceState(),
      lastDrawer: WORKSPACE_DRAWER_LIBRARY,
      hydration: { status: "ready" },
    })
  }

  const cleanup = () => {
    controller.dispose()
  }
  cleanupCallbacks.push(cleanup)

  return {
    controller,
    store,
    guardCalls,
    readRoute: () => route,
    readNavigatedLocation: () => navigatedLocation,
    setNextRoute: (routeToCommit: BenchRouteSnapshot, directory = DIRECTORY) => {
      nextRoute = routeToCommit
      nextDirectory = directory
    },
    execute: async (
      command: DirectoryWorkspaceCommand,
      routeToCommit?: BenchRouteSnapshot,
      directory = command.type === "present" ? command.directory : DIRECTORY,
    ) => {
      nextRoute = routeToCommit
      nextDirectory = directory
      return controller.execute(command)
    },
  }
}

describe("DirectoryWorkspaceController", () => {
  test("releases a controller navigation outcome after settlement", async () => {
    const blocker = new DirectoryWorkspaceBlocker({
      directory: DIRECTORY,
      getCurrentRoute: () => DOCKED_FILE_ROUTE,
      guardLeave: allowLeave,
    })
    blocker.registerControllerAttempt({
      commandID: "command-settlement",
      attemptID: "attempt-settlement",
      origin: "user",
      expectedDirectory: DIRECTORY,
      expectedRoute: CLOSED_ROUTE,
    })

    await expect(blocker.shouldBlockNavigation(routeLocation(CLOSED_ROUTE))).resolves.toBeFalse()
    expect(blocker.readOutcome("attempt-settlement")).toMatchObject({ outcome: "allowed" })

    blocker.finishControllerAttempt("attempt-settlement")

    expect(blocker.readOutcome("attempt-settlement")).toBeUndefined()
  })

  test("queues commands until workspace hydration completes", async () => {
    const harness = createHarness({ hydrate: false })

    const resultPromise = harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_FILE_ROUTE,
    )
    await Promise.resolve()

    expect(harness.readRoute()).toEqual(CLOSED_ROUTE)
    expect(harness.store.getState().hydration).toEqual({ status: "pending" })

    harness.store.getState().finishHydration({
      docked: createCollapsedWorkspaceState(),
      lastDrawer: WORKSPACE_DRAWER_LIBRARY,
      hydration: { status: "ready" },
    })
    harness.controller.drainHydrationQueue()

    await expect(resultPromise).resolves.toMatchObject({
      outcome: "committed",
      projection: {
        route: DOCKED_FILE_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_EXPANDED, drawer: null },
      },
    })
  })

  test("presents a target by committing route and expanded docked state after navigation", async () => {
    const harness = createHarness()

    const result = await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_FILE_ROUTE,
    )

    expect(result).toMatchObject({
      outcome: "committed",
      changed: true,
      projection: {
        route: DOCKED_FILE_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_EXPANDED, drawer: null },
        bench: { visibility: "visible", target: FILE_TARGET, mode: BENCH_CHAT_LAYOUT_DOCKED },
        pending: { status: "none" },
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_FILE_ROUTE)
    expect(harness.store.getState().pendingIntent).toBeNull()
    expect(harness.guardCalls).toHaveLength(0)
  })

  test("changes mode without running the leave guard", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })

    const result = await harness.execute(
      { type: "set-mode", mode: BENCH_CHAT_LAYOUT_FLOATING },
      FLOATING_FILE_ROUTE,
    )

    expect(result.outcome).toBe("committed")
    expect(result.projection).toMatchObject({
      route: FLOATING_FILE_ROUTE,
      dockedState: { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null },
      bench: { visibility: "visible", mode: BENCH_CHAT_LAYOUT_FLOATING },
      pending: { status: "none" },
    })
    expect(harness.guardCalls).toHaveLength(0)
  })

  test("runs one leave guard for target replacement and records the controller origin", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })
    harness.setNextRoute(DOCKED_NEXT_FILE_ROUTE)
    const result = await harness.controller.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: NEXT_FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      { origin: "agent" },
    )

    expect(result.outcome).toBe("committed")
    expect(harness.guardCalls).toEqual([
      {
        intent: "replace-target",
        origin: "agent",
        current: FILE_TARGET,
        next: NEXT_FILE_TARGET,
      },
    ])
  })

  test("settles a navigation result from the verified destination when the route ref has not rendered yet", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
      lagRouteCommit: true,
    })
    harness.setNextRoute(DOCKED_NEXT_FILE_ROUTE)

    const result = await harness.controller.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: NEXT_FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      { origin: "agent" },
    )

    expect(harness.readRoute()).toEqual(DOCKED_FILE_ROUTE)
    expect(result).toMatchObject({
      outcome: "committed",
      projection: {
        route: DOCKED_NEXT_FILE_ROUTE,
        bench: {
          visibility: "visible",
          target: NEXT_FILE_TARGET,
        },
        pending: { status: "none" },
      },
    })
  })

  test("reveals the same already-open parked target without navigation", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: false,
    })

    const result = await harness.controller.executeOpen({
      directory: DIRECTORY,
      target: FILE_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      autoOpen: null,
    })

    expect(result).toMatchObject({
      outcome: "committed",
      changed: true,
      decision: { action: "ignore", policyID: "already-open" },
      projection: {
        route: DOCKED_FILE_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_EXPANDED },
        bench: { visibility: "visible", target: FILE_TARGET },
      },
    })
    expect(harness.guardCalls).toHaveLength(0)
  })

  test("preserves agent origin when closing through the leave guard", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })
    harness.setNextRoute(CLOSED_ROUTE)

    const result = await harness.controller.execute({ type: "close" }, { origin: "agent" })

    expect(result.outcome).toBe("committed")
    expect(harness.guardCalls).toEqual([
      {
        intent: "close",
        origin: "agent",
        current: FILE_TARGET,
        next: null,
      },
    ])
  })

  test("presents a target in another directory through the current controller", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })
    harness.setNextRoute(DOCKED_NEXT_FILE_ROUTE, OTHER_DIRECTORY)

    const result = await harness.controller.execute(
      {
        type: "present",
        directory: OTHER_DIRECTORY,
        target: NEXT_FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      { origin: "user" },
    )

    expect(result).toMatchObject({ outcome: "committed", changed: true })
    expect(harness.readNavigatedLocation()).toEqual(
      routeLocation(DOCKED_NEXT_FILE_ROUTE, OTHER_DIRECTORY),
    )
    expect(harness.readRoute()).toEqual(DOCKED_FILE_ROUTE)
    expect(harness.store.getState().pendingIntent).toBeNull()
    expect(harness.guardCalls).toEqual([
      {
        intent: "replace-target",
        origin: "user",
        current: FILE_TARGET,
        next: NEXT_FILE_TARGET,
      },
    ])
  })

  test("blocked close preserves the previous route and clears the pending intent", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
      guard: () => blockLeave(),
    })

    const result = await harness.execute({ type: "close" }, CLOSED_ROUTE)

    expect(result).toMatchObject({
      outcome: "blocked",
      reason: "leave_guard_blocked",
      projection: {
        route: DOCKED_FILE_ROUTE,
        bench: { visibility: "visible", target: FILE_TARGET },
        pending: { status: "none" },
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_FILE_ROUTE)
    expect(harness.store.getState().pendingIntent).toBeNull()
    expect(harness.guardCalls).toHaveLength(1)
  })

  test("navigation failure clears pending intent before reporting failed projection", async () => {
    const harness = createHarness({ navigationFails: true })

    const result = await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: OBJECT_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      {
        status: BENCH_ROUTE_STATUS_OPEN,
        target: OBJECT_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
    )

    expect(result).toMatchObject({
      outcome: "failed",
      reason: "navigation_failed",
      projection: {
        route: CLOSED_ROUTE,
        bench: { visibility: "closed" },
        pending: { status: "none" },
      },
    })
    expect(harness.store.getState().pendingIntent).toBeNull()
  })

  test("executeOpen preserves a failed terminal outcome instead of returning policy success", async () => {
    const harness = createHarness({ navigationFails: true })

    const openResult = await harness.controller.executeOpen({
      directory: DIRECTORY,
      target: OBJECT_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      autoOpen: null,
    })

    expect(openResult).toMatchObject({
      outcome: "failed",
      reason: "navigation_failed",
      projection: {
        route: CLOSED_ROUTE,
        bench: { visibility: "closed" },
      },
    })
    expect("decision" in openResult).toBe(false)
  })

  test("executeOpen reports inactive after controller disposal", async () => {
    const harness = createHarness()
    harness.controller.dispose()

    const openResult = await harness.controller.executeOpen({
      directory: DIRECTORY,
      target: FILE_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
      autoOpen: null,
    })

    expect(openResult).toMatchObject({
      outcome: "inactive",
      reason: "session_inactive",
    })
  })

  test("workspace-only drawer commands commit without navigation and update last drawer", async () => {
    const harness = createHarness()

    const result = await harness.execute({ type: "open-drawer", drawer: WORKSPACE_DRAWER_LIBRARY })

    expect(result).toMatchObject({
      outcome: "committed",
      changed: true,
      projection: {
        route: CLOSED_ROUTE,
        drawer: WORKSPACE_DRAWER_LIBRARY,
        renderedSurface: "drawer",
        pending: { status: "none" },
      },
    })
    expect(harness.store.getState().lastDrawer).toBe(WORKSPACE_DRAWER_LIBRARY)
  })

  test("a newer command supersedes an awaiting guarded navigation", async () => {
    let resolveGuard: ((result: BenchLeaveGuardResult) => void) | undefined
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
      guard: () =>
        new Promise<BenchLeaveGuardResult>((resolve) => {
          resolveGuard = resolve
        }),
    })

    harness.setNextRoute(CLOSED_ROUTE)
    const closeResultPromise = harness.controller.execute({ type: "close" })
    await Promise.resolve()
    const collapseResult = await harness.controller.execute({ type: "collapse" })
    if (!resolveGuard) {
      throw new Error("Expected guard to be awaiting resolution")
    }
    resolveGuard(allowLeave())
    const closeResult = await closeResultPromise

    expect(collapseResult.outcome).toBe("committed")
    expect(closeResult).toMatchObject({
      outcome: "superseded",
      reason: "newer_command",
      projection: {
        route: DOCKED_FILE_ROUTE,
        bench: { visibility: "visible" },
        pending: { status: "none" },
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_FILE_ROUTE)
    expect(harness.guardCalls).toHaveLength(1)
  })
})
