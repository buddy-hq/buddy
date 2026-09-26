import { afterEach, describe, expect, test } from "bun:test"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { StrictMode, act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { createPortal } from "react-dom"
import { useStore } from "zustand"
import { DesktopTitlebar } from "../src/components/layout/desktop-titlebar"
import {
  DesktopTitlebarContentProvider,
  useDesktopTitlebarContentTarget,
} from "../src/components/layout/desktop-titlebar-content"
import { encodeDirectory } from "../src/lib/directory-token"
import {
  createBrowserPlatform,
  PlatformProvider,
  setRuntimePlatform,
  type Platform,
} from "../src/context/platform"
import {
  DirectoryWorkspaceProvider,
  shouldPublishInAppBrowserRuntimeChange,
  useDirectoryWorkspace,
} from "../src/components/directory-chat/directory-workspace-context"
import {
  DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
  BENCH_ROUTE_STATUS_CLOSED,
  BENCH_ROUTE_STATUS_OPEN,
  WORKSPACE_DRAWER_SOURCES,
  WORKSPACE_HYDRATION_FAILED,
  WORKSPACE_HYDRATION_PENDING,
  WORKSPACE_HYDRATION_READY,
  WORKSPACE_VISIBILITY_COLLAPSED,
  WORKSPACE_VISIBILITY_EXPANDED,
  readPersistedDirectoryWorkspace,
  type BenchRouteSnapshot,
  type DirectoryWorkspacePersistenceStorage,
  type DockedWorkspaceState,
} from "../src/state/directory-workspace-store"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  BENCH_DOCK_FLOATING_CHAT_EVENT,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import { resetActiveChatTransitionStateForTests } from "../src/lib/active-chat-transition-state"
import { WORKSPACE_CHAT_DRAFT_KEY, workspaceChatKeyForSession } from "../src/lib/workspace-chat-key"
import { upsertBenchTab } from "../src/lib/bench-tabs"
import { DESKTOP_TITLEBAR_HEIGHT_PX } from "../src/components/layout/desktop-titlebar-inset"
import { useChatStore } from "../src/state/chat-store"
import { useHostedBrowserStore } from "../src/state/hosted-browser-store"
import type { SessionInfo } from "../src/state/chat-types"

const TEST_DIRECTORY = "/repo"
const TEST_STRICT_MODE_DIRECTORY = "/repo-strict-mode"
const TEST_TITLEBAR_DIRECTORY = "/repo-titlebar"
const TEST_DIRECT_BENCH_DIRECTORY = "/repo-direct-bench"
const TEST_DIRECT_SESSION_DIRECTORY = "/repo-direct-session"
const TEST_DIRECT_SESSION_OWNER_ID = "chat-a"
const TEST_DIRECT_SESSION_CHILD_ID = "chat-a-subagent"
const TEST_UNRELATED_SESSION_ID = "chat-b"
const TEST_SETTINGS_RETURN_DIRECTORY = "/repo-settings-return"
const TEST_SETTINGS_RETURN_TOKEN = encodeDirectory(TEST_SETTINGS_RETURN_DIRECTORY)
const TEST_SETTINGS_FIRST_FILE_URL = `/${TEST_SETTINGS_RETURN_TOKEN}/markdown?path=docs%2Ffirst.md`
const TEST_SETTINGS_SECOND_FILE_URL = `/${TEST_SETTINGS_RETURN_TOKEN}/markdown?path=docs%2Fsecond.md`
const TEST_SETTINGS_BROWSER_URL = `/${TEST_SETTINGS_RETURN_TOKEN}/browser/browser-context?url=https%3A%2F%2Fexample.com%2F`
const TEST_SETTINGS_FIRST_FILE_TARGET = {
  type: "workspace-file",
  root: "notebook",
  path: "docs/first.md",
  viewer: "markdown",
} satisfies BenchTarget
const TEST_SETTINGS_SECOND_FILE_TARGET = {
  type: "workspace-file",
  root: "notebook",
  path: "docs/second.md",
  viewer: "markdown",
} satisfies BenchTarget
const ROUTE_SETTLE_ATTEMPTS = 20
const FLUSH_DELAY_MS = 0
const TEST_DIRECT_BENCH_TARGET = {
  type: "workspace-file",
  root: "notebook",
  path: "docs/direct.md",
  viewer: "markdown",
} satisfies BenchTarget
const TEST_DIRECT_BENCH_ROUTE = {
  status: BENCH_ROUTE_STATUS_OPEN,
  target: TEST_DIRECT_BENCH_TARGET,
  mode: BENCH_CHAT_LAYOUT_DOCKED,
} satisfies BenchRouteSnapshot
const TEST_BROWSER_TARGET = {
  type: "browser",
  tabID: "browser-context",
  url: "https://example.com/",
} satisfies BenchTarget
const TEST_DESKTOP_PLATFORM = {
  ...createBrowserPlatform(),
  platform: "desktop",
  os: "macos",
} satisfies Platform

function flushEffects(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, FLUSH_DELAY_MS)
  })
}

