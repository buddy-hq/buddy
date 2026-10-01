import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { setRuntimeServerConnection } from "../src/context/server"
import {
  invalidateNotebookFileIndex,
  notebookFileIndexQueryKey,
  useNotebookFileSearch,
} from "../src/state/notebook-file-search"
import {
  notesLibraryQueryOptions,
  invalidateNotesSearchQueries,
} from "../src/features/notes/queries"
import { listNotes } from "../src/features/notes/api"
import {
  mergeCatalogIntoOpenTabs,
  promoteNotebookSearchResultToOpenTab,
  useNotebookSearch,
  type NotebookSearch,
} from "../src/state/use-notebook-search"
import { searchNotebookResults, type NotebookSearchResult } from "../src/state/notebook-search"
import type { BenchTab } from "../src/lib/bench-tabs"
import {
  refetchActiveWorkspaceObjectQueries,
  workspaceObjectsQueryKeys,
} from "../src/state/workspace-objects-query"
import { processedResourcesQueryKey } from "../src/state/resources-query"
import { withFetchPreconnect, type FetchImplementation } from "../src/lib/fetch-transport"
import { FileChangingToolCompletionSchema } from "../src/lib/directory-chat/chat-event-schemas"

const DIRECTORY = "/notebook-search-fixture"
const originalFetch = globalThis.fetch

type FileSearch = ReturnType<typeof useNotebookFileSearch>

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

function tool(name: string, status: string) {
  return {
    id: "part",
    sessionID: "session",
    messageID: "message",
    type: "tool",
    tool: name,
    state: { status },
  }
}

function FileProbe(props: {
  query: string
  enabled?: boolean
  receive: (search: FileSearch) => void
}) {
  const search = useNotebookFileSearch({
    directory: DIRECTORY,
    query: props.query,
    enabled: props.enabled,
  })
  props.receive(search)
  return null
}

function SearchProbe(props: {
  query: string
  filter?: "all" | "note"
  receive: (search: NotebookSearch) => void
}) {
  const search = useNotebookSearch({
    directory: DIRECTORY,
    query: props.query,
    filter: props.filter ?? "all",
  })
  props.receive(search)
  return null
}

function openTabSearchResult(tab: BenchTab, title: string): NotebookSearchResult {
  return {
    id: `open-tab:${tab.key}`,
    kind: "practice",
    title,
    metadata: "Open tab",
    updatedAtMs: 0,
    target: { type: "open-tab", tabKey: tab.key, target: tab.target },
  }
}

