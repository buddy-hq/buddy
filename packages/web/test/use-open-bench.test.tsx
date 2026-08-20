import { afterEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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
import { DirectoryWorkspaceProvider } from "../src/components/directory-chat/directory-workspace-context"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  useOpenBench,
  type BenchTarget,
  type OpenBenchResult,
} from "../src/lib/bench-navigation"
import { decodeDirectory, encodeDirectory } from "../src/lib/directory-token"
import { workspaceObjectsQueryKeys } from "../src/state/workspace-objects-query"

const CURRENT_DIRECTORY = "/workspace/current"
const TARGET_DIRECTORY = "/workspace/target"
const RESOURCE_TARGET = {
  type: "object",
  ref: {
    kind: "resource",
    objectID: "shared-resource-id",
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

function OpenBenchProbe(props: { onResult: (result: OpenBenchResult) => void }) {
  const openBench = useOpenBench()

  return (
    <button
      type="button"
      data-testid="open-cross-directory"
      onClick={() => {
        void openBench({
          directory: TARGET_DIRECTORY,
          target: RESOURCE_TARGET,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
          autoOpen: null,
        }).then(props.onResult)
      }}
    >
      Open target directory
    </button>
  )
}

function OpenBenchWithoutProviderProbe(props: { onResult: (result: OpenBenchResult) => void }) {
  const openBench = useOpenBench()

  return (
    <button
      type="button"
      data-testid="open-without-provider"
      onClick={() => {
        void openBench({
          directory: TARGET_DIRECTORY,
          target: RESOURCE_TARGET,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
          autoOpen: null,
        }).then(props.onResult)
      }}
    >
      Open without provider
    </button>
  )
}

function createTestRouter(onResult: (result: OpenBenchResult) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnMount: false, retry: false } },
  })
  queryClient.setQueryData(workspaceObjectsQueryKeys.all(CURRENT_DIRECTORY), { objects: [] })
  queryClient.setQueryData(workspaceObjectsQueryKeys.all(TARGET_DIRECTORY), { objects: [] })
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    ),
  })
  const directoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory",
    component: DirectoryLayout,
  })
  const objectRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "objects/$kind/$objectID",
    component: () => <OpenBenchProbe onResult={onResult} />,
  })

  function DirectoryLayout() {
    const params = directoryRoute.useParams()
    const directory = decodeDirectory(params.directory)
    return (
      <DirectoryWorkspaceProvider key={params.directory} directory={directory}>
        <Outlet />
      </DirectoryWorkspaceProvider>
    )
  }

  return createRouter({
    routeTree: rootRoute.addChildren([directoryRoute.addChildren([objectRoute])]),
    history: createMemoryHistory({
      initialEntries: [
        `/${encodeDirectory(CURRENT_DIRECTORY)}/objects/resource/${RESOURCE_TARGET.ref.objectID}?view=reader`,
      ],
    }),
  })
}

describe("useOpenBench", () => {
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

  test("opens the same target identity in another directory", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    let openResult: OpenBenchResult | undefined
    const router = createTestRouter((result) => {
      openResult = result
    })

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })

    expect(router.state.location.pathname).toBe(
      `/${encodeDirectory(CURRENT_DIRECTORY)}/objects/resource/${RESOURCE_TARGET.ref.objectID}`,
    )

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="open-cross-directory"]')?.click()
      await flushEffects()
    })

    expect(router.state.location.pathname).toBe(
      `/${encodeDirectory(TARGET_DIRECTORY)}/objects/resource/${RESOURCE_TARGET.ref.objectID}`,
    )
    expect(openResult).toMatchObject({
      outcome: "committed",
      decision: { action: "open" },
    })
  })

  test("does not throw when generic renderers use the hook outside a workspace", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    let openResult: OpenBenchResult | undefined

    await act(async () => {
      root?.render(
        <OpenBenchWithoutProviderProbe
          onResult={(result) => {
            openResult = result
          }}
        />,
      )
      await flushEffects()
    })

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="open-without-provider"]')?.click()
      await flushEffects()
    })

    expect(openResult).toMatchObject({
      outcome: "inactive",
      reason: "session_inactive",
    })
  })
})
