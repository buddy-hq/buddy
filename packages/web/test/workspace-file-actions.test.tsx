import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchFileView } from "../src/components/bench/bench-file-view"
import { BenchViewerShell } from "../src/components/bench/bench-viewer-shell"
import { WorkspaceFileActionsMenu } from "../src/components/files/workspace-file-actions"
import {
  createBrowserPlatform,
  PlatformProvider,
  type FileApplications,
  type Platform,
} from "../src/context/platform"
import { setRuntimeServerConnection } from "../src/context/server"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import { useWorkspaceFileOpen } from "../src/lib/use-workspace-file-open"
import type { ResourceReadingTarget } from "../src/state/resources-query"

const originalFetch = globalThis.fetch

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

function renderFileActions(active: boolean) {
  return (
    <BenchFileView
      directory="/workspace"
      path="note.txt"
      drawer={null}
      active={active}
      toolbar={<WorkspaceFileActionsMenu directory="/workspace" path="note.txt" />}
    >
      <BenchViewerShell title="note.txt">Note body</BenchViewerShell>
    </BenchFileView>
  )
}

describe("workspace file actions", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    globalThis.fetch = originalFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("opens a processed PDF from Files with its resource identity", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), "http://buddy.test")
      if (url.pathname !== "/api/objects/resource") throw new Error(`Unexpected request: ${url}`)
      return Response.json({
        resources: [
          {
            objectID: "processed-pdf",
            alias: "paper.pdf",
            format: "pdf",
            status: "ready",
            sourceRelpath: "papers/paper.pdf",
            readerPath: "papers/paper.pdf",
          },
        ],
      })
    }, originalFetch)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const opened: ResourceReadingTarget[] = []
    function FileOpener() {
      const { executePrimary } = useWorkspaceFileOpen("/workspace", (_directory, resource) => {
        opened.push(resource)
      })
      return (
        <button
          type="button"
          onClick={() =>
            void executePrimary({
              path: "papers/paper.pdf",
              absolutePath: "/workspace/papers/paper.pdf",
              available: true,
              canOpenInBuddy: true,
              canOpenDefaultApp: false,
              canReveal: false,
            })
          }
        >
          Open paper
        </button>
      )
    }
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={client}>
            <FileOpener />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    await act(async () => container.querySelector("button")?.click())
    for (let attempt = 0; attempt < 10 && opened.length === 0; attempt += 1) {
      await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    }
    expect(opened).toEqual([
      { path: "papers/paper.pdf", name: "paper.pdf", objectID: "processed-pdf", status: "ready" },
    ])
    client.clear()
  })

  test("waits for both installed apps and saved preference before opening", async () => {
    const apps = deferred<FileApplications>()
    const savedPreference = deferred<string | null>()
    const opened: { path: string; app: string | undefined }[] = []
    const stored: { key: string; value: string }[] = []
    const platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      os: "macos",
      listFileApplications: (path) => {
        expect(path).toBe("/workspace/note.txt")
        return apps.promise
      },
      storage: () => ({
        getItem: () => savedPreference.promise,
        setItem: (key: string, value: string) => {
          stored.push({ key, value })
        },
        removeItem: () => undefined,
      }),
      openPath: async (path: string, app?: string) => {
        opened.push({ path, app })
      },
    } satisfies Platform

    await act(async () => {
      root.render(
        <PlatformProvider value={platform}>
          <WorkspaceFileActionsMenu directory="/workspace" path="note.txt" />
        </PlatformProvider>,
      )
    })
    const open = container.querySelector<HTMLButtonElement>('button[aria-label^="Open in "]')
    if (!open) throw new Error("Expected the Open button")
    expect(open.disabled).toBe(true)
    await act(async () => open.click())
    expect(opened).toEqual([])
    expect(stored).toEqual([])

    await act(async () => {
      apps.resolve({
        applications: [
          { id: "cursor", name: "Cursor", path: "/Applications/Cursor.app", icon: null },
        ],
        defaultApplication: null,
      })
    })
    expect(open.disabled).toBe(true)

    await act(async () => savedPreference.resolve("cursor"))
    expect(open.disabled).toBe(false)
    expect(open.getAttribute("aria-label")).toBe("Open in Cursor")
    await act(async () => open.click())
    expect(opened).toEqual([{ path: "/workspace/note.txt", app: "/Applications/Cursor.app" }])
    expect(stored).toEqual([{ key: "preferred-application", value: "cursor" }])
  })

  test("uses the system default and its icon when no app was chosen", async () => {
    const opened: { path: string; app: string | undefined }[] = []
    const platform = {
      ...createBrowserPlatform(),
      platform: "desktop",
      os: "macos",
      listFileApplications: async () => ({
        applications: [
          {
            id: "cursor",
            name: "Cursor",
            path: "/Applications/Cursor.app",
            icon: "data:image/png;base64,Y3Vyc29y",
          },
        ],
        defaultApplication: {
          id: "textedit",
          name: "TextEdit",
          path: "/System/Applications/TextEdit.app",
          icon: "data:image/png;base64,dGV4dGVkaXQ=",
        },
      }),
      storage: () => ({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      }),
      openPath: async (path: string, app?: string) => {
        opened.push({ path, app })
      },
    } satisfies Platform

    await act(async () => {
      root.render(
        <PlatformProvider value={platform}>
          <WorkspaceFileActionsMenu directory="/workspace" path="note.txt" />
        </PlatformProvider>,
      )
    })
    const open = container.querySelector<HTMLButtonElement>('button[aria-label^="Open in "]')
    expect(open?.getAttribute("aria-label")).toBe("Open in TextEdit")
    expect(open?.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,dGV4dGVkaXQ=",
    )
    await act(async () => open?.click())
    expect(opened).toEqual([{ path: "/workspace/note.txt", app: undefined }])
  })

  test("lets the file chrome own the surface header and its one action control", async () => {
    const surfaceHeader = () =>
      container.querySelector('[data-component="bench-viewer-shell"] header')
    await act(async () => {
      root.render(renderFileActions(true))
    })
    expect(container.querySelectorAll('[role="group"][aria-label="Open file"]')).toHaveLength(1)
    expect(surfaceHeader()).toBeNull()

    // Outside collection chrome the surface names itself again.
    await act(async () => root.render(renderFileActions(false)))
    expect(surfaceHeader()?.textContent).toContain("note.txt")
  })
})
