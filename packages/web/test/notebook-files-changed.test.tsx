import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query"
import { toast } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ProjectFileExplorerPanel } from "../src/components/project-explorer/project-file-explorer-panel"
import { createBrowserPlatform, PlatformProvider } from "../src/context/platform"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import {
  confirmNotebookFileAvailable,
  notifyNotebookFilesChanged,
  subscribeNotebookFilesChanged,
  useNotebookFilesChangedListener,
} from "../src/state/notebook-files-changed"
import {
  invalidateProjectExplorerListings,
  projectExplorerDirectoryQueryOptions,
} from "../src/state/project-explorer-query"
import { invalidateResourceDiscovery, resourcesQueryOptions } from "../src/state/resources-query"

const DIRECTORY = "/fixture"
const BURST_WINDOW_MS = 1_100
const originalFetch = globalThis.fetch

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
}

function requestURL(input: RequestInfo | URL) {
  return new URL(input instanceof Request ? input.url : String(input), "http://localhost")
}

async function settle(turns = 5) {
  for (let turn = 0; turn < turns; turn += 1) {
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))
  }
}

async function until(ready: () => boolean, description: string) {
  const deadline = performance.now() + 2_000
  while (!ready()) {
    if (performance.now() >= deadline) throw new Error(`Timed out waiting for ${description}`)
    await settle(1)
  }
}

