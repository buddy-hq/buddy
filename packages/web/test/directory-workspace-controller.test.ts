import { afterEach, describe, expect, test } from "bun:test"
import type { NavigateOptions } from "@tanstack/react-router"
import {
  BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
  BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  BENCH_MODE_REQUEST_POLICY,
  type BenchSessionTarget,
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
  WORKSPACE_DESTINATION_EMPTY,
  WORKSPACE_DESTINATION_INHERIT_CURRENT,
  WORKSPACE_DESTINATION_RESTORE,
  WORKSPACE_DRAWER_FILES,
  WORKSPACE_DRAWER_SKILLS,
  WORKSPACE_DRAWER_SOURCES,
  WORKSPACE_VISIBILITY_COLLAPSED,
  WORKSPACE_VISIBILITY_EXPANDED,
  createCollapsedWorkspaceState,
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  type BenchRouteSnapshot,
  type DirectoryWorkspaceCommand,
} from "../src/state/directory-workspace-store"
import { workspaceChatKeyForSession } from "../src/lib/workspace-chat-key"
import { benchTabKey } from "../src/lib/bench-tabs"

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
const HTML_WIDGET_TARGET = {
  type: "object",
  ref: {
    kind: "html-widget",
    objectID: "widget-1",
    revisionID: null,
    itemID: null,
  },
  viewID: "runtime",
} satisfies BenchTarget
const SESSION_TARGET = {
  type: "session",
  sessionID: "subagent-1",
} satisfies BenchSessionTarget