function WorkspaceProbe() {
  const workspace = useDirectoryWorkspace()
  const hydration = workspace.store.getState().hydration.status
  const visibility = workspace.projection.dockedState.visibility

  return (
    <div>
      <span data-testid="hydration">{hydration}</span>
      <span data-testid="visibility">{visibility}</span>
      <span data-testid="drawer">{workspace.projection.drawer ?? "none"}</span>
      <button
        type="button"
        data-testid="reveal"
        onClick={() => {
          void workspace.controller.execute({ type: "reveal" })
        }}
      >
        Reveal
      </button>
    </div>
  )
}

function WorkspaceChatKeyProbe() {
  const workspace = useDirectoryWorkspace()
  const activeChatKey = useStore(workspace.store, (state) => state.activeChatKey)
  return <span data-testid="active-chat-key">{activeChatKey}</span>
}

function BenchTabsProbe() {
  const workspace = useDirectoryWorkspace()
  const tabs = useStore(workspace.store, (state) => state.slots[state.activeChatKey]?.tabs ?? [])
  return (
    <span data-testid="bench-tab-paths">
      {tabs
        .map((tab) => (tab.target.type === "workspace-file" ? tab.target.path : tab.target.type))
        .join(",")}
    </span>
  )
}

function TitlebarWorkspaceProbe() {
  const workspace = useDirectoryWorkspace()
  const visibility = workspace.projection.dockedState.visibility
  const rightWorkspaceOpen = visibility === WORKSPACE_VISIBILITY_EXPANDED

  return (
    <div>
      <span data-testid="visibility">{visibility}</span>
      <DesktopTitlebar
        placement="chat"
        variant="chat"
        rightWorkspaceOpen={rightWorkspaceOpen}
        onRightWorkspaceToggle={() => {
          void workspace.controller.execute({
            type: rightWorkspaceOpen ? "collapse" : "reveal",
          })
        }}
      />
    </div>
  )
}

function ThreadControlsTitlebarProbe(props: { showSidebarThreadControls: boolean }) {
  return (
    <DesktopTitlebar
      placement="chat"
      variant="chat"
      leftSidebarOpen
      showSidebarThreadControls={props.showSidebarThreadControls}
      sessions={[]}
      onNewSession={() => undefined}
      onSelectSession={() => undefined}
    />
  )
}

function FloatingBenchTitlebarContentProbe() {
  const target = useDesktopTitlebarContentTarget()
  return target
    ? createPortal(<span data-testid="floating-bench-tabs">Bench tabs</span>, target)
    : null
}

function RootFloatingBenchTitlebarProbe() {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  return (
    <PlatformProvider value={TEST_DESKTOP_PLATFORM}>
      <DesktopTitlebarContentProvider target={target}>
        <DesktopTitlebar showDockFloatingBench rootContentRef={setTarget} />
        <FloatingBenchTitlebarContentProbe />
      </DesktopTitlebarContentProvider>
    </PlatformProvider>
  )
}

function DirectoryWorkspaceRoute() {
  return (
    <DirectoryWorkspaceProvider directory={TEST_DIRECTORY}>
      <WorkspaceProbe />
    </DirectoryWorkspaceProvider>
  )
}

