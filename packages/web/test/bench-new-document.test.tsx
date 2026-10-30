import { afterEach, beforeEach, expect, test } from "bun:test"
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
import { BenchEmptyState } from "../src/components/bench/bench-empty-state"
import { BenchRouteContextProvider } from "../src/components/bench/bench-route-context"
import { BenchSurfaceRenderer } from "../src/components/bench/bench-surface-renderer"
import { benchRouteFallbackContextFromTarget } from "../src/components/bench/bench-context-utils"
import {
  DirectoryWorkspaceProvider,
  useDirectoryWorkspace,
} from "../src/components/directory-chat/directory-workspace-context"
import { DirectoryNotebookRouteContext } from "../src/components/directory-chat/directory-notebook-route-context-value"
import { useRightWorkspaceOpen } from "../src/components/directory-chat/right-workspace-open"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { setRuntimeServerConnection } from "../src/context/server"
import { encodeDirectory } from "../src/lib/directory-token"
import { resolveBenchLayoutProfile } from "../src/lib/bench-open-policy-core"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import { Route as MarkdownRoute } from "../src/routes/$directory._bench.markdown"
import { useChatStore } from "../src/state/chat-store"
import { useHostedBrowserStore } from "../src/state/hosted-browser-store"
import { useMarkdownBenchPreferences } from "../src/state/markdown-bench-preferences"
import { obsidianVaultQueryKeys } from "../src/state/obsidian-vault-query"
import { processedResourcesQueryKey } from "../src/state/resources-query"
import { v1ImportQueryKeys } from "../src/state/v1-import-query"
import { workspaceObjectsQueryKeys } from "../src/state/workspace-objects-query"
import { ThemeProvider } from "../src/theme"

const DIRECTORY = "/workspace/new-document"
const DIRECTORY_TOKEN = encodeDirectory(DIRECTORY)
const originalFetch = globalThis.fetch
const platform = createBrowserPlatform()
const notebookRouteContext = {
  directoryToken: DIRECTORY_TOKEN,
  controller: { status: "opening" as const },
}
const persistenceStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function NotebookBench() {
  const workspace = useDirectoryWorkspace()
  const open = useRightWorkspaceOpen()
  const route = workspace.route
  if (route.status !== "open") {
    return (
      <BenchEmptyState
        directory={DIRECTORY}
        emptyTabID={null}
        sessions={[]}
        onOpen={open}
        onOpenThread={async () => false}
        onNewBoard={() => undefined}
        onNewNote={() => undefined}
        onOpenDrawer={() => undefined}
      />
    )
  }
  const target = route.target
  if (target.type !== "workspace-file") throw new Error("Expected a file target")
  return (
    <BenchRouteContextProvider
      active
      visible
      activeSessionID={undefined}
      state={{
        directory: DIRECTORY,
        target,
        route: `/${DIRECTORY_TOKEN}/markdown`,
        mode: route.mode,
        layoutProfile: resolveBenchLayoutProfile(target),
        floatingRect: { x: 0, y: 0, width: 480, height: 480 },
        floatingChatState: "open",
      }}
      fallbackProvider={{
        read: () =>
          benchRouteFallbackContextFromTarget({
            directory: DIRECTORY,
            target,
            route: `/${DIRECTORY_TOKEN}/markdown`,
          }),
      }}
      setMode={() => undefined}
      setFloatingChatState={() => undefined}
    >
      <BenchSurfaceRenderer directory={DIRECTORY} target={target} />
    </BenchRouteContextProvider>
  )
}