describe("shared notebook search", () => {
  let root: Root
  let container: HTMLDivElement
  let client: QueryClient

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    setRuntimeServerConnection({ url: "http://buddy.test", isEmbeddedBackend: false })
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    globalThis.fetch = withFetchPreconnect(async (input) => {
      throw new Error(`Unexpected request: ${requestURL(input)}`)
    }, originalFetch)
  })

  test("content matches on an open note switch to its tab, including notes without ids", () => {
    const tabs = [
      {
        key: "note-tab",
        target: {
          type: "workspace-file" as const,
          root: "notes" as const,
          path: "Physics.md",
          viewer: "markdown" as const,
        },
      },
    ]
    const hit = {
      id: "note:Physics.md",
      kind: "note" as const,
      title: "Thermodynamics",
      metadata: "Note",
      updatedAtMs: 0,
      providerMatchedQuery: "entropy",
      target: { type: "note" as const, relativePath: "Physics.md" },
    }
    const promoted = promoteNotebookSearchResultToOpenTab(hit, tabs)
    expect(promoted.target).toEqual({
      type: "open-tab",
      tabKey: "note-tab",
      target: tabs[0]?.target,
    })
    expect(promoted.metadata).toBe("Open tab")
    expect(promoted.providerMatchedQuery).toBe("entropy")
    expect(
      promoteNotebookSearchResultToOpenTab(
        { ...hit, target: { type: "note", relativePath: "Other.md" } },
        tabs,
      ).target.type,
    ).toBe("note")
  })

  test("an open source stays findable by its catalog author and source path", () => {
    const origin: BenchTab = {
      key: "origin-tab",
      target: {
        type: "object",
        ref: { kind: "resource", objectID: "origin", revisionID: null, itemID: null },
        viewID: "reader",
      },
    }
    const tabs = [origin]
    const tab: NotebookSearchResult = {
      id: "open-tab:origin-tab",
      kind: "source",
      title: "On the Origin of Species",
      metadata: "Open tab",
      updatedAtMs: 0,
      target: { type: "open-tab", tabKey: origin.key, target: origin.target },
    }
    const catalog: NotebookSearchResult = {
      id: "source:origin",
      kind: "source",
      title: "On the Origin of Species",
      metadata: "EPUB · Charles Darwin",
      keywords: "books/origin.epub ",
      updatedAtMs: 0,
      target: {
        type: "resource",
        path: "books/origin.epub",
        name: "origin.epub",
        objectID: "origin",
      },
    }
    const results = mergeCatalogIntoOpenTabs([tab], [catalog], tabs)
    expect(results.map((result) => result.id)).toEqual(["open-tab:origin-tab"])
    for (const query of ["Darwin", "books/origin"]) {
      expect(
        searchNotebookResults({ query, filter: "all", results }).map((result) => result.id),
      ).toEqual(["open-tab:origin-tab"])
    }
  })

  test("an open tab ranks in recents by its item's own time, not as just opened", () => {
    const deckTab: BenchTab = {
      key: "deck-tab",
      target: {
        type: "object",
        ref: { kind: "flashcard-deck", objectID: "deck", revisionID: null, itemID: null },
        viewID: "deck",
      },
    }
    const fileTab: BenchTab = {
      key: "file-tab",
      target: {
        type: "workspace-file",
        root: "notebook",
        path: "notes/todo.md",
        viewer: "markdown",
      },
    }
    const tabs = [deckTab, fileTab]
    const deck: NotebookSearchResult = {
      id: "practice:deck",
      kind: "practice",
      title: "Deck",
      metadata: "Flashcards",
      updatedAtMs: 100,
      target: { type: "object", kind: "flashcard-deck", objectID: "deck" },
    }
    const chat: NotebookSearchResult = {
      id: "thread:chat",
      kind: "thread",
      title: "Chat",
      metadata: "Chat",
      updatedAtMs: 200,
      target: { type: "thread", sessionID: "chat" },
    }
    const results = mergeCatalogIntoOpenTabs(
      [openTabSearchResult(deckTab, "Deck"), openTabSearchResult(fileTab, "todo.md")],
      [deck, chat],
      tabs,
    )
    expect(results.find((result) => result.id === "open-tab:deck-tab")?.updatedAtMs).toBe(100)
    // The newer chat leads; a file with no known time follows the dated items.
    expect(
      searchNotebookResults({ query: "", filter: "all", results }).map((result) => result.id),
    ).toEqual(["thread:chat", "open-tab:deck-tab", "open-tab:file-tab"])
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    client.clear()
    container.remove()
    globalThis.fetch = originalFetch
    setRuntimeServerConnection({ url: "", isEmbeddedBackend: false })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  async function render(children: ReactNode) {
    await act(async () => {
      root.render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)
    })
  }

  test("one index request serves every file search, and typing ranks it locally", async () => {
    let requests = 0
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      expect(url.pathname).toBe("/api/find/notebook-file-index")
      requests += 1
      return Response.json({ paths: ["alpha.md", "beta.md", "notes/alphabet.md"], partial: false })
    }, originalFetch)
    let first: FileSearch | undefined
    let second: FileSearch | undefined
    await render(
      <>
        <FileProbe
          query="alpha"
          receive={(search) => {
            first = search
          }}
        />
        <FileProbe
          query="beta"
          receive={(search) => {
            second = search
          }}
        />
      </>,
    )
    await until(
      () => first?.matches[0] === "alpha.md" && second?.matches[0] === "beta.md",
      "both filename queries",
    )
    expect(first?.matches).toEqual(["alpha.md", "notes/alphabet.md"])
    await render(
      <>
        <FileProbe
          query="alphab"
          receive={(search) => {
            first = search
          }}
        />
        <FileProbe
          query="beta"
          receive={(search) => {
            second = search
          }}
        />
      </>,
    )
    expect(first?.matches).toEqual(["notes/alphabet.md"])
    expect(first?.searching).toBe(false)
    expect(requests).toBe(1)
  })

  test("refresh reloads the shared index for every active search", async () => {
    let changed = false
    globalThis.fetch = withFetchPreconnect(async () => {
      const suffix = changed ? "new" : "old"
      return Response.json({ paths: [`alpha-${suffix}.md`, `beta-${suffix}.md`], partial: false })
    }, originalFetch)
    let first: FileSearch | undefined
    let second: FileSearch | undefined
    await render(
      <>
        <FileProbe
          query="alpha"
          receive={(search) => {
            first = search
          }}
        />
        <FileProbe
          query="beta"
          receive={(search) => {
            second = search
          }}
        />
      </>,
    )
    await until(
      () => first?.matches[0] === "alpha-old.md" && second?.matches[0] === "beta-old.md",
      "initial index",
    )
    changed = true
    const refresh = first?.refresh
    if (!refresh) throw new Error("First search did not render")
    await act(async () => {
      await refresh()
    })
    await until(
      () => first?.matches[0] === "alpha-new.md" && second?.matches[0] === "beta-new.md",
      "refreshed index",
    )
    expect(first?.error).toBe(false)
    expect(second?.error).toBe(false)
  })

  test("local notebook items appear immediately while remote providers are pending, then content-only Notes join them", async () => {
    const remote = Promise.withResolvers<Response>()
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), { objects: [] })
    client.setQueryData(processedResourcesQueryKey(DIRECTORY), [])
    let search: NotebookSearch | undefined
    function LocalProbe() {
      const result = useNotebookSearch({
        directory: DIRECTORY,
        query: "entropy",
        filter: "all",
        sessions: [
          {
            id: "local-chat",
            title: "Entropy discussion",
            time: { created: 0, updated: 0 },
          },
        ],
      })
      search = result
      return null
    }
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/objects") return Response.json({ objects: [], loadErrors: [] })
      if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
      if (url.pathname === "/api/find/notebook-file-index") return remote.promise
      if (url.pathname === "/api/session") return Response.json([])
      if (url.pathname === "/api/notes")
        return Response.json({
          directory: "/notes-fixture",
          notes: [
            {
              kind: "plain",
              title: "Thermodynamics",
              relativePath: "Physics.md",
              updatedAt: 0,
              preview: "Entropy measures the possible configurations of a system.",
            },
          ],
        })
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)
    await render(<LocalProbe />)
    expect(search?.results.map((result) => result.id)).toEqual(["thread:local-chat"])
    expect(search?.searching).toBe(true)
    remote.resolve(Response.json({ paths: [], partial: false }))
    await until(() => search?.searching === false, "all remote providers")
    expect(search?.results.map((result) => result.id)).toEqual([
      "thread:local-chat",
      "note:Physics.md",
    ])
    expect(search?.failedProviders).toEqual([])
  })

  test("an open search picks up a whiteboard the agent created once the catalog reloads", async () => {
    let objects: unknown[] = []
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/objects") return Response.json({ objects, loadErrors: [] })
      if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
      if (url.pathname === "/api/find/notebook-file-index")
        return Response.json({ paths: [], partial: false })
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)
    let search: NotebookSearch | undefined
    await render(
      <SearchProbe
        query="orbit"
        receive={(value) => {
          search = value
        }}
      />,
    )
    await until(() => search?.searching === false, "initial search")
    expect(search?.results).toEqual([])
    objects = [
      {
        objectID: "wb-orbit",
        kind: "whiteboard",
        title: "Orbit sketch",
        status: "ready",
        hasLibraryView: true,
        surfaces: ["bench"],
        updatedAt: new Date(0).toISOString(),
        createdAt: new Date(0).toISOString(),
      },
    ]
    await act(async () => {
      await refetchActiveWorkspaceObjectQueries(client, DIRECTORY)
    })
    await until(
      () => search?.results.some((result) => result.title === "Orbit sketch") === true,
      "agent whiteboard",
    )
  })

  test("Notes list and notebook search share requests and update after note invalidation", async () => {
    let requests = 0
    let hasHit = true
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/objects") return Response.json({ objects: [], loadErrors: [] })
      if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
      if (url.pathname === "/api/find/notebook-file-index")
        return Response.json({ paths: [], partial: false })
      if (url.pathname === "/api/notes") {
        requests += 1
        return Response.json({
          directory: "/notes-fixture",
          notes: hasHit
            ? [
                {
                  kind: "plain",
                  title: "Thermodynamics",
                  relativePath: "Physics.md",
                  updatedAt: 0,
                  preview: "Entropy",
                },
              ]
            : [],
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), { objects: [] })
    client.setQueryData(processedResourcesQueryKey(DIRECTORY), [])
    let search: NotebookSearch | undefined
    function NotesListProbe() {
      useQuery(notesLibraryQueryOptions(DIRECTORY, "entropy"))
      return null
    }
    await render(
      <>
        <NotesListProbe />
        <SearchProbe
          query="entropy"
          receive={(value) => {
            search = value
          }}
        />
      </>,
    )
    await until(() => search?.searching === false, "shared Notes search")
    expect(requests).toBe(1)
    expect(search?.results.map((result) => result.id)).toEqual(["note:Physics.md"])
    hasHit = false
    await act(async () => {
      await invalidateNotesSearchQueries(client)
    })
    await until(() => search?.results.length === 0, "updated Notes search")
    expect(requests).toBe(2)
  })

  test("server-accepted raw Markdown Notes hits survive local ranking", async () => {
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/objects") return Response.json({ objects: [], loadErrors: [] })
      if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
      if (url.pathname === "/api/find/notebook-file-index")
        return Response.json({ paths: [], partial: false })
      if (url.pathname === "/api/notes") {
        expect(url.searchParams.get("query")).toBe("**entropy**")
        return Response.json({
          directory: "/notes-fixture",
          notes: [
            {
              kind: "plain",
              title: "Thermodynamics",
              relativePath: "Physics.md",
              updatedAt: 0,
              preview: "Entropy measures the possible configurations of a system.",
            },
          ],
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), { objects: [] })
    client.setQueryData(processedResourcesQueryKey(DIRECTORY), [])
    let search: NotebookSearch | undefined
    await render(
      <SearchProbe
        query="**entropy**"
        receive={(result) => {
          search = result
        }}
      />,
    )
    await until(() => search?.searching === false, "raw Markdown note search")
    expect(search?.results.map((result) => result.id)).toEqual(["note:Physics.md"])
    expect(search?.results[0]?.target).toEqual({ type: "note", relativePath: "Physics.md" })
  })

  test("a partial index marks every query partial, and one-character queries stay local", async () => {
    let requests = 0
    globalThis.fetch = withFetchPreconnect(async () => {
      requests += 1
      return Response.json({ paths: ["alpha.md", "beta.md"], partial: true })
    }, originalFetch)
    let search: FileSearch | undefined
    const receive = (result: FileSearch) => {
      search = result
    }
    await render(<FileProbe query="alpha" receive={receive} />)
    await until(() => search?.partial === true, "partial index")
    await render(<FileProbe query="beta" receive={receive} />)
    expect(search?.matches).toEqual(["beta.md"])
    expect(search?.partial).toBe(true)
    expect(search?.searching).toBe(false)
    await render(<FileProbe query="a" receive={receive} />)
    expect(search?.matches).toEqual([])
    expect(search?.partial).toBe(false)
    expect(search?.searching).toBe(false)
    expect(requests).toBe(1)
  })

  test("disabled file search ignores cached partial results and failures", async () => {
    let failFiles = false
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      if (url.pathname === "/api/find/notebook-file-index") {
        if (failFiles) throw new Error("File provider unavailable")
        return Response.json({ paths: ["alpha.md"], partial: true })
      }
      if (url.pathname === "/api/objects") return Response.json({ objects: [], loadErrors: [] })
      if (url.pathname === "/api/objects/resource") return Response.json({ resources: [] })
      if (url.pathname === "/api/notes") return Response.json({ directory: DIRECTORY, notes: [] })
      throw new Error(`Unexpected request: ${url}`)
    }, originalFetch)
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), { objects: [] })
    client.setQueryData(processedResourcesQueryKey(DIRECTORY), [])
    let search: NotebookSearch | undefined
    const receive = (value: NotebookSearch) => {
      search = value
    }
    await render(<SearchProbe query="alpha" receive={receive} />)
    await until(() => search?.incomplete === true, "partial file search")
    await render(<SearchProbe query="alpha" filter="note" receive={receive} />)
    expect(search?.incomplete).toBe(false)
    expect(search?.failedProviders).toEqual([])

    failFiles = true
    await act(async () => {
      await client.resetQueries({ queryKey: notebookFileIndexQueryKey(DIRECTORY) })
    })
    await render(<SearchProbe query="alpha" receive={receive} />)
    await until(() => search?.failedProviders.includes("files") === true, "failed file search")
    await render(<SearchProbe query="alpha" filter="note" receive={receive} />)
    expect(search?.incomplete).toBe(false)
    expect(search?.failedProviders).toEqual([])
  })

  test("background index reload keeps cached results actionable", async () => {
    const background = Promise.withResolvers<Response>()
    let requests = 0
    globalThis.fetch = withFetchPreconnect(async (input) => {
      const url = requestURL(input)
      expect(url.pathname).toBe("/api/find/notebook-file-index")
      requests += 1
      if (requests === 1) return Response.json({ paths: ["alpha.md"], partial: false })
      return background.promise
    }, originalFetch)
    let search: FileSearch | undefined
    await render(
      <FileProbe
        query="alpha"
        receive={(value) => {
          search = value
        }}
      />,
    )
    await until(() => search?.matches[0] === "alpha.md", "initial file result")
    await act(async () => {
      void client.invalidateQueries({ queryKey: notebookFileIndexQueryKey(DIRECTORY) })
    })
    await until(() => requests === 2, "background index reload")
    expect(search?.matches).toEqual(["alpha.md"])
    expect(search?.searching).toBe(false)
    background.resolve(Response.json({ paths: ["alpha-new.md"], partial: false }))
    await until(() => search?.matches[0] === "alpha-new.md", "reloaded file result")
  })

  test("returning to the window reloads the index for files made in other apps", async () => {
    let paths = ["alpha.md"]
    let requests = 0
    globalThis.fetch = withFetchPreconnect(async () => {
      requests += 1
      return Response.json({ paths, partial: false })
    }, originalFetch)
    let search: FileSearch | undefined
    let otherSearch: FileSearch | undefined
    await render(
      <>
        <FileProbe
          query="alpha"
          receive={(value) => {
            search = value
          }}
        />
        <FileProbe
          query="finder"
          receive={(value) => {
            otherSearch = value
          }}
        />
      </>,
    )
    await until(() => search?.matches[0] === "alpha.md", "initial index")
    paths = ["alpha.md", "alpha-from-finder.md"]
    await act(async () => {
      window.dispatchEvent(new Event("focus"))
    })
    await until(() => search?.matches.includes("alpha-from-finder.md") === true, "focus reload")
    expect(otherSearch?.matches).toEqual(["alpha-from-finder.md"])
    // Both open searches heard the event; one walk serves them, with no follow-up reload.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_100))
    })
    expect(requests).toBe(2)
  })

  test("a burst of file changes reloads at once and once more when the burst settles", async () => {
    let paths = ["alpha.md"]
    let requests = 0
    globalThis.fetch = withFetchPreconnect(async () => {
      requests += 1
      return Response.json({ paths, partial: false })
    }, originalFetch)
    let search: FileSearch | undefined
    await render(
      <FileProbe
        query="alpha"
        receive={(value) => {
          search = value
        }}
      />,
    )
    await until(() => search?.matches[0] === "alpha.md", "initial index")
    await act(async () => {
      void invalidateNotebookFileIndex(client, DIRECTORY)
    })
    await until(() => requests === 2, "immediate reload")
    // The rest of the burst lands after that walk, so one trailing reload must still see it.
    paths = ["alpha.md", "alpha-last.md"]
    await act(async () => {
      for (let change = 0; change < 5; change += 1)
        void invalidateNotebookFileIndex(client, DIRECTORY)
    })
    expect(requests).toBe(2)
    await until(() => search?.matches.includes("alpha-last.md") === true, "trailing reload")
    expect(requests).toBe(3)
  })

  test("a change during the first load restarts it instead of joining a walk that missed it", async () => {
    let requests = 0
    const firstLoad = Promise.withResolvers<void>()
    globalThis.fetch = withFetchPreconnect(async (input, init) => {
      requests += 1
      if (requests > 1)
        return Response.json({ paths: ["alpha.md", "alpha-new.md"], partial: false })
      const signal = input instanceof Request ? input.signal : init?.signal
      firstLoad.resolve()
      return new Promise<Response>((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    }, originalFetch)
    let search: FileSearch | undefined
    await render(
      <FileProbe
        query="alpha"
        receive={(value) => {
          search = value
        }}
      />,
    )
    await firstLoad.promise
    await act(async () => {
      void invalidateNotebookFileIndex(client, DIRECTORY)
    })
    await until(() => search?.matches.includes("alpha-new.md") === true, "restarted first load")
    expect(requests).toBe(2)
    expect(search?.error).toBe(false)
  })

  test("only finished file-changing tool calls reload the file index", () => {
    expect(FileChangingToolCompletionSchema.safeParse(tool("write", "completed")).success).toBe(
      true,
    )
    expect(FileChangingToolCompletionSchema.safeParse(tool("bash", "completed")).success).toBe(true)
    expect(FileChangingToolCompletionSchema.safeParse(tool("write", "running")).success).toBe(false)
    expect(FileChangingToolCompletionSchema.safeParse(tool("read", "completed")).success).toBe(
      false,
    )
    const finished = {
      ...tool("edit", "completed"),
      state: { status: "completed", time: { start: 1, end: 2 } },
    }
    expect(FileChangingToolCompletionSchema.safeParse(finished).success).toBe(true)
    // Compaction re-saves old calls; they must not reload the index again.
    const compacted = {
      ...finished,
      state: { ...finished.state, time: { start: 1, end: 2, compacted: 3 } },
    }
    expect(FileChangingToolCompletionSchema.safeParse(compacted).success).toBe(false)
  })

  test("an aborted Notes request preserves the cancellation reason", async () => {
    const started = Promise.withResolvers<void>()
    globalThis.fetch = withFetchPreconnect(async (input, init) => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
      if (!signal) throw new Error("Search request omitted cancellation signal")
      started.resolve()
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true })
      })
    }, originalFetch)
    const controller = new AbortController()
    const pending = listNotes(DIRECTORY, "entropy", controller.signal)
    await started.promise
    const reason = new DOMException("Query replaced", "AbortError")
    controller.abort(reason)
    await expect(pending).rejects.toBe(reason)
  })

  test("a pre-aborted Notes request preserves even a non-Error cancellation reason without fetching", async () => {
    let requests = 0
    globalThis.fetch = withFetchPreconnect(async () => {
      requests += 1
      return Response.json({ directory: "/notes-fixture", notes: [] })
    }, originalFetch)
    const controller = new AbortController()
    const reason = { query: "replaced" }
    controller.abort(reason)
    await expect(listNotes(DIRECTORY, "entropy", controller.signal)).rejects.toBe(reason)
    expect(requests).toBe(0)
  })
})
