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
  resolveRightWorkspaceOpenOutcome,
} from "../src/components/directory-chat/directory-chat-right-workspace"
import { BenchContent } from "../src/components/directory-chat/directory-chat-bench-page-layout"
import {
  DirectoryWorkspaceProvider,
  useDirectoryWorkspace,
} from "../src/components/directory-chat/directory-workspace-context"
import { encodeDirectory } from "../src/lib/directory-token"
import { BENCH_LAYOUT_PROFILE_READING } from "../src/lib/bench-navigation"
import { resolveWorkspacePresentation } from "../src/lib/directory-chat/workspace-presentation"
import { processedResourcesQueryKey } from "../src/state/resources-query"
import { workspaceObjectsQueryKeys } from "../src/state/workspace-objects-query"
import { whiteboardQueryKeys } from "../src/components/whiteboard/whiteboard-query"
import { skillsCatalogQueryKeys } from "../src/state/skills-catalog-query"
import { workspaceChatKeyForSession } from "../src/lib/workspace-chat-key"

const TEST_DIRECTORY = "/repo"
const TEST_RESOURCE_ID = "resource-1"
const FLUSH_DELAY_MS = 0
const CHAT_A_KEY = workspaceChatKeyForSession(undefined)
const CHAT_B_KEY = workspaceChatKeyForSession("session-b")

function flushEffects(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, FLUSH_DELAY_MS)
  })
}