function TestRouterProvider() {
  const rootRoute = createRootRoute({
    component: DirectoryWorkspaceRoute,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

function TestRootFloatingBenchTitlebarRouterProvider() {
  const rootRoute = createRootRoute({
    component: RootFloatingBenchTitlebarProbe,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: [`/repo/_bench?${BENCH_CHAT_SEARCH_PARAM}=${BENCH_CHAT_LAYOUT_FLOATING}`],
    }),
  })

  return <RouterProvider router={router} />
}

function TitlebarWorkspaceRoute() {
  return (
    <PlatformProvider value={TEST_DESKTOP_PLATFORM}>
      <DirectoryWorkspaceProvider directory={TEST_TITLEBAR_DIRECTORY}>
        <TitlebarWorkspaceProbe />
      </DirectoryWorkspaceProvider>
    </PlatformProvider>
  )
}

function TestTitlebarRouterProvider() {
  const rootRoute = createRootRoute({
    component: TitlebarWorkspaceRoute,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo-titlebar/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

let threadControlsShowSidebar = false

function ThreadControlsTitlebarRoute() {
  return (
    <PlatformProvider value={TEST_DESKTOP_PLATFORM}>
      <ThreadControlsTitlebarProbe showSidebarThreadControls={threadControlsShowSidebar} />
    </PlatformProvider>
  )
}

function TestThreadControlsTitlebarRouterProvider(props: { showSidebarThreadControls: boolean }) {
  threadControlsShowSidebar = props.showSidebarThreadControls
  const rootRoute = createRootRoute({
    component: ThreadControlsTitlebarRoute,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

let strictModePersistenceStorage: DirectoryWorkspacePersistenceStorage | undefined

function StrictModeDirectoryWorkspaceRoute() {
  return (
    <StrictMode>
      <DirectoryWorkspaceProvider
        directory={TEST_STRICT_MODE_DIRECTORY}
        persistenceStorage={strictModePersistenceStorage}
      >
        <WorkspaceProbe />
      </DirectoryWorkspaceProvider>
    </StrictMode>
  )
}

function TestStrictModeRouterProvider(props: {
  persistenceStorage?: DirectoryWorkspacePersistenceStorage
}) {
  strictModePersistenceStorage = props.persistenceStorage
  const rootRoute = createRootRoute({
    component: StrictModeDirectoryWorkspaceRoute,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo-strict-mode/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

let pendingHydrationPersistenceStorage: DirectoryWorkspacePersistenceStorage | undefined

function PendingHydrationDirectoryWorkspaceRoute() {
  return (
    <DirectoryWorkspaceProvider
      directory={TEST_DIRECTORY}
      persistenceStorage={pendingHydrationPersistenceStorage}
    >
      <WorkspaceProbe />
    </DirectoryWorkspaceProvider>
  )
}

function TestPendingHydrationRouterProvider(props: {
  persistenceStorage: DirectoryWorkspacePersistenceStorage
}) {
  pendingHydrationPersistenceStorage = props.persistenceStorage
  const rootRoute = createRootRoute({
    component: PendingHydrationDirectoryWorkspaceRoute,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

let directBenchPersistenceStorage: DirectoryWorkspacePersistenceStorage | undefined

function DirectBenchDirectoryWorkspaceRoute() {
  return (
    <DirectoryWorkspaceProvider
      directory={TEST_DIRECT_BENCH_DIRECTORY}
      persistenceStorage={directBenchPersistenceStorage}
    >
      <WorkspaceProbe />
    </DirectoryWorkspaceProvider>
  )
}

function TestDirectBenchRouterProvider(props: {
  persistenceStorage?: DirectoryWorkspacePersistenceStorage
}) {
  directBenchPersistenceStorage = props.persistenceStorage
  const rootRoute = createRootRoute({
    component: DirectBenchDirectoryWorkspaceRoute,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: [
        `/${encodeDirectory(TEST_DIRECT_BENCH_DIRECTORY)}/markdown?path=docs%2Fdirect.md`,
      ],
    }),
  })

  return <RouterProvider router={router} />
}

function DirectSessionDirectoryWorkspaceRoute() {
  return (
    <DirectoryWorkspaceProvider directory={TEST_DIRECT_SESSION_DIRECTORY}>
      <WorkspaceChatKeyProbe />
    </DirectoryWorkspaceProvider>
  )
}

function TestDirectSessionBenchRouterProvider() {
  const rootRoute = createRootRoute({
    component: DirectSessionDirectoryWorkspaceRoute,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: [
        `/${encodeDirectory(TEST_DIRECT_SESSION_DIRECTORY)}/sessions/${TEST_DIRECT_SESSION_CHILD_ID}`,
      ],
    }),
  })

  return <RouterProvider router={router} />
}

function createMemoryPersistenceStorage(): DirectoryWorkspacePersistenceStorage {
  const values = new Map<string, string>()
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value)
    },
    removeItem: (name) => {
      values.delete(name)
    },
  }
}

let pendingSettingsLoaderGate: ReturnType<typeof deferredValue<void>> | undefined

function createSettingsReturnRouter(input: {
  initialUrl: string
  persistenceStorage: DirectoryWorkspacePersistenceStorage
}) {
  const rootRoute = createRootRoute({
    component: Outlet,
  })
  const directoryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$directory",
    component: () => (
      <DirectoryWorkspaceProvider
        directory={TEST_SETTINGS_RETURN_DIRECTORY}
        persistenceStorage={input.persistenceStorage}
      >
        <WorkspaceProbe />
        <BenchTabsProbe />
        <Outlet />
      </DirectoryWorkspaceProvider>
    ),
  })
  const benchRoute = createRoute({
    getParentRoute: () => directoryRoute,
    path: "$",
    component: () => null,
  })
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "settings",
    loader: async () => {
      await pendingSettingsLoaderGate?.promise
    },
    component: () => <span data-testid="settings">Settings</span>,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([directoryRoute.addChildren([benchRoute]), settingsRoute]),
    history: createMemoryHistory({
      initialEntries: [input.initialUrl],
    }),
  })
}

async function navigateAndSettle(
  router: ReturnType<typeof createSettingsReturnRouter>,
  href: string,
): Promise<void> {
  const settingsLoaderGate = deferredValue<void>()
  pendingSettingsLoaderGate = settingsLoaderGate
  let navigation: Promise<void> | undefined
  await act(async () => {
    navigation = router.navigate({ href })
    await flushEffects()
  })
  await act(async () => {
    settingsLoaderGate.resolve()
    await navigation
    await flushEffects()
  })
  pendingSettingsLoaderGate = undefined
  const expectedPath = new URL(href, "http://buddy.local").pathname
  for (let attempt = 0; attempt < ROUTE_SETTLE_ATTEMPTS; attempt += 1) {
    if (router.state.location.pathname === expectedPath && router.state.status === "idle") break
    await act(async () => {
      await flushEffects()
    })
  }
  expect(router.state.location.pathname).toBe(expectedPath)
}

async function readSettingsReturnDraftSlot(storage: DirectoryWorkspacePersistenceStorage) {
  const result = await readPersistedDirectoryWorkspace({
    directory: TEST_SETTINGS_RETURN_DIRECTORY,
    storage,
  })
  if (result.status !== WORKSPACE_HYDRATION_READY || !result.state) {
    throw new Error("Workspace was not persisted")
  }
  return result.state.slots[WORKSPACE_CHAT_DRAFT_KEY]
}

function settingsHref(returnTo: string): string {
  return `/settings?tab=general&returnTo=${encodeURIComponent(returnTo)}`
}

function directBenchPersistedPayload(docked: DockedWorkspaceState): string {
  return JSON.stringify({
    version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
    state: {
      slots: {
        [WORKSPACE_CHAT_DRAFT_KEY]: {
          route: TEST_DIRECT_BENCH_ROUTE,
          tabs: upsertBenchTab([], TEST_DIRECT_BENCH_TARGET).tabs,
          docked,
          lastDrawer: WORKSPACE_DRAWER_SOURCES,
        },
      },
    },
  })
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

describe("Browser runtime context publication", () => {
  test("republishes background Browser metadata while another Bench tab is selected", () => {
    const tabs = upsertBenchTab(
      upsertBenchTab([], TEST_DIRECT_BENCH_TARGET).tabs,
      TEST_BROWSER_TARGET,
    ).tabs

    expect(
      shouldPublishInAppBrowserRuntimeChange({
        route: TEST_DIRECT_BENCH_ROUTE,
        tabs,
      }),
    ).toBe(true)
    expect(
      shouldPublishInAppBrowserRuntimeChange({
        route: {
          status: BENCH_ROUTE_STATUS_OPEN,
          target: TEST_BROWSER_TARGET,
          mode: BENCH_CHAT_LAYOUT_DOCKED,
        },
        tabs: [],
      }),
    ).toBe(false)
  })
})

describe("DirectoryWorkspaceProvider", () => {
  let container: HTMLDivElement | undefined
  let root: Root | undefined

  afterEach(async () => {
    resetActiveChatTransitionStateForTests()
    useChatStore.getState().resetRuntimeState()
    if (!root || !container) return
    await act(async () => {
      root?.unmount()
      await flushEffects()
    })
    useHostedBrowserStore.getState().reset()
    container.remove()
    localStorage.clear()
    setRuntimePlatform(createBrowserPlatform())
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("uses route defaults after persistence hydration completes", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<TestRouterProvider />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="hydration"]')?.textContent).toBe(
      WORKSPACE_HYDRATION_READY,
    )
    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_COLLAPSED,
    )

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="reveal"]')?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_EXPANDED,
    )
  })

  test("associates a direct subagent Bench URL with its root owner chat", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const sessions = [
      {
        id: TEST_DIRECT_SESSION_OWNER_ID,
        title: "Chat A",
        time: { created: 1, updated: 1 },
      },
      {
        id: TEST_DIRECT_SESSION_CHILD_ID,
        parentID: TEST_DIRECT_SESSION_OWNER_ID,
        title: "Chat A subagent",
        time: { created: 2, updated: 2 },
      },
      {
        id: TEST_UNRELATED_SESSION_ID,
        title: "Chat B",
        time: { created: 3, updated: 3 },
      },
    ] satisfies SessionInfo[]
    const chatStore = useChatStore.getState()
    chatStore.setSessions(TEST_DIRECT_SESSION_DIRECTORY, sessions)
    chatStore.setActiveSession(TEST_DIRECT_SESSION_DIRECTORY, TEST_UNRELATED_SESSION_ID)
    chatStore.setActiveDirectory(TEST_DIRECT_SESSION_DIRECTORY)

    await act(async () => {
      root?.render(<TestDirectSessionBenchRouterProvider />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="active-chat-key"]')?.textContent).toBe(
      workspaceChatKeyForSession(TEST_DIRECT_SESSION_OWNER_ID),
    )
  })

  test("titlebar right toggle expands the scoped workspace on chat routes", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<TestTitlebarRouterProvider />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_COLLAPSED,
    )

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-action="titlebar-toggle-right-workspace"]')
        ?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_EXPANDED,
    )
  })

  test("chat titlebar leaves immersive to the Bench tab strip and drops the solo pill", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<TestThreadControlsTitlebarRouterProvider showSidebarThreadControls={true} />)
      await flushEffects()
    })

    expect(container.querySelector('[data-action="chat-pop-out"]')).toBeNull()
    expect(container.querySelector('[aria-label="New chat"]')).toBeNull()

    const cluster = container.querySelector('[data-component="chat-titlebar-left-cluster"]')
    expect(cluster?.querySelectorAll("button")).toHaveLength(1)
    expect(cluster?.getAttribute("data-pill")).toBe("false")
  })

  test("floating Bench root titlebar keeps the chat titlebar height", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<TestRootFloatingBenchTitlebarRouterProvider />)
      await flushEffects()
    })

    const titlebar = container.querySelector('[data-component="desktop-titlebar"]')
    expect(titlebar?.getAttribute("style")).toContain(`height: ${DESKTOP_TITLEBAR_HEIGHT_PX}px`)
    const content = container.querySelector('[data-component="desktop-titlebar-root-content"]')
    expect(content?.querySelector('[data-testid="floating-bench-tabs"]')).not.toBeNull()
    const dockButton = container.querySelector<HTMLButtonElement>(
      '[data-action="titlebar-dock-floating-bench"]',
    )
    expect(dockButton).not.toBeNull()
    expect(dockButton?.className).toContain("text-text-strong")
    expect(dockButton?.querySelector("svg")?.classList.contains("size-4")).toBeTrue()

    let dockEventCount = 0
    function onDockFloatingChat() {
      dockEventCount += 1
    }

    window.addEventListener(BENCH_DOCK_FLOATING_CHAT_EVENT, onDockFloatingChat)
    await act(async () => {
      dockButton?.click()
      await flushEffects()
    })
    window.removeEventListener(BENCH_DOCK_FLOATING_CHAT_EVENT, onDockFloatingChat)

    expect(dockEventCount).toBe(1)
  })

  test("StrictMode effect replay does not leave the controller disposed", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<TestStrictModeRouterProvider />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_COLLAPSED,
    )

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="reveal"]')?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_EXPANDED,
    )
  })

  test("StrictMode replay cannot overwrite persisted workspace intent with route defaults", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const persistedPayload = JSON.stringify({
      version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
      state: {
        slots: {
          [WORKSPACE_CHAT_DRAFT_KEY]: {
            route: { status: BENCH_ROUTE_STATUS_CLOSED },
            tabs: [],
            docked: {
              visibility: WORKSPACE_VISIBILITY_EXPANDED,
              drawer: null,
            },
            lastDrawer: WORKSPACE_DRAWER_SOURCES,
          },
        },
      },
    })
    const writes: string[] = []
    const persistenceStorage: DirectoryWorkspacePersistenceStorage = {
      getItem: () => persistedPayload,
      setItem: (_name, value) => {
        writes.push(value)
      },
      removeItem: () => undefined,
    }

    await act(async () => {
      root?.render(<TestStrictModeRouterProvider persistenceStorage={persistenceStorage} />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="hydration"]')?.textContent).toBe(
      WORKSPACE_HYDRATION_READY,
    )
    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_EXPANDED,
    )
    expect(writes.length).toBeGreaterThan(0)
    for (const write of writes) {
      expect(JSON.parse(write)).toEqual({
        version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
        state: {
          slots: {
            [WORKSPACE_CHAT_DRAFT_KEY]: {
              route: { status: BENCH_ROUTE_STATUS_CLOSED },
              tabs: [],
              docked: {
                visibility: WORKSPACE_VISIBILITY_EXPANDED,
                drawer: null,
              },
              lastDrawer: WORKSPACE_DRAWER_SOURCES,
            },
          },
        },
      })
    }
  })

  test("queues commands while hydration is pending and drains them after hydration", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const persistedValue = deferredValue<string | null>()
    const persistenceStorage: DirectoryWorkspacePersistenceStorage = {
      getItem: () => persistedValue.promise,
      setItem: () => undefined,
      removeItem: () => undefined,
    }

    await act(async () => {
      root?.render(<TestPendingHydrationRouterProvider persistenceStorage={persistenceStorage} />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="hydration"]')?.textContent).toBe(
      WORKSPACE_HYDRATION_PENDING,
    )

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="reveal"]')?.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_COLLAPSED,
    )

    await act(async () => {
      persistedValue.resolve(null)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="hydration"]')?.textContent).toBe(
      WORKSPACE_HYDRATION_READY,
    )
    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_EXPANDED,
    )
  })

  test("hydrates the active draft from its own persisted slot", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const persistenceStorage: DirectoryWorkspacePersistenceStorage = {
      getItem: () =>
        JSON.stringify({
          version: DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
          state: {
            slots: {
              [WORKSPACE_CHAT_DRAFT_KEY]: {
                route: { status: BENCH_ROUTE_STATUS_CLOSED },
                tabs: [],
                docked: {
                  visibility: WORKSPACE_VISIBILITY_COLLAPSED,
                  drawer: null,
                },
                lastDrawer: WORKSPACE_DRAWER_SOURCES,
              },
            },
          },
        }),
      setItem: () => undefined,
      removeItem: () => undefined,
    }

    await act(async () => {
      root?.render(<TestPendingHydrationRouterProvider persistenceStorage={persistenceStorage} />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="hydration"]')?.textContent).toBe(
      WORKSPACE_HYDRATION_READY,
    )
    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_COLLAPSED,
    )
  })

  test("keeps a matching direct Bench route collapsed after hydration", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const persistenceStorage: DirectoryWorkspacePersistenceStorage = {
      getItem: () =>
        directBenchPersistedPayload({
          visibility: WORKSPACE_VISIBILITY_COLLAPSED,
          drawer: null,
        }),
      setItem: () => undefined,
      removeItem: () => undefined,
    }

    await act(async () => {
      root?.render(<TestDirectBenchRouterProvider persistenceStorage={persistenceStorage} />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_COLLAPSED,
    )
  })

  test("keeps a matching direct Bench route's drawer after hydration", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const persistenceStorage: DirectoryWorkspacePersistenceStorage = {
      getItem: () =>
        directBenchPersistedPayload({
          visibility: WORKSPACE_VISIBILITY_EXPANDED,
          drawer: WORKSPACE_DRAWER_SOURCES,
        }),
      setItem: () => undefined,
      removeItem: () => undefined,
    }

    await act(async () => {
      root?.render(<TestDirectBenchRouterProvider persistenceStorage={persistenceStorage} />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="drawer"]')?.textContent).toBe(
      WORKSPACE_DRAWER_SOURCES,
    )
  })

  test("does not persist fallback state after hydration fails", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const writes: string[] = []
    const persistenceStorage: DirectoryWorkspacePersistenceStorage = {
      getItem: () => {
        throw new Error("Temporary storage failure")
      },
      setItem: (_name, value) => {
        writes.push(value)
      },
      removeItem: () => undefined,
    }

    await act(async () => {
      root?.render(<TestPendingHydrationRouterProvider persistenceStorage={persistenceStorage} />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="hydration"]')?.textContent).toBe(
      WORKSPACE_HYDRATION_FAILED,
    )
    expect(writes).toEqual([])
  })

  test("uses expanded defaults for direct Bench routes with no persisted record", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<TestDirectBenchRouterProvider />)
      await flushEffects()
    })

    expect(container.querySelector('[data-testid="hydration"]')?.textContent).toBe(
      WORKSPACE_HYDRATION_READY,
    )
    expect(container.querySelector('[data-testid="visibility"]')?.textContent).toBe(
      WORKSPACE_VISIBILITY_EXPANDED,
    )
  })
  test("keeps every Bench file tab when leaving the notebook for Settings and back", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const persistenceStorage = createMemoryPersistenceStorage()
    const router = createSettingsReturnRouter({
      initialUrl: TEST_SETTINGS_FIRST_FILE_URL,
      persistenceStorage,
    })

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })
    await navigateAndSettle(router, TEST_SETTINGS_SECOND_FILE_URL)

    const beforeSettings = await readSettingsReturnDraftSlot(persistenceStorage)
    expect(beforeSettings?.tabs.map((tab) => tab.target)).toEqual([
      TEST_SETTINGS_FIRST_FILE_TARGET,
      TEST_SETTINGS_SECOND_FILE_TARGET,
    ])

    await navigateAndSettle(router, settingsHref(TEST_SETTINGS_SECOND_FILE_URL))
    expect(container.querySelector('[data-testid="settings"]')).not.toBeNull()

    const duringSettings = await readSettingsReturnDraftSlot(persistenceStorage)
    expect(duringSettings?.route.status).toBe(BENCH_ROUTE_STATUS_OPEN)
    expect(duringSettings?.tabs.map((tab) => tab.target)).toEqual([
      TEST_SETTINGS_FIRST_FILE_TARGET,
      TEST_SETTINGS_SECOND_FILE_TARGET,
    ])

    await navigateAndSettle(router, TEST_SETTINGS_SECOND_FILE_URL)

    expect(container.querySelector('[data-testid="bench-tab-paths"]')?.textContent).toBe(
      "docs/first.md,docs/second.md",
    )
    const afterReturn = await readSettingsReturnDraftSlot(persistenceStorage)
    expect(afterReturn?.route).toEqual({
      status: BENCH_ROUTE_STATUS_OPEN,
      target: TEST_SETTINGS_SECOND_FILE_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    })
    expect(afterReturn?.tabs.map((tab) => tab.target)).toEqual([
      TEST_SETTINGS_FIRST_FILE_TARGET,
      TEST_SETTINGS_SECOND_FILE_TARGET,
    ])
  })

  test("keeps the Bench file tab behind an active browser tab across Settings", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const persistenceStorage = createMemoryPersistenceStorage()
    const router = createSettingsReturnRouter({
      initialUrl: TEST_SETTINGS_FIRST_FILE_URL,
      persistenceStorage,
    })

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })
    await navigateAndSettle(router, TEST_SETTINGS_BROWSER_URL)
    await navigateAndSettle(router, settingsHref(TEST_SETTINGS_BROWSER_URL))

    const duringSettings = await readSettingsReturnDraftSlot(persistenceStorage)
    expect(duringSettings?.route).toEqual({
      status: BENCH_ROUTE_STATUS_OPEN,
      target: TEST_SETTINGS_FIRST_FILE_TARGET,
      mode: BENCH_CHAT_LAYOUT_DOCKED,
    })
    expect(duringSettings?.tabs.map((tab) => tab.target)).toEqual([TEST_SETTINGS_FIRST_FILE_TARGET])

    await navigateAndSettle(router, TEST_SETTINGS_BROWSER_URL)

    expect(container.querySelector('[data-testid="bench-tab-paths"]')?.textContent).toBe(
      "docs/first.md,browser",
    )
  })

  test("keeps all file and browser tabs in memory across Settings", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    const persistenceStorage = createMemoryPersistenceStorage()
    const router = createSettingsReturnRouter({
      initialUrl: TEST_SETTINGS_FIRST_FILE_URL,
      persistenceStorage,
    })
    const browserUrls = ["one", "two", "three", "four"].map(
      (tabID) =>
        `/${TEST_SETTINGS_RETURN_TOKEN}/browser/${tabID}?url=${encodeURIComponent(`https://example.com/${tabID}`)}`,
    )

    await act(async () => {
      root?.render(<RouterProvider router={router} />)
      await flushEffects()
    })
    await navigateAndSettle(router, TEST_SETTINGS_SECOND_FILE_URL)
    for (const url of browserUrls) await navigateAndSettle(router, url)

    const liveSlot = () =>
      useHostedBrowserStore.getState().slotsByDirectory[TEST_SETTINGS_RETURN_DIRECTORY]?.[
        WORKSPACE_CHAT_DRAFT_KEY
      ]
    const tabNames = () =>
      liveSlot()?.tabs.map((tab) => {
        if (tab.target.type === "browser") return tab.target.tabID
        if (tab.target.type === "workspace-file") return tab.target.path
        return tab.target.type
      })
    expect(tabNames()).toEqual(["docs/first.md", "docs/second.md", "one", "two", "three", "four"])

    await navigateAndSettle(router, settingsHref(browserUrls[3] ?? ""))
    expect(container.querySelector('[data-testid="settings"]')).not.toBeNull()
    expect(tabNames()).toEqual(["docs/first.md", "docs/second.md", "one", "two", "three", "four"])

    await navigateAndSettle(router, browserUrls[3] ?? "")
    expect(tabNames()).toEqual(["docs/first.md", "docs/second.md", "one", "two", "three", "four"])
    expect(liveSlot()?.route.status).toBe(BENCH_ROUTE_STATUS_OPEN)
    const restoredRoute = liveSlot()?.route
    expect(restoredRoute?.status === BENCH_ROUTE_STATUS_OPEN && restoredRoute.target).toEqual({
      type: "browser",
      tabID: "four",
      url: "https://example.com/four",
    })
  })
})
