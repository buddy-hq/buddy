import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { ObjectsListResponse } from "@buddy/sdk/types"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchQuickOpen } from "../src/components/bench/bench-quick-open"
import type { BenchSearchDrawer } from "../src/components/bench/bench-search"
import type { RightWorkspaceOpenRequest } from "../src/components/directory-chat/right-workspace-open"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { setRuntimeServerConnection } from "../src/context/server"
import { withFetchPreconnect, type FetchImplementation } from "../src/lib/fetch-transport"
import { processedResourcesQueryKey } from "../src/state/resources-query"
import { workspaceObjectsQueryKeys } from "../src/state/workspace-objects-query"

type ObjectIndexItem = ObjectsListResponse["objects"][number]

const DIRECTORY = "/workspace"
const originalFetch = globalThis.fetch

function requestURL(input: Parameters<FetchImplementation>[0]) {
  return new URL(input instanceof Request ? input.url : String(input), "http://buddy.test")
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

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  if (!valueSetter) throw new Error("Expected the input value setter")
  valueSetter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function pressEnter(input: HTMLInputElement, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
    ...init,
  })
  input.dispatchEvent(event)
  return event
}

function readInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    '[data-component="bench-quick-open"] input[type="search"]',
  )
  if (!input) throw new Error("Expected the Quick open field")
  return input
}

/** Serves an empty notebook plus `paths` in the file index; `resources` may hold the catalog back. */
function mockNotebookFetch(input: {
  paths: readonly string[]
  fileIndex?: () => Promise<Response>
  resources?: () => Promise<Response>
}): void {
  globalThis.fetch = withFetchPreconnect(async (request, init) => {
    const url = requestURL(request)
    const method = request instanceof Request ? request.method : (init?.method ?? "GET")
    if (url.pathname === "/api/find/notebook-file-index") {
      return input.fileIndex
        ? input.fileIndex()
        : Response.json({ paths: input.paths, partial: false })
    }
    if (url.pathname === "/api/objects/resource") {
      return input.resources ? input.resources() : Response.json({ resources: [] })
    }
    if (method === "HEAD" && url.pathname.startsWith("/api/file/raw/"))
      return new Response(null, { status: 200 })
    if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
    if (url.pathname === "/api/session") return Response.json([])
    throw new Error(`Unexpected request: ${method} ${url}`)
  }, originalFetch)
}

