import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { ObjectsListResponse, ObjectFlashcardDeckQueuedCardsResponse } from "@buddy/sdk/types"
import {
  CreationsDrawer,
  PracticeDrawer,
  SourcesDrawer,
} from "../src/components/directory-chat/right-workspace-catalog-drawers"
import { RightWorkspaceBoardsDrawer } from "../src/components/directory-chat/right-workspace-boards-drawer"
import { NotesDrawer } from "../src/features/notes/notes-drawer"
import { notesQueryKeys } from "../src/features/notes/queries"
import type { RightWorkspaceOpenRequest } from "../src/components/directory-chat/right-workspace-open"
import { workspaceObjectsQueryKeys } from "../src/state/workspace-objects-query"
import { resourcesQueryKey } from "../src/state/resources-query"
import {
  benchSurfaceUiKey,
  readFlashcardDeckSurfaceState,
  useBenchSurfaceUiState,
} from "../src/state/bench-surface-ui-state"
import { useWorkspaceDrawerUiState } from "../src/state/workspace-drawer-ui-state"
import { createBenchObjectTarget } from "../src/components/layout/chat-left-sidebar/library-object-selectors"
import { withFetchPreconnect } from "../src/lib/fetch-transport"

const DIRECTORY = "/compact-catalog-fixture"
const originalFetch = globalThis.fetch
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")

type IndexItem = ObjectsListResponse["objects"][number]

function object(kind: IndexItem["kind"], objectID: string, title: string): IndexItem {
  return {
    kind,
    objectID,
    title,
    status: "ready",
    lifecycle: "live",
    surfaces: ["bench"],
    hasLibraryView: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
    sourceRoot: `.buddy/objects/${objectID}/source`,
    filePath: null,
    primaryViewID: "rendered",
  }
}

function inputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  if (!setter) throw new Error("Search input has no value setter")
  setter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

const dueQueue: ObjectFlashcardDeckQueuedCardsResponse = {
  queuedCardIDs: [],
  cards: [],
  queueLease: null,
  newCount: 3,
  learningCount: 0,
  reviewCount: 0,
  resolvedConfig: { newPerDay: 20, reviewsPerDay: 200, leechThreshold: 8 },
  completion: {
    nextLearningAt: null,
    nextDueAt: null,
    nextQueueAt: null,
    newLimitReached: false,
    reviewLimitReached: false,
    newHeldBack: 0,
    reviewHeldBack: 0,
    learningLaterToday: 0,
    returningLater: 0,
    reviewedToday: { newCount: 0, reviewCount: 0 },
  },
}

