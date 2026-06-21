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
  WORKSPACE_DRAWER_LIBRARY,
  WORKSPACE_HYDRATION_PENDING,
  WORKSPACE_HYDRATION_READY,
  WORKSPACE_VISIBILITY_COLLAPSED,
  WORKSPACE_VISIBILITY_EXPANDED,
  type DirectoryWorkspacePersistenceStorage,
} from "../src/state/directory-workspace-store"

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

  return (
    <div>
      <span data-testid="visibility">{visibility}</span>
      <DesktopTitlebar placement="chat" variant="chat" />
    </div>
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
        lastDrawer: WORKSPACE_DRAWER_LIBRARY,
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
          lastDrawer: WORKSPACE_DRAWER_LIBRARY,
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