const CLOSED_ROUTE = { status: BENCH_ROUTE_STATUS_CLOSED } satisfies BenchRouteSnapshot
const CHAT_A_KEY = workspaceChatKeyForSession(undefined)
const CHAT_B_KEY = workspaceChatKeyForSession("session-b")
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
const DOCKED_WHITEBOARD_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: WHITEBOARD_TARGET,
  mode: BENCH_CHAT_LAYOUT_DOCKED,
} satisfies BenchRouteSnapshot
const DOCKED_HTML_WIDGET_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: HTML_WIDGET_TARGET,
  mode: BENCH_CHAT_LAYOUT_DOCKED,
} satisfies BenchRouteSnapshot
const DOCKED_SESSION_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: SESSION_TARGET,
  mode: BENCH_CHAT_LAYOUT_DOCKED,
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
) {
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

  if (route.target.type === "session") {
    return {
      pathname: `/${directory}/sessions/${encodeURIComponent(route.target.sessionID)}`,
      search: modeSearch,
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
  let navigatedOptions: NavigateOptions | undefined
  const navigationEvents: string[] = []
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
      navigationEvents.push("guard")
      guardCalls.push(call)
      return input?.guard ? input.guard(call) : allowLeave()
    },
  })
  const controller = new DirectoryWorkspaceController({
    directory: DIRECTORY,
    store,
    getRoute: () => route,
    blocker,
    navigate: async (options) => {
      navigationEvents.push("navigate")
      navigatedOptions = options
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
      lastDrawer: WORKSPACE_DRAWER_SOURCES,
      hydration: { status: "ready" },
    })
  }

  const cleanup = () => {
    controller.dispose()
  }
  cleanupCallbacks.push(cleanup)

  return {
    controller,
    blocker,
    store,
    guardCalls,
    readRoute: () => route,
    readNavigatedLocation: () => navigatedLocation,
    readNavigatedOptions: () => navigatedOptions,
    readNavigationEvents: () => navigationEvents,
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
      lastDrawer: WORKSPACE_DRAWER_SOURCES,
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
    expect(harness.store.getState().slots[CHAT_A_KEY]?.tabs).toEqual([
      { key: benchTabKey(FILE_TARGET), target: FILE_TARGET },
    ])
    expect(harness.guardCalls).toHaveLength(0)
    expect(harness.readNavigatedOptions()).toMatchObject({
      viewTransition: false,
    })
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
    expect(harness.store.getState().slots[CHAT_A_KEY]).toMatchObject({
      route: FLOATING_FILE_ROUTE,
    })
    expect(harness.guardCalls).toHaveLength(0)
  })

  test("restores a chat-local floating mode after visiting another chat", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })

    await harness.execute(
      { type: "set-mode", mode: BENCH_CHAT_LAYOUT_FLOATING },
      FLOATING_FILE_ROUTE,
    )
    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_EMPTY,
    })
    await harness.execute({ type: "restore-chat", chatKey: CHAT_B_KEY }, CLOSED_ROUTE)
    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_B_KEY,
      destinationChatKey: CHAT_A_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })
    const restoration = await harness.execute(
      { type: "restore-chat", chatKey: CHAT_A_KEY },
      FLOATING_FILE_ROUTE,
    )

    expect(restoration).toMatchObject({
      outcome: "committed",
      projection: {
        route: FLOATING_FILE_ROUTE,
        bench: { visibility: "visible", mode: BENCH_CHAT_LAYOUT_FLOATING },
      },
    })
  })

  test("inherits the visible book into an independent destination slot", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_OBJECT_ROUTE,
      initialExpanded: true,
    })

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_INHERIT_CURRENT,
    })
    const sourceSlot = harness.store.getState().slots[CHAT_A_KEY]
    const destinationSlot = harness.store.getState().slots[CHAT_B_KEY]
    expect(destinationSlot).toEqual(sourceSlot)
    expect(destinationSlot).not.toBe(sourceSlot)

    const restoration = await harness.execute(
      { type: "restore-chat", chatKey: CHAT_B_KEY },
      DOCKED_OBJECT_ROUTE,
    )
    expect(restoration).toMatchObject({
      outcome: "committed",
      projection: {
        route: DOCKED_OBJECT_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_EXPANDED, drawer: null },
        bench: { visibility: "visible", mode: BENCH_CHAT_LAYOUT_DOCKED },
      },
    })
  })

  test("inherits only the selected target into a new chat", async () => {
    const harness = createHarness()
    await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_FILE_ROUTE,
    )
    await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: NEXT_FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_NEXT_FILE_ROUTE,
    )

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_INHERIT_CURRENT,
    })

    expect(harness.store.getState().slots[CHAT_A_KEY]?.tabs.map((tab) => tab.key)).toEqual([
      benchTabKey(FILE_TARGET),
      benchTabKey(NEXT_FILE_TARGET),
    ])
    expect(harness.store.getState().slots[CHAT_B_KEY]?.tabs).toEqual([
      { key: benchTabKey(NEXT_FILE_TARGET), target: NEXT_FILE_TARGET },
    ])
  })

  test("focuses tabs and closes the selected tab with the right-hand fallback", async () => {
    const harness = createHarness()
    await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_FILE_ROUTE,
    )
    await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: NEXT_FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_NEXT_FILE_ROUTE,
    )

    const focused = await harness.execute(
      { type: "focus-tab", tabKey: benchTabKey(FILE_TARGET) },
      DOCKED_FILE_ROUTE,
    )
    expect(focused).toMatchObject({
      outcome: "committed",
      projection: { route: DOCKED_FILE_ROUTE },
    })

    const closed = await harness.execute(
      { type: "close-tab", tabKey: benchTabKey(FILE_TARGET) },
      DOCKED_NEXT_FILE_ROUTE,
    )
    expect(closed).toMatchObject({
      outcome: "committed",
      projection: { route: DOCKED_NEXT_FILE_ROUTE },
    })
    expect(harness.store.getState().slots[CHAT_A_KEY]?.tabs).toEqual([
      { key: benchTabKey(NEXT_FILE_TARGET), target: NEXT_FILE_TARGET },
    ])
  })

  test("removes a deleted subagent tab and restores the nearest surviving target", async () => {
    const harness = createHarness()
    await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_FILE_ROUTE,
    )
    await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: SESSION_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_SESSION_ROUTE,
    )

    const removed = await harness.execute(
      { type: "remove-session-targets", sessionIDs: [SESSION_TARGET.sessionID] },
      DOCKED_FILE_ROUTE,
    )

    expect(removed).toMatchObject({
      outcome: "committed",
      changed: true,
      projection: { route: DOCKED_FILE_ROUTE },
    })
    expect(harness.store.getState().slots[CHAT_A_KEY]?.tabs).toEqual([
      { key: benchTabKey(FILE_TARGET), target: FILE_TARGET },
    ])
  })

  test("reveals a parked selected tab without preventing a later user collapse", async () => {
    const harness = createHarness({ initialRoute: DOCKED_FILE_ROUTE })
    const state = harness.store.getState()
    state.captureChatSlot({ chatKey: state.activeChatKey, route: DOCKED_FILE_ROUTE })

    const focused = await harness.controller.execute({
      type: "focus-tab",
      tabKey: benchTabKey(FILE_TARGET),
    })

    expect(focused).toMatchObject({
      outcome: "committed",
      changed: true,
      projection: {
        route: DOCKED_FILE_ROUTE,
        bench: { visibility: "visible" },
      },
    })
    expect(harness.readNavigationEvents()).toEqual([])

    const collapsed = await harness.controller.execute({ type: "collapse" })
    expect(collapsed).toMatchObject({
      outcome: "committed",
      changed: true,
      projection: {
        route: DOCKED_FILE_ROUTE,
        bench: { visibility: "parked" },
      },
    })
  })

  test("supersedes a focus request after its tab has gone stale", async () => {
    const harness = createHarness({ initialRoute: DOCKED_FILE_ROUTE, initialExpanded: true })
    const state = harness.store.getState()
    state.captureChatSlot({ chatKey: state.activeChatKey, route: DOCKED_FILE_ROUTE })

    const result = await harness.controller.execute({
      type: "focus-tab",
      tabKey: "file:markdown:closed.md",
    })

    expect(result).toMatchObject({
      outcome: "superseded",
      reason: "newer_command",
      projection: { route: DOCKED_FILE_ROUTE },
    })
    expect(harness.readRoute()).toEqual(DOCKED_FILE_ROUTE)
    expect(harness.readNavigationEvents()).toEqual([])
  })

  test("closing the final tab closes Bench only after the leave guard allows", async () => {
    const harness = createHarness({ guard: blockLeave })
    await harness.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      DOCKED_FILE_ROUTE,
    )

    const blocked = await harness.execute(
      { type: "close-tab", tabKey: benchTabKey(FILE_TARGET) },
      CLOSED_ROUTE,
    )
    expect(blocked.outcome).toBe("blocked")
    expect(harness.store.getState().slots[CHAT_A_KEY]?.tabs).toEqual([
      { key: benchTabKey(FILE_TARGET), target: FILE_TARGET },
    ])
    expect(harness.readRoute()).toEqual(DOCKED_FILE_ROUTE)
  })

  test("inherits the visible whiteboard without treating it as session-owned", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_WHITEBOARD_ROUTE,
      initialExpanded: true,
    })

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_INHERIT_CURRENT,
    })
    const restoration = await harness.execute(
      { type: "restore-chat", chatKey: CHAT_B_KEY },
      DOCKED_WHITEBOARD_ROUTE,
    )

    expect(restoration).toMatchObject({
      outcome: "committed",
      projection: {
        route: DOCKED_WHITEBOARD_ROUTE,
        bench: { visibility: "visible", target: WHITEBOARD_TARGET },
      },
    })
    expect(harness.guardCalls).toHaveLength(0)
  })

  test("inherits an immersive book with its floating layout mode", async () => {
    const harness = createHarness({
      initialRoute: FLOATING_OBJECT_ROUTE,
      initialExpanded: false,
    })

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_INHERIT_CURRENT,
    })
    const restoration = await harness.execute(
      { type: "restore-chat", chatKey: CHAT_B_KEY },
      FLOATING_OBJECT_ROUTE,
    )

    expect(restoration).toMatchObject({
      outcome: "committed",
      projection: {
        route: FLOATING_OBJECT_ROUTE,
        bench: { visibility: "visible", mode: BENCH_CHAT_LAYOUT_FLOATING },
      },
    })
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
    expect(harness.readNavigatedOptions()).toMatchObject({
      replace: true,
      viewTransition: false,
    })
    expect(harness.readNavigationEvents()).toEqual(["navigate", "guard"])
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
    expect(harness.store.getState().slots[CHAT_A_KEY]?.route).toEqual(DOCKED_NEXT_FILE_ROUTE)
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

  test("whiteboard auto-open reveals an inherited board parked by the new chat", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_WHITEBOARD_ROUTE,
      initialExpanded: false,
    })

    const result = await harness.controller.executeOpen({
      directory: DIRECTORY,
      target: WHITEBOARD_TARGET,
      mode: BENCH_MODE_REQUEST_POLICY,
      autoOpen: {
        policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
        eventKey: "new-chat:whiteboard-update",
      },
    })

    expect(result).toMatchObject({
      outcome: "committed",
      changed: true,
      decision: { action: "ignore", policyID: "already-open" },
      projection: {
        route: DOCKED_WHITEBOARD_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_EXPANDED },
        bench: { visibility: "visible", target: WHITEBOARD_TARGET },
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

    const result = await harness.execute({ type: "open-drawer", drawer: WORKSPACE_DRAWER_SOURCES })

    expect(result).toMatchObject({
      outcome: "committed",
      changed: true,
      projection: {
        route: CLOSED_ROUTE,
        drawer: WORKSPACE_DRAWER_SOURCES,
        renderedSurface: "drawer",
        pending: { status: "none" },
      },
    })
    expect(harness.store.getState().lastDrawer).toBe(WORKSPACE_DRAWER_SOURCES)
  })

  test("prepares a drawer-only workspace by collapsing it without navigation", async () => {
    const harness = createHarness()
    await harness.execute({ type: "open-drawer", drawer: WORKSPACE_DRAWER_SOURCES })

    const result = await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })

    expect(result).toMatchObject({
      outcome: "committed",
      projection: {
        route: CLOSED_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null },
        renderedSurface: "empty",
        pending: { status: "chat-transition" },
      },
    })
    expect(harness.store.getState().lastDrawer).toBe(WORKSPACE_DRAWER_SOURCES)
    expect(harness.readNavigatedOptions()).toBeUndefined()
  })

  test("restores independent workspace presentations when returning to a chat", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })
    await harness.execute({ type: "open-drawer", drawer: WORKSPACE_DRAWER_FILES })

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_EMPTY,
    })
    const chatBRestoration = await harness.execute(
      { type: "restore-chat", chatKey: CHAT_B_KEY },
      CLOSED_ROUTE,
    )

    expect(chatBRestoration).toMatchObject({
      outcome: "committed",
      projection: {
        route: CLOSED_ROUTE,
        drawer: null,
        renderedSurface: "empty",
        pending: { status: "none" },
      },
    })
    await harness.execute({ type: "open-drawer", drawer: WORKSPACE_DRAWER_SKILLS })

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_B_KEY,
      destinationChatKey: CHAT_A_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })
    const chatARestoration = await harness.execute(
      { type: "restore-chat", chatKey: CHAT_A_KEY },
      DOCKED_FILE_ROUTE,
    )

    expect(chatARestoration).toMatchObject({
      outcome: "committed",
      projection: {
        route: DOCKED_FILE_ROUTE,
        drawer: WORKSPACE_DRAWER_FILES,
        renderedSurface: "drawer-over-bench",
        pending: { status: "none" },
      },
    })
    expect(harness.store.getState().slots[CHAT_B_KEY]).toMatchObject({
      route: CLOSED_ROUTE,
      docked: {
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        drawer: WORKSPACE_DRAWER_SKILLS,
      },
      lastDrawer: WORKSPACE_DRAWER_SKILLS,
    })
    expect(harness.guardCalls).toHaveLength(1)
  })

  test("commits a collapsed destination when restore navigation fails", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
      navigationFails: true,
    })

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })
    const restoration = await harness.execute({ type: "restore-chat", chatKey: CHAT_B_KEY })

    expect(restoration.outcome).toBe("failed")
    expect(harness.store.getState().pendingIntent).toBeNull()
    expect(harness.store.getState().slots[CHAT_B_KEY]).toMatchObject({
      route: CLOSED_ROUTE,
      docked: { visibility: WORKSPACE_VISIBILITY_COLLAPSED },
    })

    const recovery = await harness.execute({
      type: "open-drawer",
      drawer: WORKSPACE_DRAWER_SKILLS,
    })

    expect(recovery).toMatchObject({
      outcome: "committed",
      projection: { drawer: WORKSPACE_DRAWER_SKILLS, pending: { status: "none" } },
    })
  })

  test("reuses a settled leave guard for the prepared cross-directory navigation", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })
    const release = harness.controller.authorizePreparedChatNavigation({
      directory: OTHER_DIRECTORY,
      route: CLOSED_ROUTE,
    })
    const blocked = await harness.blocker.shouldBlockNavigation(
      routeLocation(CLOSED_ROUTE, OTHER_DIRECTORY),
    )
    release()

    expect(blocked).toBeFalse()
    expect(harness.guardCalls).toHaveLength(1)
  })

  test("does not capture a stale route when a newer chat change supersedes restoration", async () => {
    const chatCKey = workspaceChatKeyForSession("session-c")
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })

    await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_EMPTY,
    })
    const supersedingPreparation = await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_B_KEY,
      destinationChatKey: chatCKey,
      destinationInitialization: WORKSPACE_DESTINATION_EMPTY,
    })

    expect(harness.store.getState().slots[CHAT_A_KEY]?.route).toEqual(DOCKED_FILE_ROUTE)
    expect(harness.store.getState().slots[CHAT_B_KEY]?.route).toEqual(CLOSED_ROUTE)
    expect(harness.store.getState().activeChatKey).toBe(chatCKey)
    expect(harness.guardCalls).toHaveLength(1)
    expect(supersedingPreparation).toMatchObject({
      projection: {
        pending: {
          status: "chat-transition",
          transitionFrame: { kind: "docked-bench" },
        },
      },
    })
  })

  test("parks a docked directory-owned target during session preparation", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
    })

    const result = await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })

    expect(result).toMatchObject({
      outcome: "committed",
      projection: {
        route: CLOSED_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null },
        bench: { visibility: "closed" },
        pending: { status: "chat-transition" },
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_FILE_ROUTE)
    expect(harness.guardCalls).toEqual([
      {
        intent: "close",
        origin: "user",
        current: FILE_TARGET,
        next: null,
      },
    ])
    expect(harness.readNavigatedOptions()).toBeUndefined()
  })

  test("parks a floating directory-owned target atomically in docked mode", async () => {
    const harness = createHarness({
      initialRoute: FLOATING_FILE_ROUTE,
      initialExpanded: false,
    })

    const result = await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })

    expect(result).toMatchObject({
      outcome: "committed",
      projection: {
        route: CLOSED_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null },
        bench: { visibility: "closed" },
        pending: { status: "chat-transition" },
      },
    })
    expect(harness.readRoute()).toEqual(FLOATING_FILE_ROUTE)
    expect(harness.readNavigatedOptions()).toBeUndefined()
    expect(harness.guardCalls).toEqual([
      {
        intent: "close",
        origin: "user",
        current: FILE_TARGET,
        next: null,
      },
    ])
  })

  test("closes a directory-owned whiteboard only after its leave guard allows", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_WHITEBOARD_ROUTE,
      initialExpanded: true,
    })

    const result = await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })

    expect(result).toMatchObject({
      outcome: "committed",
      projection: {
        route: CLOSED_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_COLLAPSED, drawer: null },
        bench: { visibility: "closed" },
        pending: { status: "chat-transition" },
      },
    })
    expect(harness.guardCalls).toEqual([
      {
        intent: "close",
        origin: "user",
        current: WHITEBOARD_TARGET,
        next: null,
      },
    ])
  })

  test("keeps a directory-owned whiteboard open when preparation is blocked", async () => {
    const harness = createHarness({
      initialRoute: DOCKED_WHITEBOARD_ROUTE,
      initialExpanded: true,
      guard: blockLeave,
    })

    const result = await harness.execute({
      type: "prepare-chat-change",
      outgoingChatKey: CHAT_A_KEY,
      destinationChatKey: CHAT_B_KEY,
      destinationInitialization: WORKSPACE_DESTINATION_RESTORE,
    })

    expect(result).toMatchObject({
      outcome: "blocked",
      projection: {
        route: DOCKED_WHITEBOARD_ROUTE,
        bench: { visibility: "visible", target: WHITEBOARD_TARGET },
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_WHITEBOARD_ROUTE)
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

  test("background auto-open does not supersede an in-flight agent presentation", async () => {
    let resolveGuard: ((result: BenchLeaveGuardResult) => void) | undefined
    const harness = createHarness({
      initialRoute: DOCKED_FILE_ROUTE,
      initialExpanded: true,
      guard: () =>
        new Promise<BenchLeaveGuardResult>((resolve) => {
          resolveGuard = resolve
        }),
    })

    harness.setNextRoute(DOCKED_NEXT_FILE_ROUTE)
    const agentResultPromise = harness.controller.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: NEXT_FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      { origin: "agent" },
    )
    await Promise.resolve()

    const autoOpenResult = await harness.controller.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: OBJECT_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
      {
        origin: "auto-open",
        autoOpen: {
          policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
          eventKey: "stale-resource-auto-open",
        },
      },
    )
    if (!resolveGuard) {
      throw new Error("Expected guard to be awaiting resolution")
    }
    resolveGuard(allowLeave())
    const agentResult = await agentResultPromise

    expect(autoOpenResult).toMatchObject({
      outcome: "superseded",
      reason: "newer_command",
      projection: {
        route: DOCKED_FILE_ROUTE,
      },
    })
    expect(agentResult).toMatchObject({
      outcome: "committed",
      projection: {
        route: DOCKED_NEXT_FILE_ROUTE,
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_NEXT_FILE_ROUTE)
    expect(harness.readNavigationEvents()).toEqual(["navigate", "guard"])
  })

  test("auto-focuses an HTML widget over a visible Bench tab", async () => {
    const harness = createHarness({ initialRoute: DOCKED_FILE_ROUTE, initialExpanded: true })
    const state = harness.store.getState()
    state.captureChatSlot({ chatKey: state.activeChatKey, route: DOCKED_FILE_ROUTE })
    harness.setNextRoute(DOCKED_HTML_WIDGET_ROUTE)

    const result = await harness.controller.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: HTML_WIDGET_TARGET,
        mode: BENCH_MODE_REQUEST_POLICY,
      },
      {
        origin: "auto-open",
        autoOpen: {
          policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
          eventKey: "widget:auto-open",
        },
      },
    )

    expect(result).toMatchObject({
      outcome: "committed",
      changed: true,
      decision: { action: "open", policyID: "preserved-current-mode" },
      projection: {
        route: DOCKED_HTML_WIDGET_ROUTE,
        bench: { visibility: "visible", target: HTML_WIDGET_TARGET },
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_HTML_WIDGET_ROUTE)
    expect(harness.store.getState().slots[harness.store.getState().activeChatKey]?.tabs).toEqual([
      { key: benchTabKey(FILE_TARGET), target: FILE_TARGET },
      { key: benchTabKey(HTML_WIDGET_TARGET), target: HTML_WIDGET_TARGET },
    ])
  })

  test("auto-focuses and reveals an HTML widget while Bench is parked", async () => {
    const harness = createHarness({ initialRoute: DOCKED_FILE_ROUTE, initialExpanded: false })
    const state = harness.store.getState()
    state.captureChatSlot({ chatKey: state.activeChatKey, route: DOCKED_FILE_ROUTE })
    harness.setNextRoute(DOCKED_HTML_WIDGET_ROUTE)

    const result = await harness.controller.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: HTML_WIDGET_TARGET,
        mode: BENCH_MODE_REQUEST_POLICY,
      },
      {
        origin: "auto-open",
        autoOpen: {
          policyID: BENCH_AUTO_OPEN_POLICY_FULLSCREEN_HTML_WIDGET,
          eventKey: "widget:parked-auto-open",
        },
      },
    )

    expect(result).toMatchObject({
      outcome: "committed",
      changed: true,
      decision: { action: "open", policyID: "preserved-current-mode" },
      projection: {
        route: DOCKED_HTML_WIDGET_ROUTE,
        dockedState: { visibility: WORKSPACE_VISIBILITY_EXPANDED },
        bench: { visibility: "visible", target: HTML_WIDGET_TARGET },
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_HTML_WIDGET_ROUTE)
  })

  test("focuses an existing background whiteboard tab when the active chat starts updating it", async () => {
    const harness = createHarness({ initialRoute: DOCKED_FILE_ROUTE, initialExpanded: true })
    const state = harness.store.getState()
    state.captureChatSlot({ chatKey: state.activeChatKey, route: DOCKED_FILE_ROUTE })
    state.presentBackground({
      chatKey: state.activeChatKey,
      target: WHITEBOARD_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    })
    harness.setNextRoute(DOCKED_WHITEBOARD_ROUTE)

    const result = await harness.controller.execute(
      {
        type: "present",
        directory: DIRECTORY,
        target: WHITEBOARD_TARGET,
        mode: BENCH_MODE_REQUEST_POLICY,
      },
      {
        origin: "auto-open",
        autoOpen: {
          policyID: BENCH_AUTO_OPEN_POLICY_WHITEBOARD,
          eventKey: "whiteboard:update",
        },
      },
    )

    expect(result).toMatchObject({
      outcome: "committed",
      changed: true,
      decision: {
        action: "open",
        target: WHITEBOARD_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      },
    })
    expect(harness.readRoute()).toEqual(DOCKED_WHITEBOARD_ROUTE)
  })
})
