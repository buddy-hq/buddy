import { afterEach, describe, expect, test } from "bun:test"
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  DirectoryWorkspaceProvider,
  useDirectoryWorkspace,
} from "../src/components/directory-chat/directory-workspace-context"
import { benchContextTargetFromBenchTarget } from "../src/components/bench/bench-context-utils"
import type { BenchLeaveGuardInput } from "../src/lib/bench-leave-guard"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  benchTargetKey,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import type { DirectoryWorkspaceController } from "../src/lib/directory-workspace-controller"
import type { BenchSurfaceSnapshot } from "../src/lib/directory-workspace-lifecycle"
import { encodeDirectory } from "../src/lib/directory-token"
import type { DirectoryWorkspaceCommandResult } from "../src/state/directory-workspace-store"

const DIRECTORY = "/workspace/navigation-race"
const ENCODED_DIRECTORY = encodeDirectory(DIRECTORY)
const CHAT_PATH = `/${ENCODED_DIRECTORY}/chat`
const MARKDOWN_PATH = `/${ENCODED_DIRECTORY}/markdown`
const TEST_ORIGIN_URL = "http://localhost/"
const FILE_TARGET = {
  type: "workspace-file",
  path: "docs/delayed.md",
  viewer: "markdown",
} satisfies BenchTarget
const OBJECT_TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "replacement-resource",
    revisionID: null,
    itemID: null,
  },
  viewID: "reader",
} satisfies BenchTarget
const OBJECT_PATH = `/${ENCODED_DIRECTORY}/objects/resource/${OBJECT_TARGET.ref.objectID}`
const FLUSH_DELAY_MS = 0
const ROUTE_SETTLE_ATTEMPTS = 20

function flushEffects(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, FLUSH_DELAY_MS)
  })
}

function deferredCompletion() {
  let completePromise: (() => void) | undefined
  const promise = new Promise<void>((resolve) => {
    completePromise = resolve
  })
  return {
    promise,
    complete() {
      completePromise?.()
    },
  }
}

type DirectoryWorkspaceHandle = ReturnType<typeof useDirectoryWorkspace>

function ControllerProbe(props: {
  onController: (controller: DirectoryWorkspaceController) => void
  onWorkspace?: (workspace: DirectoryWorkspaceHandle) => void
}) {
  const workspace = useDirectoryWorkspace()
  props.onController(workspace.controller)
  props.onWorkspace?.(workspace)
  return null
}

function createRouteTree(input: {
  delayedLoader: Promise<void>
  onController: (controller: DirectoryWorkspaceController) => void
  onWorkspace?: (workspace: DirectoryWorkspaceHandle) => void
}) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const directoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory",
    component: () => (
      <DirectoryWorkspaceProvider directory={DIRECTORY}>
        <ControllerProbe onController={input.onController} onWorkspace={input.onWorkspace} />
        <Outlet />
      </DirectoryWorkspaceProvider>
    ),
  })
  const chatRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "chat",
    component: () => null,
  })
  const markdownRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "markdown",
    loader: () => input.delayedLoader,
    component: () => null,
  })
  const objectRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "objects/$kind/$objectID",
    component: () => null,
  })

  return rootRoute.addChildren([directoryRoute.addChildren([chatRoute, markdownRoute, objectRoute])])
}

function createMemoryTestRouter(input: {
  delayedLoader: Promise<void>
  onController: (controller: DirectoryWorkspaceController) => void
  onWorkspace?: (workspace: DirectoryWorkspaceHandle) => void
}) {
  return createRouter({
    routeTree: createRouteTree(input),
    history: createMemoryHistory({
      initialEntries: [CHAT_PATH],
    }),
  })
}

function createBrowserTestRouter(input: {
  delayedLoader: Promise<void>
  onController: (controller: DirectoryWorkspaceController) => void
  onWorkspace?: (workspace: DirectoryWorkspaceHandle) => void
}) {
  return createRouter({
    routeTree: createRouteTree(input),
    history: createBrowserHistory(),
  })
}

async function waitForRoutePath(
  router: ReturnType<typeof createMemoryTestRouter> | ReturnType<typeof createBrowserTestRouter>,
  expectedPath: string,
): Promise<void> {
  for (let attempt = 0; attempt < ROUTE_SETTLE_ATTEMPTS; attempt += 1) {
    if (router.state.location.pathname === expectedPath) return
    await flushEffects()
  }
  expect(router.state.location.pathname).toBe(expectedPath)
}