describe("compact catalog drawers", () => {
  let container: HTMLDivElement
  let root: Root
  let client: QueryClient
  let opened: RightWorkspaceOpenRequest[]
  let unexpectedRequests: string[]

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    // Happy DOM supplies no layout; the virtualized drawer sees a 220px-wide viewport here.
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("data-component") === "right-workspace-drawer-scroll" ? 400 : 32
      },
    })
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return 220
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnMount: false, gcTime: Infinity } },
    })
    opened = []
    unexpectedRequests = []
    globalThis.fetch = withFetchPreconnect(async (input) => {
      unexpectedRequests.push(input instanceof Request ? input.url : String(input))
      return Response.json({ message: "Unexpected unseeded request" }, { status: 500 })
    }, originalFetch)
    useBenchSurfaceUiState.setState({ flashcardDeckByKey: {} })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
    globalThis.fetch = originalFetch
    useBenchSurfaceUiState.setState({ flashcardDeckByKey: {} })
    useWorkspaceDrawerUiState.getState().clearDirectory(DIRECTORY)
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalHeight)
    else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight")
    if (originalWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalWidth)
    else Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth")
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  const onOpen = async (request: RightWorkspaceOpenRequest) => {
    opened.push(request)
    return "opened" as const
  }

  async function render(element: ReactNode) {
    const route = createRootRoute({
      component: () => <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    })
    const router = createRouter({
      routeTree: route,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    })
    await act(async () => {
      await router.load()
      root.render(<RouterProvider router={router} />)
    })
  }

  function titleButton(title: string) {
    const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent === title,
    )
    if (!button) throw new Error(`Missing row: ${title}`)
    return button
  }

  test("selected Boards stay in their list and abbreviated title search uses the shared engine", async () => {
    client.setQueryData(workspaceObjectsQueryKeys.kind(DIRECTORY, "whiteboard"), {
      objects: [
        object("whiteboard", "board-1", "Notebook search"),
        object("whiteboard", "board-2", "Geography"),
      ],
      loadErrors: [],
    })
    await render(
      <RightWorkspaceBoardsDrawer
        directory={DIRECTORY}
        compact
        selectedObjectID="board-1"
        onOpen={onOpen}
      />,
    )
    const selected = titleButton("Notebook search")
    expect(selected.getAttribute("aria-current")).toBe("page")
    expect(selected.className).toContain("bg-surface-raised-base")
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Missing Boards search")
    await act(async () => inputValue(input, "nbs"))
    expect(container.textContent).not.toContain("Geography")
    await act(async () => titleButton("Notebook search").click())
    expect(opened).toEqual([
      {
        type: "object",
        directory: DIRECTORY,
        target: createBenchObjectTarget("whiteboard", "board-1"),
      },
    ])
    expect(titleButton("Notebook search").getAttribute("aria-current")).toBe("page")
  })

  test("compact Practice keeps deck opening separate from Study and preserves question-set Start", async () => {
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), {
      objects: [
        object("flashcard-deck", "deck-1", "Thermodynamics"),
        object("question-set", "questions-1", "Entropy check"),
      ],
      loadErrors: [],
    })
    client.setQueryData(
      workspaceObjectsQueryKeys.flashcardDeckPayload({ directory: DIRECTORY, objectID: "deck-1" }),
      {
        objectID: "deck-1",
        kind: "flashcard-deck",
        title: "Thermodynamics",
        config: {},
        notes: [],
        cards: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: { kind: "app", reason: "test" },
      },
    )
    client.setQueryData(
      workspaceObjectsQueryKeys.flashcardDeckQueue({ directory: DIRECTORY, objectID: "deck-1" }),
      dueQueue,
    )
    client.setQueryData(
      workspaceObjectsQueryKeys.questionSetPayload({
        directory: DIRECTORY,
        objectID: "questions-1",
      }),
      { questions: [] },
    )
    await render(
      <PracticeDrawer directory={DIRECTORY} compact selectedObjectID="deck-1" onOpen={onOpen} />,
    )
    expect(titleButton("Thermodynamics").getAttribute("aria-current")).toBe("page")
    expect(
      titleButton("Thermodynamics").closest('[data-component="compact-catalog-row"]')?.className,
    ).toContain("bg-surface-raised-base")
    const deckKey = benchSurfaceUiKey({
      directory: DIRECTORY,
      target: createBenchObjectTarget("flashcard-deck", "deck-1"),
    })
    await act(async () => titleButton("Study 3").click())
    expect(readFlashcardDeckSurfaceState(deckKey).mode).toBe("review")
    await act(async () => titleButton("Thermodynamics").click())
    expect(readFlashcardDeckSurfaceState(deckKey).mode).toBe("deck")
    await act(async () => titleButton("Start").click())
    expect(opened.at(-1)).toEqual({
      type: "object",
      directory: DIRECTORY,
      target: createBenchObjectTarget("question-set", "questions-1"),
    })
    expect(unexpectedRequests).toEqual([])
  })

  test("compact Creations open without requesting inline media previews", async () => {
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), {
      objects: [object("figure", "figure-1", "Pressure graph")],
      loadErrors: [],
    })
    await render(
      <CreationsDrawer
        directory={DIRECTORY}
        compact
        selectedObjectID="figure-1"
        onOpen={onOpen}
        onCreate={() => undefined}
      />,
    )
    expect(titleButton("Pressure graph").getAttribute("aria-current")).toBe("page")
    await act(async () => titleButton("Pressure graph").click())
    expect(opened).toEqual([
      {
        type: "object",
        directory: DIRECTORY,
        target: createBenchObjectTarget("figure", "figure-1"),
      },
    ])
    expect(unexpectedRequests).toEqual([])
  })

  test("reveals a selected creation beyond the initial virtual rows", async () => {
    const originalScrollTo = HTMLElement.prototype.scrollTo
    const originalScrollHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollHeight",
    )
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("data-component") === "right-workspace-drawer-scroll" ? 80 * 32 : 0
      },
    })
    // SAFETY: This test only exercises TanStack Virtual scrollToIndex, which passes ScrollToOptions.
    HTMLElement.prototype.scrollTo = function (this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? 0
      queueMicrotask(() => this.dispatchEvent(new Event("scroll")))
    } as HTMLElement["scrollTo"]
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), {
      objects: Array.from({ length: 80 }, (_, index) =>
        object("figure", `figure-${index}`, `Figure ${index}`),
      ),
      loadErrors: [],
    })
    try {
      await render(
        <CreationsDrawer
          directory={DIRECTORY}
          compact
          selectedObjectID="figure-79"
          onOpen={onOpen}
          onCreate={() => undefined}
        />,
      )
      await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)))
      expect(titleButton("Figure 79").getAttribute("aria-current")).toBe("page")
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo
      if (originalScrollHeight)
        Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight)
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight")
    }
  })

  test("compact Sources preserve selection and unprocessed file opening with its processing action", async () => {
    client.setQueryData(resourcesQueryKey(DIRECTORY), {
      items: [
        {
          key: "source-1",
          objectID: "source-1",
          name: "Physics.pdf",
          title: "Physics",
          extension: "pdf",
          path: "Physics.pdf",
          status: "ready",
        },
        {
          key: "unprocessed",
          name: "Entropy.pdf",
          extension: "pdf",
          path: "Entropy.pdf",
          status: "unprocessed",
        },
      ],
      processed: [],
    })
    await render(
      <SourcesDrawer directory={DIRECTORY} compact selectedObjectID="source-1" onOpen={onOpen} />,
    )
    expect(titleButton("Physics").getAttribute("aria-current")).toBe("page")
    expect(container.querySelector('button[aria-label="Process Entropy.pdf"]')).not.toBeNull()
    await act(async () => titleButton("Entropy.pdf").click())
    expect(opened).toEqual([
      {
        type: "resource",
        directory: DIRECTORY,
        resource: { path: "Entropy.pdf", name: "Entropy.pdf", status: "unprocessed" },
      },
    ])
    expect(unexpectedRequests).toEqual([])
  })

  test("Sources search matches display titles and filenames independently", async () => {
    client.setQueryData(resourcesQueryKey(DIRECTORY), {
      items: [
        {
          key: "source-1",
          objectID: "source-1",
          name: "Entropy.pdf",
          title: "Physics",
          extension: "pdf",
          path: "Entropy.pdf",
          status: "ready",
        },
      ],
      processed: [],
    })
    await render(<SourcesDrawer directory={DIRECTORY} compact onOpen={onOpen} />)
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')
    if (!input) throw new Error("Missing Sources search")
    await act(async () => inputValue(input, "Physics"))
    expect(container.textContent).toContain("Physics")
    await act(async () => inputValue(input, "Entropy"))
    expect(container.textContent).toContain("Physics")
    await act(async () => inputValue(input, "Physics Entropy"))
    expect(container.querySelector('[data-component="compact-catalog-row"]')).toBeNull()
  })

  test("Sources search survives switching to another drawer and back", async () => {
    client.setQueryData(resourcesQueryKey(DIRECTORY), { items: [], processed: [] })
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), { objects: [], loadErrors: [] })
    await render(<SourcesDrawer directory={DIRECTORY} compact onOpen={onOpen} />)
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Search sources…"]')
    if (!input) throw new Error("Missing Sources search")
    await act(async () => inputValue(input, "Physics"))

    await render(<PracticeDrawer directory={DIRECTORY} compact onOpen={onOpen} />)
    await render(<SourcesDrawer directory={DIRECTORY} compact onOpen={onOpen} />)

    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Search sources…"]')?.value,
    ).toBe("Physics")
  })

  test("failed Practice queue shows an unavailable return time", async () => {
    client.setQueryData(workspaceObjectsQueryKeys.all(DIRECTORY), {
      objects: [object("flashcard-deck", "deck-1", "Thermodynamics")],
      loadErrors: [],
    })
    client.setQueryData(
      workspaceObjectsQueryKeys.flashcardDeckPayload({ directory: DIRECTORY, objectID: "deck-1" }),
      {
        objectID: "deck-1",
        kind: "flashcard-deck",
        title: "Thermodynamics",
        config: {},
        notes: [],
        cards: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        createdBy: { kind: "app", reason: "test" },
      },
    )
    await render(<PracticeDrawer directory={DIRECTORY} compact onOpen={onOpen} />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const row = titleButton("Thermodynamics").closest('[data-component="compact-catalog-row"]')
    expect(row?.textContent).toContain("Unavailable")
    expect(row?.textContent).not.toContain("Loading")
  })

  test("Notes scopes truncate at narrow widths and note rows stay text-only", async () => {
    client.setQueryData(notesQueryKeys.library(DIRECTORY), {
      directory: "/Notes",
      activeNotebookID: "notebook-1",
      notes: [
        {
          kind: "buddy",
          type: "buddy-note",
          title: "Written note",
          relativePath: "Written note.md",
          notebookID: "notebook-1",
          updatedAt: 1,
        },
        {
          kind: "buddy",
          type: "buddy-session-note",
          title: "Chat note",
          relativePath: "Chat note.md",
          notebookID: "notebook-1",
          updatedAt: 2,
        },
      ],
    })
    await render(<NotesDrawer directory={DIRECTORY} onOpen={onOpen} />)
    const scopeButton = titleButton("Notebook")
    expect(scopeButton.getAttribute("aria-label")).toBe("This notebook")
    expect(scopeButton.querySelector("span")?.className).toContain("truncate")
    expect(titleButton("Written note").querySelector("svg")).toBeNull()
    expect(titleButton("Chat note").querySelector("svg")).toBeNull()
    expect(container.textContent).not.toContain("My notes")
    expect(container.textContent).toContain("Chat notes")
  })
})
