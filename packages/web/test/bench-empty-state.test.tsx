import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { toast } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchEmptyState } from "../src/components/bench/bench-empty-state"
import {
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  parseInAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import {
  createBrowserPlatform,
  PlatformProvider,
  setRuntimePlatform,
  type InAppBrowserPlatform,
  type Platform,
  type PlatformStateStorage,
} from "../src/context/platform"
import { DEFAULT_IN_APP_BROWSER_SETTINGS } from "../src/lib/in-app-browser-settings"
import {
  retryInAppBrowserSettingsHydration,
  useInAppBrowserSettingsStore,
} from "../src/state/in-app-browser-settings-store"
import { setRuntimeServerConnection } from "../src/context/server"
import { withFetchPreconnect, type FetchImplementation } from "../src/lib/fetch-transport"
import { notebookFileIndexQueryKey } from "../src/state/notebook-file-search"
import { processedResourcesQueryKey } from "../src/state/resources-query"
import { workspaceObjectsQueryKeys } from "../src/state/workspace-objects-query"

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

function pressEnter(input: HTMLInputElement): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  return event
}

function pressArrow(element: HTMLElement, key: "ArrowDown" | "ArrowUp"): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
}

/** Moves the field's highlight with `key` until it reaches `row`. */
async function highlightRow(
  input: HTMLInputElement,
  row: Element,
  key: "ArrowDown" | "ArrowUp",
): Promise<void> {
  for (let presses = 0; row.getAttribute("aria-selected") !== "true"; presses += 1) {
    if (presses >= 12) throw new Error(`Expected ${key} to reach the row`)
    await act(async () => pressArrow(input, key))
  }
}

/** Serves one PDF in the file index whose existence check answers `headStatus`; returns the paths it was asked about. */
function mockPaperPdfFetch(headStatus: number): string[] {
  const headRequests: string[] = []
  globalThis.fetch = withFetchPreconnect(async (input, init) => {
    const url = requestURL(input)
    const method = input instanceof Request ? input.method : (init?.method ?? "GET")
    if (url.pathname === "/api/find/notebook-file-index") {
      return Response.json({ paths: ["reading/paper.pdf"], partial: false })
    }
    if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
    if (method === "HEAD" && url.pathname === "/api/file/raw/paper.pdf") {
      headRequests.push(url.searchParams.get("path") ?? "")
      return new Response(null, { status: headStatus })
    }
    if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
    if (url.pathname === "/api/session") return Response.json([])
    throw new Error(`Unexpected request: ${method} ${url}`)
  }, originalFetch)
  return headRequests
}

