import { afterEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  DirectoryChatRightWorkspace,
  DirectoryChatRightWorkspaceContent,
  resolveLibraryOpenOutcome,
} from "../src/components/directory-chat/directory-chat-right-workspace"
import {
  DirectoryWorkspaceProvider,
  useDirectoryWorkspace,
} from "../src/components/directory-chat/directory-workspace-context"
import { encodeDirectory } from "../src/lib/directory-token"
import { BENCH_LAYOUT_PROFILE_READING } from "../src/lib/bench-navigation"
import { resolveWorkspacePresentation } from "../src/lib/directory-chat/workspace-presentation"

const TEST_DIRECTORY = "/repo"
const TEST_RESOURCE_ID = "resource-1"
const FLUSH_DELAY_MS = 0

function flushEffects(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, FLUSH_DELAY_MS)
  })
}

function RightWorkspaceHarness() {
  const workspace = useDirectoryWorkspace()
  const location = useLocation()
  const presentation = resolveWorkspacePresentation({
    projection: workspace.projection,
    hydrated: true,
    layoutProfile: BENCH_LAYOUT_PROFILE_READING,
    viewport: { widthPx: 1_440, heightPx: 900, safeTopPx: 0 },
    requestedWorkspaceWidthPx: 720,
    leftSidebarPreferredOpen: true,
    leftSidebarWidthPx: 280,
  })

  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="bench-visibility">{workspace.projection.bench.visibility}</span>
      <span data-testid="drawer">{workspace.projection.drawer ?? "none"}</span>
      <DirectoryChatRightWorkspace
        directory={TEST_DIRECTORY}
        messages={[]}
        sessionID="session-1"
        workspaceWidth={720}
        onOpenResource={() => undefined}
        bench={<div data-testid="bench-target">Reader target</div>}
        presentation={presentation}
      />
    </div>
  )
}

function ChatRouteMarker() {
  return <span data-testid="chat-route">Chat route</span>
}

function createTestRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const directoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory",
    component: () => (
      <QueryClientProvider client={queryClient}>
        <DirectoryWorkspaceProvider directory={TEST_DIRECTORY}>
          <Outlet />
        </DirectoryWorkspaceProvider>
      </QueryClientProvider>
    ),
  })
  const chatRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "chat",
    component: ChatRouteMarker,
  })
  const objectRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "objects/$kind/$objectID",
    component: RightWorkspaceHarness,
  })
  const routeTree = rootRoute.addChildren([directoryRoute.addChildren([chatRoute, objectRoute])])
  return createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [
        `/${encodeDirectory(TEST_DIRECTORY)}/objects/resource/${TEST_RESOURCE_ID}?view=reader`,
      ],
    }),
  })
}

describe("DirectoryChatRightWorkspace", () => {
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

  test("reading rail click focuses the active reader instead of closing Bench", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const readingButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Show reading"]',
    )
    expect(readingButton).not.toBeNull()
    expect(readingButton?.getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()

    await act(async () => {
      readingButton?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="chat-route"]')).toBeNull()
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="pathname"]')?.textContent).toBe(
      `/${encodeDirectory(TEST_DIRECTORY)}/objects/resource/${TEST_RESOURCE_ID}`,
    )
    expect(container.querySelector('[data-testid="bench-visibility"]')?.textContent).toBe("visible")
    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("none")
  })

  test("keeps unsuccessful open outcomes distinct from drawer-closing success", () => {
    expect(
      resolveLibraryOpenOutcome({
        outcome: "failed",
      }),
    ).toBe("failed")
    expect(
      resolveLibraryOpenOutcome({
        outcome: "inactive",
      }),
    ).toBe("failed")
    expect(
      resolveLibraryOpenOutcome({
        outcome: "superseded",
      }),
    ).toBe("failed")
    expect(
      resolveLibraryOpenOutcome({
        outcome: "blocked",
      }),
    ).toBe("blocked")
  })

  test("fills a targetless workspace with the selector instead of rendering an overlay", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <DirectoryChatRightWorkspaceContent
          hasBenchTarget={false}
          bench={<div data-testid="bench-target">Reader target</div>}
          selectorContent={<div data-testid="selector-content">Explorer</div>}
          selectorDrawerWidth={360}
        />,
      )
      await flushEffects()
    })

    expect(container.querySelector('[data-component="right-workspace-selector-content"]')).not.toBe(
      null,
    )
    expect(container.querySelector('[data-component="right-workspace-selector-drawer"]')).toBeNull()
    expect(container.querySelector('[data-testid="bench-target"]')).toBeNull()
  })

  test("overlays a selector when Bench has a retained target", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <DirectoryChatRightWorkspaceContent
          hasBenchTarget
          bench={<div data-testid="bench-target">Reader target</div>}
          selectorContent={<div data-testid="selector-content">Explorer</div>}
          selectorDrawerWidth={360}
        />,
      )
      await flushEffects()
    })

    expect(container.querySelector('[data-component="right-workspace-selector-content"]')).toBeNull()
    expect(
      container.querySelector('[data-component="right-workspace-selector-drawer"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
  })
})
