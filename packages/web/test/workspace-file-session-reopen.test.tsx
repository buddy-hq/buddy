import { afterEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchRouteContextProvider } from "@/components/bench/bench-route-context"
import { BenchSurfaceRenderer } from "@/components/bench/bench-surface-renderer"
import { DirectoryWorkspaceProvider } from "@/components/directory-chat/directory-workspace-context"
import { notebookSearchOpenRequest } from "@/components/directory-chat/right-workspace-open"
import { createBrowserPlatform, PlatformProvider } from "@/context/platform"
import { setRuntimeServerConnection } from "@/context/server"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_LAYOUT_PROFILE_VISUAL,
  BENCH_WORKSPACE_ROOT_NOTEBOOK,
  benchTargetKey,
  type BenchTabTarget,
} from "@/lib/bench-navigation"
import { withFetchPreconnect } from "@/lib/fetch-transport"
import type { DirectoryWorkspacePersistenceStorage } from "@/state/directory-workspace-store"
import {
  grantWorkspaceFileLargeOpenApproval,
  revokeWorkspaceFileLargeOpenApproval,
} from "@/state/workspace-file-open-dialog-store"

const DIRECTORY = "/repo/notebook"
const ZIP_PATH = "exports/archive.zip"
const MARKDOWN_PATH = "notes/chapter.md"
const LARGE_BYTES = "2000000"
const LARGE_FILE_HEADING = "Large file"
const FILE_UNSUPPORTED = "This file cannot be opened in Buddy."
const MARKDOWN_UNAVAILABLE = "Markdown could not be loaded."
const SURFACE_ATTEMPTS = 40
const FLOATING_RECT = { x: 24, y: 24, width: 480, height: 360 }
const originalFetch = globalThis.fetch

type TQuickOpenFileTarget = Extract<BenchTabTarget, { type: "workspace-file" }>

let benchChildren: ReactNode = null

function BenchRoute() {
  return <>{benchChildren}</>
}

function memoryWorkspaceStorage(): DirectoryWorkspacePersistenceStorage {
  const values = new Map<string, string>()
  return {
    getItem(name) {
      return values.get(name) ?? null
    },
    setItem(name, value) {
      values.set(name, value)
    },
    removeItem(name) {
      values.delete(name)
    },
    keys() {
      return [...values.keys()]
    },
  }
}

function BenchRouter(props: { children: ReactNode }) {
  benchChildren = props.children
  const rootRoute = createRootRoute({ component: BenchRoute })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  return <RouterProvider router={router} />
}

function QuickOpenBench(props: {
  target: TQuickOpenFileTarget
  storage: DirectoryWorkspacePersistenceStorage
  children: ReactNode
}) {
  return (
    <BenchRouter>
      <DirectoryWorkspaceProvider directory={DIRECTORY} persistenceStorage={props.storage}>
        <BenchRouteContextProvider
          active
          visible={true}
          activeSessionID={undefined}
          setMode={() => undefined}
          setFloatingChatState={() => undefined}
          state={{
            directory: DIRECTORY,
            target: props.target,
            route: "/test",
            mode: BENCH_CHAT_LAYOUT_DOCKED,
            layoutProfile: BENCH_LAYOUT_PROFILE_VISUAL,
            floatingRect: FLOATING_RECT,
            floatingChatState: "open",
          }}
          fallbackProvider={{
            read: () => ({
              status: "open",
              targetKey: benchTargetKey({
                type: "object",
                ref: {
                  kind: "whiteboard",
                  objectID: "whiteboard-1",
                  revisionID: null,
                  itemID: null,
                },
                viewID: "current",
              }),
              target: {
                type: "object",
                title: "Test Bench",
                workspaceRoot: DIRECTORY,
                ref: {
                  kind: "whiteboard",
                  objectID: "whiteboard-1",
                  revisionID: null,
                  itemID: null,
                },
                viewID: "current",
                route: "/test",
                status: "ready",
              },
              metadata: [],
              content: "Test Bench context.",
              refs: [],
              hints: [],
            }),
          }}
        >
          {props.children}
        </BenchRouteContextProvider>
      </DirectoryWorkspaceProvider>
    </BenchRouter>
  )
}