function surfaceSnapshotForTarget(target: BenchTarget): BenchSurfaceSnapshot {
  return {
    target,
    targetKey: benchTargetKey(target),
    semanticRevision: 1,
    context: {
      status: "open",
      targetKey: benchTargetKey(target),
      target: benchContextTargetFromBenchTarget({
        target,
        directory: DIRECTORY,
        route: target.type === "workspace-file" ? MARKDOWN_PATH : OBJECT_PATH,
        status: "ready",
      }),
      metadata: [],
      content: "test surface",
      refs: [],
      hints: [],
    },
  }
}

describe("DirectoryWorkspaceController navigation arbitration", () => {
  let container: HTMLDivElement | undefined
  let root: Root | undefined

  afterEach(async () => {
    if (root && container) {
      await act(async () => {
        root?.unmount()
        await flushEffects()
      })
      container.remove()
    }
    root = undefined
    container = undefined
    localStorage.clear()
    window.location.href = TEST_ORIGIN_URL
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("a close supersedes a delayed present and leaves the canonical route closed", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const delayedLoader = deferredCompletion()
    let controller: DirectoryWorkspaceController | undefined
    const router = createMemoryTestRouter({
      delayedLoader: delayedLoader.promise,
      onController: (nextController) => {
        controller = nextController
      },
    })

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })
    if (!controller) throw new Error("Expected workspace controller")

    let presentResultPromise: Promise<DirectoryWorkspaceCommandResult> | undefined
    await act(async () => {
      presentResultPromise = controller?.execute({
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      })
      await flushEffects()
    })
    if (!presentResultPromise) throw new Error("Expected pending present result")

    expect(router.state.location.pathname).toBe(MARKDOWN_PATH)

    let closeResult: DirectoryWorkspaceCommandResult | undefined
    let presentResult: DirectoryWorkspaceCommandResult | undefined
    await act(async () => {
      const closeResultPromise = controller?.execute({ type: "close" })
      delayedLoader.complete()
      if (!closeResultPromise) throw new Error("Expected close result")
      const results = await Promise.all([closeResultPromise, presentResultPromise])
      closeResult = results[0]
      presentResult = results[1]
      await flushEffects()
    })

    expect(closeResult).toMatchObject({ outcome: "committed" })
    expect(presentResult).toMatchObject({
      outcome: "superseded",
      reason: "newer_command",
    })
    expect(router.state.location.pathname).toBe(CHAT_PATH)
  })

  test("a newer target replacement supersedes a delayed target navigation", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const delayedLoader = deferredCompletion()
    let controller: DirectoryWorkspaceController | undefined
    const router = createMemoryTestRouter({
      delayedLoader: delayedLoader.promise,
      onController: (nextController) => {
        controller = nextController
      },
    })

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })
    if (!controller) throw new Error("Expected workspace controller")

    let firstResultPromise: Promise<DirectoryWorkspaceCommandResult> | undefined
    await act(async () => {
      firstResultPromise = controller?.execute({
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      })
      await flushEffects()
    })
    if (!firstResultPromise) throw new Error("Expected first present result")

    let firstResult: DirectoryWorkspaceCommandResult | undefined
    let secondResult: DirectoryWorkspaceCommandResult | undefined
    await act(async () => {
      const secondResultPromise = controller?.execute({
        type: "present",
        directory: DIRECTORY,
        target: OBJECT_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      })
      delayedLoader.complete()
      if (!secondResultPromise) throw new Error("Expected replacement present result")
      const results = await Promise.all([firstResultPromise, secondResultPromise])
      firstResult = results[0]
      secondResult = results[1]
      await flushEffects()
    })

    expect(firstResult).toMatchObject({ outcome: "superseded" })
    expect(secondResult).toMatchObject({ outcome: "committed" })
    expect(router.state.location.pathname).toBe(OBJECT_PATH)
  })

  test("same-destination attempts keep distinct command outcomes", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const delayedLoader = deferredCompletion()
    let controller: DirectoryWorkspaceController | undefined
    const router = createMemoryTestRouter({
      delayedLoader: delayedLoader.promise,
      onController: (nextController) => {
        controller = nextController
      },
    })

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })
    if (!controller) throw new Error("Expected workspace controller")

    let firstResultPromise: Promise<DirectoryWorkspaceCommandResult> | undefined
    await act(async () => {
      firstResultPromise = controller?.execute({
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      })
      await flushEffects()
    })
    if (!firstResultPromise) throw new Error("Expected first present result")

    let firstResult: DirectoryWorkspaceCommandResult | undefined
    let secondResult: DirectoryWorkspaceCommandResult | undefined
    await act(async () => {
      const secondResultPromise = controller?.execute({
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      })
      delayedLoader.complete()
      if (!secondResultPromise) throw new Error("Expected second present result")
      const results = await Promise.all([firstResultPromise, secondResultPromise])
      firstResult = results[0]
      secondResult = results[1]
      await flushEffects()
    })

    expect(firstResult).toMatchObject({ outcome: "superseded" })
    expect(secondResult).toMatchObject({ outcome: "committed" })
    expect(router.state.location.pathname).toBe(MARKDOWN_PATH)
  })

  test("direct route navigation supersedes a delayed controller attempt", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const delayedLoader = deferredCompletion()
    let controller: DirectoryWorkspaceController | undefined
    const router = createMemoryTestRouter({
      delayedLoader: delayedLoader.promise,
      onController: (nextController) => {
        controller = nextController
      },
    })

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })
    if (!controller) throw new Error("Expected workspace controller")

    let presentResultPromise: Promise<DirectoryWorkspaceCommandResult> | undefined
    await act(async () => {
      presentResultPromise = controller?.execute({
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      })
      await flushEffects()
    })
    if (!presentResultPromise) throw new Error("Expected pending present result")

    let presentResult: DirectoryWorkspaceCommandResult | undefined
    await act(async () => {
      const directNavigation = router.navigate({
        to: "/$directory/chat",
        params: { directory: ENCODED_DIRECTORY },
        replace: true,
      })
      delayedLoader.complete()
      const results = await Promise.all([presentResultPromise, directNavigation])
      presentResult = results[0]
      await flushEffects()
    })

    expect(presentResult).toMatchObject({
      outcome: "superseded",
      reason: "newer_command",
    })
    expect(router.state.location.pathname).toBe(CHAT_PATH)
  })

  test("browser Back and Forward use the blocker path for Bench history", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    window.location.href = TEST_ORIGIN_URL
    window.history.replaceState(null, "", CHAT_PATH)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const delayedLoader = Promise.resolve()
    const guardCalls: BenchLeaveGuardInput[] = []
    let shouldBlock = false
    let controller: DirectoryWorkspaceController | undefined
    let workspace: DirectoryWorkspaceHandle | undefined
    const router = createBrowserTestRouter({
      delayedLoader,
      onController: (nextController) => {
        controller = nextController
      },
      onWorkspace: (nextWorkspace) => {
        workspace = nextWorkspace
      },
    })

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })
    if (!controller) throw new Error("Expected workspace controller")
    if (!workspace) throw new Error("Expected workspace")

    await act(async () => {
      await controller?.execute({
        type: "present",
        directory: DIRECTORY,
        target: FILE_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      })
      await flushEffects()
    })
    expect(router.state.location.pathname).toBe(MARKDOWN_PATH)

    await act(async () => {
      await controller?.execute({
        type: "present",
        directory: DIRECTORY,
        target: OBJECT_TARGET,
        mode: BENCH_CHAT_LAYOUT_DOCKED,
      })
      await flushEffects()
    })
    expect(router.state.location.pathname).toBe(OBJECT_PATH)

    const unregister = workspace.lifecycle.registerSurface({
      target: OBJECT_TARGET,
      getSnapshot: () => surfaceSnapshotForTarget(OBJECT_TARGET),
      subscribe: () => () => undefined,
      guardLeave: (input) => {
        guardCalls.push(input)
        if (!shouldBlock) return { status: "allow" }
        return {
          status: "block",
          reason: "dirty",
          message: "blocked by test",
        }
      },
    })

    await act(async () => {
      window.history.back()
      await waitForRoutePath(router, CHAT_PATH)
    })

    expect(guardCalls).toHaveLength(1)
    expect(guardCalls[0]).toMatchObject({
      intent: "close",
      origin: "route",
      current: OBJECT_TARGET,
      next: null,
    })
    expect(router.state.location.pathname).toBe(CHAT_PATH)

    await act(async () => {
      window.history.forward()
      await waitForRoutePath(router, OBJECT_PATH)
    })

    expect(guardCalls).toHaveLength(1)
    shouldBlock = true

    await act(async () => {
      window.history.back()
      await flushEffects()
    })

    expect(guardCalls).toHaveLength(2)
    expect(router.state.location.pathname).toBe(OBJECT_PATH)
    unregister()
  })
})
