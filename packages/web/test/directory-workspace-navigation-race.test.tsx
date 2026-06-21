import { afterEach, describe, expect, test } from "bun:test"
import {
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
import { BENCH_CHAT_LAYOUT_DOCKED, type BenchTarget } from "../src/lib/bench-navigation"
import type { DirectoryWorkspaceController } from "../src/lib/directory-workspace-controller"
import { encodeDirectory } from "../src/lib/directory-token"
import type { DirectoryWorkspaceCommandResult } from "../src/state/directory-workspace-store"

const DIRECTORY = "/workspace/navigation-race"
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
const FLUSH_DELAY_MS = 0

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

function ControllerProbe(props: { onController: (controller: DirectoryWorkspaceController) => void }) {
  const workspace = useDirectoryWorkspace()
  props.onController(workspace.controller)
  return null
}

function createTestRouter(input: {
  delayedLoader: Promise<void>
  onController: (controller: DirectoryWorkspaceController) => void
}) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const directoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory",
    component: () => (
      <DirectoryWorkspaceProvider directory={DIRECTORY}>
        <ControllerProbe onController={input.onController} />
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

  return createRouter({
    routeTree: rootRoute.addChildren([
      directoryRoute.addChildren([chatRoute, markdownRoute, objectRoute]),
    ]),
    history: createMemoryHistory({
      initialEntries: [`/${encodeDirectory(DIRECTORY)}/chat`],
    }),
  })
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
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("a close supersedes a delayed present and leaves the canonical route closed", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const delayedLoader = deferredCompletion()
    let controller: DirectoryWorkspaceController | undefined
    const router = createTestRouter({
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

    expect(router.state.location.pathname).toBe(`/${encodeDirectory(DIRECTORY)}/markdown`)

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
    expect(router.state.location.pathname).toBe(`/${encodeDirectory(DIRECTORY)}/chat`)
  })

  test("a newer target replacement supersedes a delayed target navigation", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const delayedLoader = deferredCompletion()
    let controller: DirectoryWorkspaceController | undefined
    const router = createTestRouter({
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
    expect(router.state.location.pathname).toBe(
      `/${encodeDirectory(DIRECTORY)}/objects/resource/${OBJECT_TARGET.ref.objectID}`,
    )
  })

  test("same-destination attempts keep distinct command outcomes", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const delayedLoader = deferredCompletion()
    let controller: DirectoryWorkspaceController | undefined
    const router = createTestRouter({
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
    expect(router.state.location.pathname).toBe(`/${encodeDirectory(DIRECTORY)}/markdown`)
  })
})