function RightWorkspaceHarness(props: { sessionID?: string; suppressDrawerMotion?: boolean }) {
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
      <button
        type="button"
        data-testid="prepare-chat-change"
        onClick={() => {
          void workspace.controller.execute({
            type: "prepare-chat-change",
            outgoingChatKey: CHAT_A_KEY,
            destinationChatKey: CHAT_B_KEY,
            resetDestination: false,
          })
        }}
      >
        Prepare session change
      </button>
      <button
        type="button"
        data-testid="restore-chat-a"
        onClick={() => {
          void workspace.controller.execute({
            type: "restore-chat",
            chatKey: CHAT_A_KEY,
          })
        }}
      >
        Restore chat A
      </button>
      <DirectoryChatRightWorkspace
        directory={TEST_DIRECTORY}
        sessionID={props.sessionID}
        sessions={[]}
        workspaceWidth={720}
        suppressDrawerMotion={props.suppressDrawerMotion}
        onCreateBoard={() => undefined}
        onCreateCreation={() => undefined}
        onOpenThread={async () => true}
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

function createTestRouter(options?: { sessionID?: string; suppressDrawerMotion?: boolean }) {
  const sessionID = options === undefined ? "session-1" : options.sessionID
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnMount: false },
      mutations: { retry: false },
    },
  })
  queryClient.setQueryData(workspaceObjectsQueryKeys.all(TEST_DIRECTORY), {
    objects: [],
    loadErrors: [],
  })
  queryClient.setQueryData(processedResourcesQueryKey(TEST_DIRECTORY), [])
  queryClient.setQueryData(skillsCatalogQueryKeys.catalog(TEST_DIRECTORY), {
    directory: TEST_DIRECTORY,
    managedRoot: "/skills",
    externalVendorRootsEnabled: true,
    installed: [],
    library: [],
  })
  if (sessionID !== undefined) {
    queryClient.setQueryData(whiteboardQueryKeys.sessionPeek(TEST_DIRECTORY, sessionID), {
      objectID: null,
      currentBoard: null,
    })
  }
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
    component: () => (
      <RightWorkspaceHarness
        sessionID={sessionID}
        suppressDrawerMotion={options?.suppressDrawerMotion}
      />
    ),
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

  test("opens Sources as a drawer over the retained Bench target", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const sourcesButton = container.querySelector<HTMLButtonElement>('[aria-label="Sources"]')
    expect(sourcesButton).not.toBeNull()
    expect(sourcesButton?.getAttribute("aria-pressed")).toBe("false")
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()

    await act(async () => {
      sourcesButton?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="chat-route"]')).toBeNull()
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="pathname"]')?.textContent).toBe(
      `/${encodeDirectory(TEST_DIRECTORY)}/objects/resource/${TEST_RESOURCE_ID}`,
    )
    expect(container.querySelector('[data-testid="bench-visibility"]')?.textContent).toBe("visible")
    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("sources")
    expect(
      container.querySelector('[data-component="right-workspace-selector-drawer"]')?.className,
    ).toContain("animate-in")
    expect(
      container.querySelector('[data-component="right-workspace-selector-drawer"]'),
    ).not.toBeNull()

    await act(async () => {
      sourcesButton?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("none")
    expect(container.querySelector('[data-component="right-workspace-selector-drawer"]')).toBeNull()
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
  })

  test("renders the accepted notebook-scoped rail in order", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const labels = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        '[data-component="right-workspace-rail"] button',
      ),
      (button) => button.getAttribute("aria-label"),
    )
    expect(labels).toEqual([
      "Search",
      "Sources",
      "Practice",
      "Creations",
      "Boards",
      "Files",
      "Skills",
      "Notebook Instructions",
    ])
  })

  test("opens Search as the first notebook-scoped drawer", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const searchButton = container.querySelector<HTMLButtonElement>('[aria-label="Search"]')
    await act(async () => {
      searchButton?.click()
      await flushEffects()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(searchButton?.getAttribute("aria-pressed")).toBe("true")
    expect(
      container.querySelector('[data-component="right-workspace-drawer"] h2')?.textContent,
    ).toBe("Search")
    expect(container.querySelector('[aria-label="Search this notebook…"]')).not.toBeNull()
  })

  test("opens Skills as a real right-workspace drawer", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const skillsButton = container.querySelector<HTMLButtonElement>('[aria-label="Skills"]')
    await act(async () => {
      skillsButton?.click()
      await flushEffects()
    })

    expect(skillsButton?.getAttribute("aria-pressed")).toBe("true")
    expect(container.querySelector('[data-component="right-workspace-drawer"]')).not.toBeNull()
    expect(container.textContent).toContain("No installed skills")
  })

  test("restores a chat's last drawer without replaying entrance motion", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter({ suppressDrawerMotion: true })} />)
      await flushEffects()
    })

    const skillsButton = container.querySelector<HTMLButtonElement>('[aria-label="Skills"]')
    await act(async () => {
      skillsButton?.click()
      await flushEffects()
    })

    const mountedDrawer = container.querySelector(
      '[data-component="right-workspace-selector-drawer"]',
    )
    expect(mountedDrawer).not.toBeNull()
    expect(mountedDrawer?.className).not.toContain("animate-in")

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="prepare-chat-change"]')?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("none")
    expect(mountedDrawer?.isConnected).toBeFalse()

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="restore-chat-a"]')?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe("skills")
    const restoredDrawer = container.querySelector(
      '[data-component="right-workspace-selector-drawer"]',
    )
    expect(restoredDrawer).not.toBeNull()
    expect(restoredDrawer).not.toBe(mountedDrawer)
    expect(restoredDrawer?.className).not.toContain("animate-in")
  })

  test("opens Boards from the non-creating peek state", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter()} />)
      await flushEffects()
    })

    const boardsButton = container.querySelector<HTMLButtonElement>('[aria-label="Boards"]')
    await act(async () => {
      boardsButton?.click()
      await flushEffects()
    })

    expect(
      container.querySelector('[data-component="right-workspace-drawer"] h2')?.textContent,
    ).toBe("Boards")
    expect(container.textContent).toContain("No board yet")
  })

  test("shows the create board empty state without an active chat", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<RouterProvider router={createTestRouter({})} />)
      await flushEffects()
    })

    const boardsButton = container.querySelector<HTMLButtonElement>('[aria-label="Boards"]')
    await act(async () => {
      boardsButton?.click()
      await flushEffects()
    })

    expect(
      container.querySelector('[data-component="right-workspace-drawer"] h2')?.textContent,
    ).toBe("Boards")
    expect(container.textContent).toContain("No board yet")
    expect(container.textContent).toContain("Create board")
    expect(container.textContent).not.toContain("Start a chat first")
  })

  test("keeps unsuccessful open outcomes distinct from drawer-closing success", () => {
    expect(
      resolveRightWorkspaceOpenOutcome({
        outcome: "failed",
      }),
    ).toBe("failed")
    expect(
      resolveRightWorkspaceOpenOutcome({
        outcome: "inactive",
      }),
    ).toBe("failed")
    expect(
      resolveRightWorkspaceOpenOutcome({
        outcome: "superseded",
      }),
    ).toBe("failed")
    expect(
      resolveRightWorkspaceOpenOutcome({
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
    // The Bench container stays mounted and hidden rather than unmounting. Removing it here would
    // destroy every kept-alive surface on each chat transition, because the projection reports a
    // closed Bench mid-switch.
    const benchContainer = container.querySelector(
      '[data-component="right-workspace-bench-target"]',
    )
    expect(benchContainer?.getAttribute("data-bench-visible")).toBe("false")
    expect(benchContainer?.className).toContain("hidden")
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
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

    expect(
      container.querySelector('[data-component="right-workspace-selector-content"]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-component="right-workspace-selector-drawer"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-testid="bench-target"]')).not.toBeNull()
  })

  test("keeps one view-transition owner around the composed Bench surface", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <BenchContent bordered={false}>
          <DirectoryChatRightWorkspaceContent
            hasBenchTarget
            bench={<div data-testid="bench-target">Reader target</div>}
            selectorContent={null}
            selectorDrawerWidth={0}
          />
        </BenchContent>,
      )
      await flushEffects()
    })

    expect(
      container.querySelectorAll('[class*="view-transition-name:buddy-bench-surface"]'),
    ).toHaveLength(1)
    expect(
      container.querySelector('[data-component="right-workspace-bench-target"]'),
    ).not.toBeNull()
  })
})