function media(objectID: string, title: string, filePath: string | null): ObjectIndexItem {
  return {
    kind: "media-presentation",
    objectID,
    title,
    status: "ready",
    lifecycle: "external-reference",
    sourceRoot: null,
    filePath,
    primaryViewID: "gallery",
    surfaces: ["bench", "library"],
    hasLibraryView: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

describe("Quick open", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let opened: RightWorkspaceOpenRequest[]
  let openChanges: boolean[]
  let drawers: BenchSearchDrawer[]
  let newNotes: number

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnMount: false } },
    })
    queryClient.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), {
      objects: [],
      loadErrors: [],
    })
    queryClient.setQueryData(processedResourcesQueryKey(DIRECTORY), [])
    opened = []
    openChanges = []
    drawers = []
    newNotes = 0
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    document.body.replaceChildren()
    globalThis.fetch = originalFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderQuickOpen(open = true): Promise<void> {
    await act(async () =>
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchQuickOpen
              directory={DIRECTORY}
              sessions={[]}
              open={open}
              onOpenChange={(value) => {
                openChanges.push(value)
              }}
              onOpen={async (request) => {
                opened.push(request)
                return "opened"
              }}
              onOpenThread={async () => true}
              onNewBoard={() => undefined}
              onNewNote={() => {
                newNotes += 1
              }}
              onOpenDrawer={(drawer) => {
                drawers.push(drawer)
              }}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      ),
    )
  }

  test("runs the New tab page's commands and closes", async () => {
    mockNotebookFetch({ paths: [] })
    await renderQuickOpen()
    const input = readInput()

    await act(async () => setInputValue(input, "new note"))
    await until(
      () => document.querySelector('[data-search-kind="command"]') !== null,
      "New note command",
    )
    await act(async () => {
      pressEnter(input)
    })
    expect(newNotes).toBe(1)
    expect(openChanges).toEqual([false])

    await act(async () => setInputValue(input, "files"))
    await until(
      () =>
        document.querySelector('[data-search-kind="command"]')?.textContent?.startsWith("Files") ===
        true,
      "Files command",
    )
    await act(async () => {
      pressEnter(input)
    })
    expect(drawers).toEqual(["files"])
  })

  test("opens a file in a new tab and closes once it lands", async () => {
    mockNotebookFetch({ paths: ["docs/alpha-guide.md"] })
    await renderQuickOpen()
    await act(async () => setInputValue(readInput(), "alpha"))
    await until(() => document.querySelector('[data-search-kind="file"]') !== null, "file result")
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-search-kind="file"]')?.click()
    })
    await until(() => opened.length > 0, "opened file")
    expect(opened).toMatchObject([
      { type: "object", directory: DIRECTORY, target: { path: "docs/alpha-guide.md" } },
    ])
    expect(openChanges).toEqual([false])
  })

  test("leaves a composing Enter to the field and holds Enter while search is pending", async () => {
    mockNotebookFetch({ paths: [], fileIndex: () => new Promise<Response>(() => undefined) })
    await renderQuickOpen()
    const input = readInput()
    await act(async () => setInputValue(input, "alpha"))
    let enter: KeyboardEvent | undefined
    act(() => {
      enter = pressEnter(input, { isComposing: true })
    })
    expect(enter?.defaultPrevented).toBe(false)
    // Held for the results still loading; nothing opens until they settle.
    act(() => {
      enter = pressEnter(input)
    })
    expect(enter?.defaultPrevented).toBe(true)
    expect(opened).toEqual([])
    expect(openChanges).toEqual([])
  })

  test("closing cancels a pick still waiting on the catalog", async () => {
    const catalog = Promise.withResolvers<Response>()
    let catalogRequested = false
    mockNotebookFetch({
      paths: ["paper.pdf"],
      resources: () => {
        catalogRequested = true
        return catalog.promise
      },
    })
    await renderQuickOpen()
    await act(async () => setInputValue(readInput(), "paper"))
    await until(() => document.querySelector('[data-search-kind="source"]') !== null, "PDF result")
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-search-kind="source"]')?.click()
    })
    await until(() => catalogRequested, "pending PDF catalog")

    await renderQuickOpen(false)
    await renderQuickOpen(true)
    await act(async () => setInputValue(readInput(), "fresh"))
    await act(async () => catalog.resolve(Response.json({ resources: [] })))
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 10)))

    expect(opened).toEqual([])
    expect(openChanges).toEqual([])
    expect(readInput().value).toBe("fresh")
  })

  test("shows a notebook file once when Media only wraps it", async () => {
    queryClient.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), {
      objects: [
        media("01ARZ3NDEKTSV4RRFFQ69G5FA1", "alpha-guide.md", "docs/alpha-guide.md"),
        media("01ARZ3NDEKTSV4RRFFQ69G5FA2", "alpha-moved.md", "docs/alpha-moved.md"),
        media("01ARZ3NDEKTSV4RRFFQ69G5FA3", "alpha gallery", null),
      ],
      loadErrors: [],
    })
    mockNotebookFetch({ paths: ["docs/alpha-guide.md"] })
    await renderQuickOpen()
    await act(async () => setInputValue(readInput(), "alpha"))
    await until(() => document.querySelector('[data-search-kind="file"]') !== null, "file result")

    const rows = [...document.querySelectorAll<HTMLElement>("[data-search-kind]")]
    const titles = (kind: string) =>
      rows.filter((row) => row.dataset.searchKind === kind).map((row) => row.textContent ?? "")
    expect(titles("file")).toHaveLength(1)
    expect(titles("file")[0]).toContain("alpha-guide.md")
    // The Media whose file the search did not find, and a gallery, are their own things.
    expect(titles("creation")).toHaveLength(2)
    expect(titles("creation").some((text) => text.includes("alpha-guide.md"))).toBe(false)
  })

  test("offers a retry when the file scan fails", async () => {
    mockNotebookFetch({
      paths: [],
      fileIndex: async () => {
        throw new Error("File scan unavailable")
      },
    })
    await renderQuickOpen()
    await act(async () => setInputValue(readInput(), "alpha"))
    await until(
      () => document.body.textContent?.includes("Retry file scan") === true,
      "file scan retry",
    )
  })
})
