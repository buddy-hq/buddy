import { afterEach, describe, expect, test } from "bun:test"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { StrictMode, act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { DesktopTitlebar } from "../src/components/layout/desktop-titlebar"
import { encodeDirectory } from "../src/lib/directory-token"
import {
  createBrowserPlatform,
  PlatformProvider,
  setRuntimePlatform,
  type Platform,
} from "../src/context/platform"
import {
  DirectoryWorkspaceProvider,
  useDirectoryWorkspace,
} from "../src/components/directory-chat/directory-workspace-context"
import {
  DIRECTORY_WORKSPACE_PERSISTENCE_VERSION,
  WORKSPACE_DRAWER_SOURCES,
  WORKSPACE_HYDRATION_PENDING,
  WORKSPACE_HYDRATION_READY,
  WORKSPACE_VISIBILITY_COLLAPSED,
  WORKSPACE_VISIBILITY_EXPANDED,
  type DirectoryWorkspacePersistenceStorage,
} from "../src/state/directory-workspace-store"
import {
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  BENCH_DOCK_FLOATING_CHAT_EVENT,
} from "../src/lib/bench-navigation"

const TEST_DIRECTORY = "/repo"
const TEST_STRICT_MODE_DIRECTORY = "/repo-strict-mode"
const TEST_TITLEBAR_DIRECTORY = "/repo-titlebar"
const TEST_DIRECT_BENCH_DIRECTORY = "/repo-direct-bench"
const FLUSH_DELAY_MS = 0
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
      onFloatChat={() => undefined}
    />
  )
}

function RootFloatingBenchTitlebarProbe() {
  return (
    <PlatformProvider value={TEST_DESKTOP_PLATFORM}>
      <DesktopTitlebar showDockFloatingBench />
    </PlatformProvider>
  )
}

function TestRouterProvider() {
  const rootRoute = createRootRoute({
    component: () => (
      <DirectoryWorkspaceProvider directory={TEST_DIRECTORY}>
        <WorkspaceProbe />
      </DirectoryWorkspaceProvider>
    ),
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

function TestTitlebarRouterProvider() {
  const rootRoute = createRootRoute({
    component: () => (
      <PlatformProvider value={TEST_DESKTOP_PLATFORM}>
        <DirectoryWorkspaceProvider directory={TEST_TITLEBAR_DIRECTORY}>
          <TitlebarWorkspaceProbe />
        </DirectoryWorkspaceProvider>
      </PlatformProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo-titlebar/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

function TestThreadControlsTitlebarRouterProvider(props: { showSidebarThreadControls: boolean }) {
  const rootRoute = createRootRoute({
    component: () => (
      <PlatformProvider value={TEST_DESKTOP_PLATFORM}>
        <ThreadControlsTitlebarProbe showSidebarThreadControls={props.showSidebarThreadControls} />
      </PlatformProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

function TestStrictModeRouterProvider(props: {
  persistenceStorage?: DirectoryWorkspacePersistenceStorage
}) {
  const rootRoute = createRootRoute({
    component: () => (
      <StrictMode>
        <DirectoryWorkspaceProvider
          directory={TEST_STRICT_MODE_DIRECTORY}
          persistenceStorage={props.persistenceStorage}
        >
          <WorkspaceProbe />
        </DirectoryWorkspaceProvider>
      </StrictMode>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo-strict-mode/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

function TestPendingHydrationRouterProvider(props: {
  persistenceStorage: DirectoryWorkspacePersistenceStorage
}) {
  const rootRoute = createRootRoute({
    component: () => (
      <DirectoryWorkspaceProvider
        directory={TEST_DIRECTORY}
        persistenceStorage={props.persistenceStorage}
      >
        <WorkspaceProbe />
      </DirectoryWorkspaceProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/repo/chat"],
    }),
  })

  return <RouterProvider router={router} />
}

function TestDirectBenchRouterProvider() {
  const rootRoute = createRootRoute({
    component: () => (
      <DirectoryWorkspaceProvider directory={TEST_DIRECT_BENCH_DIRECTORY}>
        <WorkspaceProbe />
      </DirectoryWorkspaceProvider>
    ),
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

describe("DirectoryWorkspaceProvider", () => {
  let container: HTMLDivElement | undefined
  let root: Root | undefined

  afterEach(async () => {
    if (!root || !container) return
    await act(async () => {
      root?.unmount()
      await flushEffects()
    })
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

  test("titlebar sidebar thread controls require an explicit placement gate", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root?.render(<TestThreadControlsTitlebarRouterProvider showSidebarThreadControls={false} />)
      await flushEffects()
    })

    expect(container.querySelector('[aria-label="Pop out chat"]')).toBeNull()
    expect(container.querySelector('[aria-label="New chat"]')).toBeNull()

    await act(async () => {
      root?.render(<TestThreadControlsTitlebarRouterProvider showSidebarThreadControls={true} />)
      await flushEffects()
    })

    expect(container.querySelector('[aria-label="Pop out chat"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="New chat"]')).not.toBeNull()
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
    expect(titlebar?.className).toContain("h-[52px]")
    expect(titlebar?.className).not.toContain("h-10")
    const dockButton = container.querySelector<HTMLButtonElement>(
      '[data-action="titlebar-dock-floating-bench"]',
    )
    expect(dockButton).not.toBeNull()

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
        visibility: WORKSPACE_VISIBILITY_EXPANDED,
        lastDrawer: WORKSPACE_DRAWER_SOURCES,
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
          visibility: WORKSPACE_VISIBILITY_EXPANDED,
          lastDrawer: WORKSPACE_DRAWER_SOURCES,
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
})