describe("empty Bench", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
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
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    globalThis.fetch = originalFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("shows working shortcuts and local chat matches before the remote search", async () => {
    let boardsCreated = 0
    const openedThreads: string[] = []
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              emptyTabID={null}
              directory={DIRECTORY}
              sessions={[
                {
                  id: "session-geography",
                  title: "Geography lesson",
                  time: { created: 1, updated: 2 },
                },
              ]}
              onOpen={async () => "opened"}
              onOpenThread={async (id) => {
                openedThreads.push(id)
                return true
              }}
              onNewBoard={() => {
                boardsCreated += 1
              }}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })

    const board = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "New board",
    )
    await act(async () => board?.click())
    expect(boardsCreated).toBe(1)

    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Expected the Bench search input")
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(openedThreads).toEqual([])
    await act(async () => setInputValue(input, "geo"))
    const match = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Geography lesson"),
    )
    expect(match).not.toBeUndefined()
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(openedThreads).toEqual([])
    await act(async () => {
      input.focus()
      pressArrow(input, "ArrowDown")
    })
    // The field keeps focus and points at the highlighted row, so typing still edits the query.
    expect(document.activeElement).toBe(input)
    expect(match?.getAttribute("aria-selected")).toBe("true")
    expect(input.getAttribute("aria-activedescendant")).toBe(match?.id ?? null)
    await act(async () => match?.click())
    expect(openedThreads).toEqual(["session-geography"])
  })

  test("keeps what each New tab typed while the user is away from it", async () => {
    function renderEmptyTab(emptyTabID: string) {
      return (
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              key={emptyTabID}
              emptyTabID={emptyTabID}
              directory={DIRECTORY}
              sessions={[]}
              onOpen={async () => "opened"}
              onOpenThread={async () => true}
              onNewBoard={() => undefined}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>
      )
    }
    const readInput = () => container.querySelector<HTMLInputElement>('input[type="search"]')

    await act(async () => root.render(renderEmptyTab("new-a")))
    const input = readInput()
    if (!input) throw new Error("Expected the Bench search input")
    await act(async () => setInputValue(input, "geography"))

    await act(async () => root.render(renderEmptyTab("new-b")))
    expect(readInput()?.value).toBe("")

    await act(async () => root.render(renderEmptyTab("new-a")))
    expect(readInput()?.value).toBe("geography")
  })

  test("groups commands and items, and runs a command while a provider is pending", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    let fileRequestStarted = false
    globalThis.fetch = withFetchPreconnect(async (input, init) => {
      const url = requestURL(input)
      if (url.pathname === "/api/find/notebook-file-index") {
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
        if (!signal) throw new Error("File search omitted cancellation signal")
        fileRequestStarted = true
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true })
        })
      }
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)

    let boardsCreated = 0
    const openedThreads: string[] = []
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              emptyTabID={null}
              directory={DIRECTORY}
              sessions={[
                { id: "board-chat", title: "Board study", time: { created: 1, updated: 2 } },
              ]}
              onOpen={async () => "opened"}
              onOpenThread={async (id) => {
                openedThreads.push(id)
                return true
              }}
              onNewBoard={() => {
                boardsCreated += 1
              }}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })

    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Expected the Bench search input")
    await act(async () => setInputValue(input, "board"))
    await until(() => fileRequestStarted, "pending file provider")

    const groups = Array.from(container.querySelectorAll("[data-search-group]"))
    expect(groups.map((group) => group.textContent)).toEqual(["Commands", "Items"])
    expect(container.querySelector('[data-search-kind="command"]')?.textContent).toContain(
      "New board",
    )
    expect(container.querySelector('[data-search-kind="thread"]')?.textContent).toContain(
      "Board study",
    )
    expect(container.textContent).toContain("Searching…")

    const thread = container.querySelector<HTMLButtonElement>('[data-search-kind="thread"]')
    if (!thread) throw new Error("Expected the local chat result")
    await act(async () => input.focus())
    await highlightRow(input, thread, "ArrowDown")
    expect(document.activeElement).toBe(input)
    // Enter waits for the pending provider rather than opening a row that may yet move.
    let pendingEnter: KeyboardEvent | undefined
    await act(async () => {
      pendingEnter = pressEnter(input)
    })
    expect(pendingEnter?.defaultPrevented).toBe(true)
    expect(openedThreads).toEqual([])

    // Moving the highlight drops the waiting Enter, so only the command runs.
    const command = container.querySelector<HTMLButtonElement>('[data-search-kind="command"]')
    if (!command) throw new Error("Expected the New board command")
    await highlightRow(input, command, "ArrowUp")
    await act(async () => {
      pressEnter(input)
    })
    expect(boardsCreated).toBe(1)
    expect(openedThreads).toEqual([])
  })

  test("waits for the resource catalog before exposing a PDF file hit", async () => {
    queryClient.removeQueries({ queryKey: processedResourcesQueryKey(DIRECTORY) })
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    let resolveResources: ((response: Response) => void) | undefined
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/objects/resource") {
        return new Promise<Response>((resolve) => {
          resolveResources = resolve
        })
      }
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: ["reading/paper.pdf"], partial: false })
      }
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)

    const opened: unknown[] = []
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              emptyTabID={null}
              directory={DIRECTORY}
              sessions={[]}
              onOpen={async (request) => {
                opened.push(request)
                return "opened"
              }}
              onOpenThread={async () => true}
              onNewBoard={() => undefined}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })

    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Expected the Bench search input")
    await act(async () => setInputValue(input, "paper.pdf"))
    await until(() => resolveResources !== undefined, "resource catalog request")
    await until(() => container.textContent?.includes("Searching…") === true, "pending search")
    expect(container.querySelector('[data-search-kind="source"]')).toBeNull()
    expect(opened).toEqual([])

    await act(async () => {
      resolveResources?.(
        Response.json({
          resources: [
            {
              objectID: "paper-object",
              alias: "paper.pdf",
              format: "pdf",
              status: "ready",
              sourceRelpath: "reading/paper.pdf",
              readerPath: "reading/paper.pdf",
            },
          ],
        }),
      )
    })
    await until(
      () => container.querySelector('[data-search-kind="source"]') !== null,
      "processed resource hit",
    )
    const source = container.querySelector<HTMLButtonElement>('[data-search-kind="source"]')
    await act(async () => source?.click())
    expect(opened).toEqual([
      {
        type: "resource",
        directory: DIRECTORY,
        resource: {
          path: "reading/paper.pdf",
          name: "paper.pdf",
          objectID: "paper-object",
          status: "ready",
        },
      },
    ])
  })

  test("resolves a newly processed PDF before opening a cached file hit", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/objects/resource")
        return Response.json({
          resources: [
            {
              objectID: "fresh-paper",
              alias: "paper.pdf",
              format: "pdf",
              status: "ready",
              sourceRelpath: "reading/paper.pdf",
              readerPath: "reading/paper.pdf",
            },
          ],
        })
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: ["reading/paper.pdf"], partial: false })
      }
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)

    const opened: unknown[] = []
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              emptyTabID={null}
              directory={DIRECTORY}
              sessions={[]}
              onOpen={async (request) => {
                opened.push(request)
                return "opened"
              }}
              onOpenThread={async () => true}
              onNewBoard={() => undefined}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Expected the Bench search input")
    await act(async () => setInputValue(input, "paper.pdf"))
    await until(
      () => container.querySelector('[data-search-kind="source"]') !== null,
      "PDF file result",
    )
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-search-kind="source"]')?.click()
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
    await until(() => opened.length > 0, "resolved PDF open")
    expect(opened).toEqual([
      {
        type: "resource",
        directory: DIRECTORY,
        resource: {
          path: "reading/paper.pdf",
          name: "paper.pdf",
          objectID: "fresh-paper",
          status: "ready",
        },
      },
    ])
  })

  test("retries a partial file scan with a fresh walk", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    let walks = 0
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/find/notebook-file-index") {
        walks += 1
        return walks === 1
          ? Response.json({ paths: ["Sample.md"], partial: true })
          : Response.json({ paths: ["Sample.md", "Sample2.md"], partial: false })
      }
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              emptyTabID={null}
              directory={DIRECTORY}
              sessions={[]}
              onOpen={async () => "opened"}
              onOpenThread={async () => true}
              onNewBoard={() => undefined}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Expected the Bench search input")
    await act(async () => setInputValue(input, "Sample"))
    await until(
      () => container.textContent?.includes("Retry file scan") === true,
      "partial scan retry",
    )
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry file scan",
    )
    await act(async () => retry?.click())
    await until(() => walks === 2, "fresh file walk")
    await until(() => container.textContent?.includes("Sample2.md") === true, "fresh file result")
    expect(container.textContent).not.toContain("Retry file scan")
  })

  test("searches a long absolute notebook path when its relative query fits", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    const relativePath = `${"a".repeat(190)}.md`
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: [relativePath, `${"b".repeat(190)}.md`], partial: false })
      }
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)

    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              emptyTabID={null}
              directory={DIRECTORY}
              sessions={[]}
              onOpen={async () => "opened"}
              onOpenThread={async () => true}
              onNewBoard={() => undefined}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })

    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Expected the Bench search input")
    await act(async () => setInputValue(input, `${DIRECTORY}/${relativePath}`))
    await until(
      () => container.querySelector('[data-search-kind="file"]') !== null,
      "notebook file result",
    )
    expect(container.querySelectorAll('[data-search-kind="file"]')).toHaveLength(1)
    expect(container.textContent).not.toContain("Search is limited to 200 characters.")
  })

  async function renderBench(opened: unknown[]) {
    await act(async () => {
      root.render(
        <PlatformProvider value={createBrowserPlatform()}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              emptyTabID={null}
              directory={DIRECTORY}
              sessions={[]}
              onOpen={async (request) => {
                opened.push(request)
                return "opened"
              }}
              onOpenThread={async () => true}
              onNewBoard={() => undefined}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      )
    })
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Expected the Bench search input")
    await until(
      () => queryClient.getQueryData(notebookFileIndexQueryKey(DIRECTORY)) !== undefined,
      "loaded file index",
    )
    return input
  }

  function resultTitles(selector: string): Array<string | null | undefined> {
    return Array.from(container.querySelectorAll(selector)).map(
      (row) => row.querySelector("[title]")?.textContent,
    )
  }

  test("opens the top file on an immediate Enter when no remote provider applies", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: ["docs/alpha-guide.md"], partial: false })
      }
      if (url.pathname === "/api/file/raw/alpha-guide.md")
        return new Response(null, { status: 200 })
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)

    const opened: unknown[] = []
    const input = await renderBench(opened)
    await act(async () => setInputValue(input, "alpha"))
    const filterTrigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Filter search types"]',
    )
    if (!filterTrigger) throw new Error("Expected the search filter")
    await act(async () => {
      filterTrigger.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }),
      )
    })
    const filesFilter = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ).find((item) => item.textContent === "Files")
    if (!filesFilter) throw new Error("Expected the Files filter")
    await act(async () => filesFilter.click())

    // Files are ranked locally on every keystroke, so nothing is left to wait for
    // while the debounce that only the chat and Notes providers use is still running.
    await act(async () => setInputValue(input, "alpha-guide"))
    await until(() => container.querySelector('[data-search-kind="file"]') !== null, "file result")
    expect(container.textContent).not.toContain("Searching…")
    let enter: KeyboardEvent | undefined
    await act(async () => {
      enter = pressEnter(input)
    })
    expect(enter?.defaultPrevented).toBe(true)
    await until(() => opened.length > 0, "opened file")
    expect(opened).toMatchObject([
      { type: "object", directory: DIRECTORY, target: { path: "docs/alpha-guide.md" } },
    ])
  })

  test("holds Enter while a remote provider is pending and opens the top row once it settles", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    let releaseNotes: (() => void) | undefined
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: ["docs/alpha-guide.md"], partial: false })
      }
      if (url.pathname === "/api/file/raw/alpha-guide.md")
        return new Response(null, { status: 200 })
      if (url.pathname === "/api/notes") {
        return new Promise<Response>((resolve) => {
          releaseNotes = () => resolve(Response.json({ directory: DIRECTORY, notes: [] }))
        })
      }
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)

    const opened: unknown[] = []
    const input = await renderBench(opened)
    await act(async () => setInputValue(input, "alpha-guide"))
    await until(() => container.querySelector('[data-search-kind="file"]') !== null, "file result")

    // Still inside the debounce, then with the Notes search in flight: a stronger note may yet
    // arrive, so Enter is held rather than opening the current top row.
    let enter: KeyboardEvent | undefined
    await act(async () => {
      enter = pressEnter(input)
    })
    expect(enter?.defaultPrevented).toBe(true)
    await until(() => releaseNotes !== undefined, "pending Notes search")
    expect(container.textContent).toContain("Searching…")
    expect(opened).toEqual([])

    await act(async () => releaseNotes?.())
    await until(() => opened.length > 0, "opened file")
    expect(opened).toMatchObject([
      { type: "object", directory: DIRECTORY, target: { path: "docs/alpha-guide.md" } },
    ])
  })

  test("keeps the highlight on the same result when late results arrive above it", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    const notes = Promise.withResolvers<Response>()
    let notesRequested = false
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({
          paths: ["docs/alpha-guide.md", "docs/alpha-outline.md"],
          partial: false,
        })
      }
      if (url.pathname === "/api/file/raw/alpha-outline.md")
        return new Response(null, { status: 200 })
      if (url.pathname === "/api/notes") {
        notesRequested = true
        return notes.promise
      }
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)

    const opened: unknown[] = []
    const input = await renderBench(opened)
    await act(async () => setInputValue(input, "alpha"))
    await until(
      () => container.querySelectorAll('[data-search-kind="file"]').length === 2,
      "file results",
    )
    await until(() => notesRequested, "pending Notes search")
    expect(resultTitles("[data-search-kind]")).toEqual(["alpha-guide.md", "alpha-outline.md"])

    // The top row starts highlighted; ArrowDown moves the highlight while the field keeps focus.
    expect(resultTitles("[data-search-kind].bg-surface-raised-base")).toEqual(["alpha-guide.md"])
    await act(async () => {
      input.focus()
      pressArrow(input, "ArrowDown")
    })
    expect(document.activeElement).toBe(input)
    expect(resultTitles("[data-search-kind].bg-surface-raised-base")).toEqual(["alpha-outline.md"])

    // An exact title match outranks both files, so it arrives above the highlighted row.
    await act(async () =>
      notes.resolve(
        Response.json({
          directory: DIRECTORY,
          notes: [
            {
              kind: "plain",
              title: "alpha",
              relativePath: "alpha.md",
              updatedAt: 1,
              preview: "Alpha notes.",
            },
          ],
        }),
      ),
    )
    await until(
      () => container.querySelector('[data-search-kind="note"]') !== null,
      "late Notes result",
    )
    await until(() => container.textContent?.includes("Searching…") === false, "settled search")
    expect(resultTitles("[data-search-kind]")).toEqual([
      "alpha",
      "alpha-guide.md",
      "alpha-outline.md",
    ])
    expect(resultTitles("[data-search-kind].bg-surface-raised-base")).toEqual(["alpha-outline.md"])
    expect(document.activeElement).toBe(input)

    let enter: KeyboardEvent | undefined
    await act(async () => {
      enter = pressEnter(input)
    })
    expect(enter?.defaultPrevented).toBe(true)
    await until(() => opened.length > 0, "opened file")
    expect(opened).toMatchObject([
      { type: "object", directory: DIRECTORY, target: { path: "docs/alpha-outline.md" } },
    ])
  })

  test("does not open an unprocessed PDF that was deleted", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    const headRequests = mockPaperPdfFetch(404)
    const errorToast = spyOn(toast, "error").mockImplementation(() => "test-toast")
    try {
      const opened: unknown[] = []
      const input = await renderBench(opened)
      await act(async () => setInputValue(input, "paper.pdf"))
      await until(
        () => container.querySelector('[data-search-kind="source"]') !== null,
        "PDF file result",
      )
      await act(async () =>
        container.querySelector<HTMLButtonElement>('[data-search-kind="source"]')?.click(),
      )
      await until(() => errorToast.mock.calls.length > 0, "missing file toast")
      expect(errorToast).toHaveBeenCalledWith("paper.pdf was moved or deleted.")
      expect(headRequests).toEqual(["reading/paper.pdf"])
      expect(opened).toEqual([])
    } finally {
      errorToast.mockRestore()
    }
  })

  test("opens an unprocessed PDF that still exists", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    const headRequests = mockPaperPdfFetch(200)
    const opened: unknown[] = []
    const input = await renderBench(opened)
    await act(async () => setInputValue(input, "paper.pdf"))
    await until(
      () => container.querySelector('[data-search-kind="source"]') !== null,
      "PDF file result",
    )
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-search-kind="source"]')?.click(),
    )
    await until(() => opened.length > 0, "opened PDF")
    expect(headRequests).toEqual(["reading/paper.pdf"])
    expect(opened).toEqual([
      {
        type: "resource",
        directory: DIRECTORY,
        resource: { path: "reading/paper.pdf", name: "paper.pdf", status: "unprocessed" },
      },
    ])
  })

  test("does not open a pick whose query changed while its file check ran", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    let headRequested = false
    const heldHead = Promise.withResolvers<Response>()
    globalThis.fetch = withFetchPreconnect(async (input, init) => {
      const url = requestURL(input)
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: ["reading/paper.pdf"], partial: false })
      }
      if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
      if (method === "HEAD" && url.pathname === "/api/file/raw/paper.pdf") {
        headRequested = true
        return heldHead.promise
      }
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${method} ${url}`)
    }, originalFetch)

    const opened: unknown[] = []
    const input = await renderBench(opened)
    await act(async () => setInputValue(input, "paper.pdf"))
    await until(
      () => container.querySelector('[data-search-kind="source"]') !== null,
      "PDF file result",
    )
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-search-kind="source"]')?.click(),
    )
    await until(() => headRequested, "file availability check")

    await act(async () => setInputValue(input, "paper"))
    await act(async () => {
      heldHead.resolve(new Response(null, { status: 200 }))
      await new Promise<void>((resolve) => setTimeout(resolve, 20))
    })

    expect(opened).toEqual([])
  })

  test("does not open a pick that resolves after the page is gone", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    let headRequested = false
    const heldHead = Promise.withResolvers<Response>()
    globalThis.fetch = withFetchPreconnect(async (input, init) => {
      const url = requestURL(input)
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")
      if (url.pathname === "/api/find/notebook-file-index") {
        return Response.json({ paths: ["reading/paper.pdf"], partial: false })
      }
      if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
      if (method === "HEAD" && url.pathname === "/api/file/raw/paper.pdf") {
        headRequested = true
        return heldHead.promise
      }
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      if (url.pathname === "/api/session") return Response.json([])
      throw new Error(`Unexpected request: ${method} ${url}`)
    }, originalFetch)

    const opened: unknown[] = []
    const input = await renderBench(opened)
    await act(async () => setInputValue(input, "paper.pdf"))
    await until(
      () => container.querySelector('[data-search-kind="source"]') !== null,
      "PDF file result",
    )
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-search-kind="source"]')?.click(),
    )
    await until(() => headRequested, "file availability check")

    await act(async () => root.render(null))
    await act(async () => {
      heldHead.resolve(new Response(null, { status: 200 }))
      await new Promise<void>((resolve) => setTimeout(resolve, 20))
    })

    expect(opened).toEqual([])
  })
})

function inAppBrowserPlatform(): InAppBrowserPlatform {
  return {
    webPreferences: "",
    onMessage: () => () => undefined,
    onFavicon: () => () => undefined,
    onAudio: () => () => undefined,
    onShortcut: () => () => undefined,
    onShortcutModifier: () => () => undefined,
    onNewTab: () => () => undefined,
    onCitation: () => () => undefined,
    captureCitation: async () => ({ _tag: "failed" as const, reason: "no-selection" as const }),
    markCitation: async () => ({ _tag: "not-found" as const }),
    unmarkCitation: async () => ({ _tag: "done" as const }),
    revealCitation: async () => ({ _tag: "not-found" as const }),
    setAppearance: async () => ({ _tag: "done" }),
    clearProfileData: async () => ({ _tag: "done" }),
    checkSafariFullDiskAccess: async () => false,
    listImportSources: async () => [],
    importCookies: async () => ({ _tag: "failed", reason: "readFailed" }),
    openFullDiskAccessSettings: async () => undefined,
  }
}

describe("empty Bench Browser profiles", () => {
  const WORK_PROFILE_ID = parseInAppBrowserProfileID("0b6f3c1e-5d7a-4c3b-9a51-2f0d8e6b7c41")
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  const desktop: Platform = {
    ...createBrowserPlatform(),
    platform: "desktop",
    inAppBrowser: inAppBrowserPlatform(),
  }

  beforeEach(async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    const storage: PlatformStateStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      flush: async () => undefined,
    }
    setRuntimePlatform({ ...createBrowserPlatform(), storage: () => storage })
    await retryInAppBrowserSettingsHydration()
    if (!WORK_PROFILE_ID) throw new Error("Expected a valid profile id")
    useInAppBrowserSettingsStore.setState({
      ...DEFAULT_IN_APP_BROWSER_SETTINGS,
      userProfiles: [{ id: WORK_PROFILE_ID, name: "Work" }],
    })
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
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    document.body.replaceChildren()
    globalThis.fetch = originalFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    useInAppBrowserSettingsStore.setState(DEFAULT_IN_APP_BROWSER_SETTINGS)
    setRuntimePlatform(createBrowserPlatform())
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function renderBench(opened: unknown[]): Promise<HTMLInputElement> {
    await act(async () =>
      root.render(
        <PlatformProvider value={desktop}>
          <QueryClientProvider client={queryClient}>
            <BenchEmptyState
              emptyTabID={null}
              directory={DIRECTORY}
              sessions={[]}
              onOpen={async (request) => {
                opened.push(request)
                return "opened"
              }}
              onOpenThread={async () => true}
              onNewBoard={() => undefined}
              onNewNote={() => undefined}
              onOpenDrawer={() => undefined}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      ),
    )
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Expected the Bench search input")
    return input
  }

  test("finds a profile's Browser by name and opens a blank tab in it", async () => {
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    mockPaperPdfFetch(200)
    const opened: unknown[] = []
    const input = await renderBench(opened)

    await act(async () => setInputValue(input, "browser"))
    await until(
      () => container.querySelectorAll('[data-search-kind="browser-profile"]').length > 0,
      "Browser rows",
    )
    expect(
      Array.from(container.querySelectorAll('[data-search-kind="browser-profile"]')).map(
        (row) => row.textContent,
      ),
    ).toEqual(["BrowserDefaultAction", "BrowserWorkAction", "BrowserIncognitoAction"])

    await act(async () => setInputValue(input, "incognito"))
    const rows = Array.from(container.querySelectorAll('[data-search-kind="browser-profile"]'))
    expect(rows.map((row) => row.textContent)).toEqual(["BrowserIncognitoAction"])
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true")

    await act(async () => {
      pressEnter(input)
    })
    await until(() => opened.length > 0, "opened Browser tab")
    expect(opened).toMatchObject([
      {
        type: "object",
        directory: DIRECTORY,
        target: {
          type: "browser",
          url: "about:blank",
          profileID: INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
        },
      },
    ])
  })

  test("opens the Browser tile in any profile from its menu", async () => {
    const opened: unknown[] = []
    await renderBench(opened)
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open Browser in a profile"]',
    )
    if (!trigger) throw new Error("Expected the Browser profile menu")
    await act(async () => {
      trigger.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }),
      )
    })
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    expect(items.map((item) => item.textContent)).toEqual(["Default", "Work", "Incognito"])

    await act(async () => items.find((item) => item.textContent === "Work")?.click())
    await until(() => opened.length > 0, "opened Browser tab")
    expect(opened).toMatchObject([
      { target: { type: "browser", url: "about:blank", profileID: WORK_PROFILE_ID } },
    ])
  })
})