async function until(ready: () => boolean, description: string) {
  const deadline = performance.now() + 2_000
  while (!ready()) {
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}`)
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
    })
  }
}

let container: HTMLDivElement
let root: Root
let queryClient: QueryClient
let restoreSelectionFocus: () => void

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  const selection = window.getSelection()
  if (!selection) throw new Error("Expected a DOM selection")
  const setBaseAndExtent = selection.setBaseAndExtent
  selection.setBaseAndExtent = (anchorNode, anchorOffset, focusNode, focusOffset) => {
    setBaseAndExtent.call(selection, anchorNode, anchorOffset, focusNode, focusOffset)
    const element = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
    element?.closest<HTMLElement>('[contenteditable="true"]')?.focus()
  }
  restoreSelectionFocus = () => {
    selection.setBaseAndExtent = setBaseAndExtent
    selection.removeAllRanges()
  }
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  useChatStore.setState({ directories: {} })
  useHostedBrowserStore.getState().reset()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnMount: false } },
  })
  queryClient.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), { objects: [] })
  queryClient.setQueryData(processedResourcesQueryKey(DIRECTORY), [])
  queryClient.setQueryData(obsidianVaultQueryKeys.profile(DIRECTORY), { connected: false })
  queryClient.setQueryDefaults(v1ImportQueryKeys.all(), { staleTime: Infinity })
  queryClient.setQueryData(v1ImportQueryKeys.all(), {
    upgrade: { state: "ready" },
    import: null,
    importRan: false,
    skipped: [],
    content: [],
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  restoreSelectionFocus()
  queryClient.clear()
  container.remove()
  useMarkdownBenchPreferences.getState().setContentThemeMode("light")
  useMarkdownBenchPreferences.getState().resetContentFontScale()
  useHostedBrowserStore.getState().reset()
  globalThis.fetch = originalFetch
  setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

test.each(["light", "print"] as const)(
  "New document opens focused and editable when the previous view was %s",
  async (mode) => {
    let created = false
    globalThis.fetch = withFetchPreconnect(async (request) => {
      if (!(request instanceof Request)) throw new Error("Expected an SDK request")
      const url = new URL(request.url)
      if (url.pathname === "/api/file") return Response.json([])
      if (url.pathname === "/api/file/edit" && request.method === "PUT") {
        created = true
        return Response.json({ path: "Untitled.md", content: "", version: "created" })
      }
      if (url.pathname === "/api/file/edit" && request.method === "GET") {
        if (!created) throw new Error("Cannot read before creating the document")
        return Response.json({ path: "Untitled.md", content: "", version: "created" })
      }
      if (request.method === "HEAD" && url.pathname === "/api/file/raw/Untitled.md") {
        return new Response(null, {
          headers: { "content-length": "0", "content-type": "text/markdown" },
        })
      }
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: created ? ["Untitled.md"] : [], partial: false })
      }
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${request.method} ${url}`)
    }, originalFetch)
    useMarkdownBenchPreferences.getState().setContentThemeMode(mode)
    const rootRoute = createRootRoute({ component: Outlet })
    const directoryRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "$directory",
      component: () => (
        <PlatformProvider value={platform}>
          <QueryClientProvider client={queryClient}>
            <DirectoryWorkspaceProvider
              directory={DIRECTORY}
              persistenceStorage={persistenceStorage}
            >
              <DirectoryNotebookRouteContext.Provider value={notebookRouteContext}>
                <ThemeProvider>
                  <NotebookBench />
                  <Outlet />
                </ThemeProvider>
              </DirectoryNotebookRouteContext.Provider>
            </DirectoryWorkspaceProvider>
          </QueryClientProvider>
        </PlatformProvider>
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
      validateSearch: MarkdownRoute.options.validateSearch,
      component: () => null,
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([directoryRoute.addChildren([chatRoute, markdownRoute])]),
      history: createMemoryHistory({ initialEntries: [`/${DIRECTORY_TOKEN}/chat`] }),
    })
    await act(async () => root.render(<RouterProvider router={router} />))
    await until(
      () => container.querySelector('[data-component="bench-empty-state"]') !== null,
      "empty Bench",
    )
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "New document",
    )
    if (!button) throw new Error("Expected New document")
    await act(async () => button.click())
    await until(
      () => container.querySelector('[data-lexical-editor="true"]') !== null,
      "mounted Markdown editor",
    )
    expect(router.state.location.search).toMatchObject({ editOnOpen: true })
    await until(
      () => document.activeElement?.getAttribute("contenteditable") === "true",
      "focused editable document",
    )
    const editor = container.querySelector('[data-lexical-editor="true"]')
    expect(editor).not.toBeNull()
    expect(document.activeElement).toBe(editor)
    expect(editor?.getAttribute("contenteditable")).toBe("true")
    expect(router.state.location.pathname).toBe(`/${DIRECTORY_TOKEN}/markdown`)
    expect(useMarkdownBenchPreferences.getState().contentThemeMode).not.toBe("print")
    const otherField = document.createElement("input")
    container.append(otherField)
    await act(async () => {
      otherField.focus()
      useMarkdownBenchPreferences.getState().increaseContentFontScale()
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    })
    expect(document.activeElement).toBe(otherField)
    await act(async () => {
      useMarkdownBenchPreferences.getState().setContentThemeMode("print")
    })
    expect(editor?.getAttribute("contenteditable")).toBe("false")
    expect(useMarkdownBenchPreferences.getState().contentThemeMode).toBe("print")
  },
)