function quickOpenFileTarget(path: string, viewer: "file" | "markdown"): TQuickOpenFileTarget {
  const title = path.slice(path.lastIndexOf("/") + 1)
  const request = notebookSearchOpenRequest({
    directory: DIRECTORY,
    result: {
      id: `file:${path}`,
      kind: "file",
      title,
      metadata: "File",
      updatedAtMs: 0,
      target: { type: "file", path, viewer },
    },
  })
  if (request?.type !== "object" || request.target.type !== "workspace-file") {
    throw new Error("Quick open did not choose a notebook file")
  }
  return request.target
}

function installLargeFileFetch() {
  setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
  globalThis.fetch = withFetchPreconnect(async (input, init) => {
    const request = input instanceof Request ? input : new Request(String(input), init)
    const url = new URL(request.url, "http://buddy.test")
    if (request.method === "HEAD" && url.pathname.startsWith("/api/file/raw/")) {
      const markdown = url.pathname.includes("chapter.md")
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": markdown ? "text/markdown" : "application/zip",
          "content-length": LARGE_BYTES,
        },
      })
    }
    if (request.method === "GET" && url.pathname === "/api/file/edit") {
      return Response.json({ message: "unavailable" }, { status: 500 })
    }
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`)
  }, originalFetch)
}

describe("session approval on Quick open", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let storage: DirectoryWorkspacePersistenceStorage

  afterEach(async () => {
    revokeWorkspaceFileLargeOpenApproval(DIRECTORY, ZIP_PATH)
    revokeWorkspaceFileLargeOpenApproval(DIRECTORY, MARKDOWN_PATH)
    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
    globalThis.fetch = originalFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  function mountHarness() {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    installLargeFileFetch()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    storage = memoryWorkspaceStorage()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnMount: false } },
    })
  }

  async function show(target: TQuickOpenFileTarget) {
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <QuickOpenBench target={target} storage={storage}>
              <BenchSurfaceRenderer directory={DIRECTORY} target={target} />
            </QuickOpenBench>
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
  }

  async function closeTab() {
    await act(async () => root.unmount())
    root = createRoot(container)
  }

  async function readSurface(text: string) {
    for (let attempt = 0; attempt < SURFACE_ATTEMPTS; attempt += 1) {
      if (container.textContent?.includes(text)) return container.textContent ?? ""
      await act(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 1))
      })
    }
    return container.textContent ?? ""
  }

  async function reopenThroughQuickOpen(input: {
    path: string
    viewer: "file" | "markdown"
    opened: string
  }) {
    mountHarness()
    const target = quickOpenFileTarget(input.path, input.viewer)
    expect(target).toEqual({
      type: "workspace-file",
      root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
      path: input.path,
      viewer: input.viewer,
    })

    await show(target)
    expect(await readSurface(LARGE_FILE_HEADING)).toContain(LARGE_FILE_HEADING)
    expect(container.textContent).toContain("2.0 MB")

    await closeTab()
    grantWorkspaceFileLargeOpenApproval(DIRECTORY, input.path)
    await show(target)
    expect(await readSurface(input.opened)).toContain(input.opened)
    expect(container.textContent).not.toContain(LARGE_FILE_HEADING)

    await closeTab()
    await show(target)
    expect(await readSurface(input.opened)).toContain(input.opened)
    expect(container.textContent).not.toContain(LARGE_FILE_HEADING)
  }

  test("a file approved, closed, and reopened through Quick open does not warn", async () => {
    await reopenThroughQuickOpen({
      path: ZIP_PATH,
      viewer: "file",
      opened: FILE_UNSUPPORTED,
    })
  })

  test("a Markdown file approved, closed, and reopened through Quick open does not warn", async () => {
    await reopenThroughQuickOpen({
      path: MARKDOWN_PATH,
      viewer: "markdown",
      opened: MARKDOWN_UNAVAILABLE,
    })
  })
})