describe("notebook files changed", () => {
  let client: QueryClient

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    localStorage.clear()
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    globalThis.fetch = withFetchPreconnect(async () => Response.json([]), originalFetch)
  })

  afterEach(() => {
    client.clear()
    globalThis.fetch = originalFetch
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("a burst of changes tells subscribers at once and once more when it settles", async () => {
    let heard = 0
    const unsubscribe = subscribeNotebookFilesChanged(DIRECTORY, () => {
      heard += 1
    })
    await notifyNotebookFilesChanged(client, DIRECTORY)
    expect(heard).toBe(1)
    for (let change = 0; change < 5; change += 1) void notifyNotebookFilesChanged(client, DIRECTORY)
    expect(heard).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, BURST_WINDOW_MS))
    expect(heard).toBe(2)
    unsubscribe()
    await new Promise((resolve) => setTimeout(resolve, BURST_WINDOW_MS))
    await notifyNotebookFilesChanged(client, DIRECTORY)
    expect(heard).toBe(2)
  })

  test("a change in one notebook leaves another notebook's subscribers alone", async () => {
    let heard = 0
    const unsubscribe = subscribeNotebookFilesChanged("/other", () => {
      heard += 1
    })
    await notifyNotebookFilesChanged(client, DIRECTORY)
    unsubscribe()
    expect(heard).toBe(0)
  })

  test("a missing file fails the availability check and announces the change", async () => {
    let status = 404
    globalThis.fetch = withFetchPreconnect(async (input, init) => {
      if (requestMethod(input, init) === "HEAD") return new Response(null, { status })
      return Response.json([])
    }, originalFetch)
    let heard = 0
    const unsubscribe = subscribeNotebookFilesChanged(DIRECTORY, () => {
      heard += 1
    })

    expect(
      await confirmNotebookFileAvailable({
        queryClient: client,
        directory: DIRECTORY,
        path: "gone.md",
      }),
    ).toBe(false)
    expect(heard).toBe(1)

    status = 500
    expect(
      await confirmNotebookFileAvailable({
        queryClient: client,
        directory: DIRECTORY,
        path: "unreadable.md",
      }),
    ).toBe(true)
    unsubscribe()
    expect(heard).toBe(1)
  })

  test("source discovery runs again after a change instead of serving cached paths", async () => {
    let discoveries = 0
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname.includes("/find")) {
        discoveries += 1
        return Response.json([])
      }
      return Response.json({ resources: [] })
    }, originalFetch)
    const observer = new QueryObserver(client, resourcesQueryOptions(DIRECTORY))
    const stopObserving = observer.subscribe(() => undefined)
    await until(() => observer.getCurrentResult().isSuccess, "the first source list")
    const firstDiscoveries = discoveries
    expect(firstDiscoveries).toBeGreaterThan(0)

    await observer.refetch()
    expect(discoveries).toBe(firstDiscoveries)

    await invalidateResourceDiscovery(client, DIRECTORY)
    expect(discoveries).toBe(firstDiscoveries * 2)
    stopObserving()
  })

  test("a change that cannot touch sources skips the source rescan", async () => {
    let discoveries = 0
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname.includes("/find")) {
        discoveries += 1
        return Response.json([])
      }
      return Response.json({ resources: [] })
    }, originalFetch)
    const observer = new QueryObserver(client, resourcesQueryOptions(DIRECTORY))
    const stopObserving = observer.subscribe(() => undefined)
    await until(() => observer.getCurrentResult().isSuccess, "the first source list")
    const firstDiscoveries = discoveries

    await notifyNotebookFilesChanged(client, DIRECTORY, { resources: false })
    expect(discoveries).toBe(firstDiscoveries)

    // A later change in the same window that can touch sources still rescans when it settles.
    void notifyNotebookFilesChanged(client, DIRECTORY)
    await until(() => discoveries === firstDiscoveries * 2, "the trailing source rescan")
    stopObserving()
  })

  test("a change during a folder's first listing lists it again", async () => {
    let files = ["alpha.md", "beta.md"]
    let listings = 0
    let releaseFirstListing: (() => void) | undefined
    const firstListingHeld = new Promise<void>((resolve) => {
      releaseFirstListing = resolve
    })
    globalThis.fetch = withFetchPreconnect(async () => {
      listings += 1
      const listed = files.map((name) => ({
        name,
        path: name,
        absolute: `${DIRECTORY}/${name}`,
        type: "file",
        ignored: false,
      }))
      if (listings === 1) await firstListingHeld
      return Response.json(listed)
    }, originalFetch)
    const observer = new QueryObserver(
      client,
      projectExplorerDirectoryQueryOptions({ directory: DIRECTORY, path: "" }),
    )
    const stopObserving = observer.subscribe(() => undefined)
    await until(() => listings === 1, "the first listing to start")

    files = ["alpha.md"]
    const refreshed = invalidateProjectExplorerListings(client, DIRECTORY)
    releaseFirstListing?.()
    await refreshed
    await until(() => observer.getCurrentResult().isSuccess, "the listing after the change")
    expect(observer.getCurrentResult().data?.map((node) => node.name)).toEqual(["alpha.md"])
    stopObserving()
  })

  test("a mounted listener hears changes until it unmounts", async () => {
    let heard = 0
    const listener = () => {
      heard += 1
    }
    function ListenerProbe() {
      useNotebookFilesChangedListener(DIRECTORY, listener)
      return null
    }
    const container = document.createElement("div")
    const root = createRoot(container)
    await act(async () => root.render(<ListenerProbe />))

    await notifyNotebookFilesChanged(client, DIRECTORY)
    expect(heard).toBe(1)

    await act(async () => root.unmount())
    await new Promise((resolve) => setTimeout(resolve, BURST_WINDOW_MS))
    await notifyNotebookFilesChanged(client, DIRECTORY)
    expect(heard).toBe(1)
  })

  test("a failing listener does not stop other listeners or the refresh", async () => {
    const errorLog = spyOn(console, "error").mockImplementation(() => undefined)
    let heard = 0
    const stopFailing = subscribeNotebookFilesChanged(DIRECTORY, () => {
      throw new Error("listener failed")
    })
    const stopHearing = subscribeNotebookFilesChanged(DIRECTORY, () => {
      heard += 1
    })
    try {
      await notifyNotebookFilesChanged(client, DIRECTORY)
      expect(heard).toBe(1)
      expect(errorLog).toHaveBeenCalled()
    } finally {
      stopFailing()
      stopHearing()
      errorLog.mockRestore()
    }
  })

  describe("Files tree", () => {
    let container: HTMLDivElement
    let root: Root
    let files: string[]
    let missing: Set<string>
    let listings: number

    beforeEach(() => {
      container = document.createElement("div")
      document.body.appendChild(container)
      root = createRoot(container)
      files = ["alpha.md", "beta.md"]
      missing = new Set()
      listings = 0
      globalThis.fetch = withFetchPreconnect(async (input, init) => {
        const url = requestURL(input)
        if (requestMethod(input, init) === "HEAD") {
          const gone = [...missing].some((name) => decodeURIComponent(url.href).includes(name))
          return new Response(null, { status: gone ? 404 : 200 })
        }
        listings += 1
        return Response.json(
          files.map((name) => ({
            name,
            path: name,
            absolute: `${DIRECTORY}/${name}`,
            type: "file",
            ignored: false,
          })),
        )
      }, originalFetch)
    })

    afterEach(async () => {
      await act(async () => root.unmount())
      container.remove()
    })

    async function renderTree() {
      await act(async () => {
        root.render(
          <PlatformProvider value={createBrowserPlatform()}>
            <QueryClientProvider client={client}>
              <ProjectFileExplorerPanel directory={DIRECTORY} />
            </QueryClientProvider>
          </PlatformProvider>,
        )
      })
      await until(() => container.textContent?.includes("alpha.md") === true, "the root listing")
    }

    function row(name: string) {
      return [...container.querySelectorAll("button")].find((button) => button.textContent === name)
    }

    test("a file the agent deleted leaves the tree without a manual refresh", async () => {
      await renderTree()
      expect(row("beta.md")).toBeDefined()

      files = ["alpha.md"]
      await act(async () => {
        void notifyNotebookFilesChanged(client, DIRECTORY)
      })
      await until(() => row("beta.md") === undefined, "the deleted file to leave the tree")
      expect(row("alpha.md")).toBeDefined()
    })

    test("clicking a row whose file is gone says so and drops the row", async () => {
      const errorToast = spyOn(toast, "error").mockImplementation(() => "test-toast")
      try {
        await renderTree()
        files = ["alpha.md"]
        missing.add("beta.md")
        const listingsBeforeClick = listings
        const staleRow = row("beta.md")
        if (!staleRow) throw new Error("Stale row was not rendered")

        await act(async () => staleRow.click())
        await until(() => row("beta.md") === undefined, "the stale row to leave the tree")
        expect(errorToast).toHaveBeenCalledWith("beta.md was moved or deleted.")
        expect(listings).toBeGreaterThan(listingsBeforeClick)
      } finally {
        errorToast.mockRestore()
      }
    })
  })
})
