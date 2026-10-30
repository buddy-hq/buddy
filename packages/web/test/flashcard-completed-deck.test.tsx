import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import z from "zod"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
  ObjectsListResponse,
} from "@buddy/sdk/types"
import { FlashcardBenchDeck } from "../src/components/bench/flashcard-bench-deck"
import { BenchRouteContextProvider } from "../src/components/bench/bench-route-context"
import { DirectoryWorkspaceContext } from "../src/components/directory-chat/directory-workspace-context-value"
import { PracticeDrawer } from "../src/components/directory-chat/right-workspace-catalog-drawers"
import {
  notebookSearchOpenRequest,
  useRightWorkspaceOpen,
} from "../src/components/directory-chat/right-workspace-open"
import { createBenchObjectTarget } from "../src/components/layout/chat-left-sidebar/library-object-selectors"
import { ServerProvider } from "../src/context/server"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import {
  DirectoryWorkspaceBlocker,
  DirectoryWorkspaceController,
} from "../src/lib/directory-workspace-controller"
import { DirectoryWorkspaceLifecycleService } from "../src/lib/directory-workspace-lifecycle"
import { allowBenchLeave } from "../src/lib/bench-leave-guard"
import {
  createDirectoryWorkspaceStore,
  createExpandedWorkspaceState,
  effectiveWorkspaceProjection,
  type BenchRouteSnapshot,
} from "../src/state/directory-workspace-store"
import {
  benchSurfaceUiKey,
  readFlashcardDeckSurfaceState,
  useBenchSurfaceUiState,
} from "../src/state/bench-surface-ui-state"
import { useWorkspaceDrawerUiState } from "../src/state/workspace-drawer-ui-state"
import { parseRequestUrl } from "./parse-test-values"

const DIRECTORY = "/completed-deck-fixture"
const OBJECT_ID = "deck-complete"
const TARGET = createBenchObjectTarget("flashcard-deck", OBJECT_ID)
const originalFetch = globalThis.fetch
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")
const ReviewAnswerSchema = z.object({
  cardID: z.string(),
  queueLease: z.object({ reviewMode: z.string().optional() }),
})

type Deck = ObjectFlashcardDeckReadDeckResponse
type Queue = ObjectFlashcardDeckQueuedCardsResponse

function completedDeck(config: Deck["config"] = {}): Deck {
  return {
    objectID: OBJECT_ID,
    kind: "flashcard-deck",
    title: "Deck order fixture",
    config,
    notes: [
      {
        noteID: "note-cloze",
        objectID: OBJECT_ID,
        type: "cloze",
        fields: { text: "Card one is {{c1::Paris}} in {{c2::France}}." },
      },
      {
        noteID: "note-second",
        objectID: OBJECT_ID,
        type: "basic",
        fields: { front: "Second deck card", back: "Second answer" },
      },
    ],
    cards: [
      { cardID: "card-z", noteID: "note-cloze", templateIdx: 1 },
      { cardID: "card-b", noteID: "note-second", templateIdx: 0 },
      { cardID: "card-a", noteID: "note-cloze", templateIdx: 0 },
    ].map((card) =>
      Object.assign(card, {
        state: "review" as const,
        queue: "review" as const,
        due: Date.now() + 86_400_000,
        interval: 4,
        easeFactor: 1800,
        reps: 8,
        lapses: 2,
        remainingSteps: 0,
      }),
    ),
    createdAt: "2026-08-09T00:00:00.000Z",
    createdBy: { kind: "app", reason: "test" },
  }
}

function emptyQueue(): Queue {
  return {
    queuedCardIDs: [],
    cards: [],
    queueLease: null,
    newCount: 0,
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
      returningLater: 3,
      reviewedToday: { newCount: 0, reviewCount: 0 },
    },
  }
}

function LauncherHarness(props: { deck: Deck }) {
  const open = useRightWorkspaceOpen()
  return (
    <>
      <PracticeDrawer directory={DIRECTORY} compact onOpen={open} />
      <button
        type="button"
        onClick={() => {
          const request = notebookSearchOpenRequest({
            directory: DIRECTORY,
            result: {
              id: "search-deck",
              kind: "practice",
              title: props.deck.title,
              metadata: "3 cards",
              updatedAtMs: 0,
              target: { type: "object", kind: "flashcard-deck", objectID: OBJECT_ID },
            },
          })
          if (request) void open(request)
        }}
      >
        Open search result
      </button>
      {TARGET.type === "object" ? (
        <FlashcardBenchDeck
          directory={DIRECTORY}
          objectID={OBJECT_ID}
          target={TARGET}
          deck={props.deck}
        />
      ) : null}
    </>
  )
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (check()) return
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error("Expected flashcard surface did not update")
}

describe("completed flashcard deck", () => {
  let container: HTMLDivElement
  let root: Root
  let client: QueryClient
  let deck: Deck
  let initialQueue: Queue
  let resetCount: number
  let answered: string[]
  let resetFailure: boolean
  let releaseReset: (() => void) | undefined
  let resetGate: Promise<void> | undefined

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        return 400
      },
    })
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return 768
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnMount: false } },
    })
    deck = completedDeck()
    initialQueue = emptyQueue()
    resetCount = 0
    answered = []
    resetFailure = false
    releaseReset = undefined
    resetGate = undefined
    useBenchSurfaceUiState.setState({ flashcardDeckByKey: {} })
    globalThis.fetch = withFetchPreconnect(async (input, init) => {
      const url = new URL(parseRequestUrl(input), "http://localhost")
      const method = input instanceof Request ? input.method : (init?.method ?? "GET")
      if (url.pathname.endsWith("/reset-progress")) {
        resetCount++
        await resetGate
        if (resetFailure)
          return Response.json({ name: "Error", message: "Reset unavailable" }, { status: 500 })
        deck = {
          ...deck,
          cards: deck.cards.map((card) => ({
            ...card,
            state: "new",
            queue: "new",
            due: 0,
            interval: 0,
            easeFactor: 2500,
            reps: 0,
            lapses: 0,
            remainingSteps: 0,
          })),
        }
        return Response.json(deck)
      }
      if (url.pathname.endsWith("/reviews") && method === "POST") {
        const body =
          input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body))
        const answer = ReviewAnswerSchema.parse(body)
        expect(answer.queueLease.reviewMode).toBe("study-again")
        answered.push(answer.cardID)
        deck = {
          ...deck,
          cards: deck.cards.map((card) =>
            card.cardID === answer.cardID
              ? {
                  ...card,
                  state: "review",
                  queue: "review",
                  due: Date.now() + 86_400_000,
                  interval: 4,
                  reps: 1,
                }
              : card,
          ),
        }
        return Response.json({
          cardID: answer.cardID,
          newState: "review",
          newInterval: 4,
          newEaseFactor: 2500,
          nextDue: Date.now() + 86_400_000,
          isLeech: false,
        })
      }
      if (url.pathname.endsWith("/queued-cards")) {
        if (resetCount === 0 || resetFailure) return Response.json(initialQueue)
        const queue = emptyQueue()
        const cards =
          url.searchParams.get("reviewMode") === "study-again"
            ? deck.cards.filter((card) => card.state === "new")
            : []
        if (
          url.searchParams.get("reviewMode") !== "study-again" &&
          deck.cards.some((card) => card.state === "new")
        ) {
          queue.completion.newLimitReached = true
          queue.completion.newHeldBack = deck.cards.filter((card) => card.state === "new").length
        }
        const first = cards[0]
        queue.queuedCardIDs = cards.map((card) => card.cardID)
        queue.cards = first ? [first] : []
        queue.newCount = cards.length
        queue.queueLease = first
          ? { queuedAt: Date.now(), card: first, reviewMode: "study-again" }
          : null
        return Response.json(queue)
      }
      if (url.pathname.endsWith("/deck")) return Response.json(deck)
      if (url.pathname === "/api/objects")
        return Response.json({
          objects: [
            {
              kind: "flashcard-deck",
              objectID: OBJECT_ID,
              title: deck.title,
              status: "ready",
              lifecycle: "live",
              surfaces: ["bench"],
              hasLibraryView: true,
              updatedAt: deck.createdAt,
              sourceRoot: ".buddy/objects/fixture/source",
              filePath: null,
              primaryViewID: "review",
            },
          ],
          loadErrors: [],
        } satisfies ObjectsListResponse)
      throw new Error(`Unexpected fetch: ${method} ${url}`)
    }, originalFetch)
  })

  afterEach(async () => {
    releaseReset?.()
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

  async function render() {
    const route: BenchRouteSnapshot = { status: "open", target: TARGET, mode: "docked" }
    const store = createDirectoryWorkspaceStore({
      directory: DIRECTORY,
      initialState: { docked: createExpandedWorkspaceState(null), hydration: { status: "ready" } },
    })
    const projection = () =>
      effectiveWorkspaceProjection(
        route,
        { docked: store.getState().docked, lastDrawer: store.getState().lastDrawer },
        null,
      )
    const blocker = new DirectoryWorkspaceBlocker({
      directory: DIRECTORY,
      getCurrentRoute: () => route,
      guardLeave: allowBenchLeave,
    })
    const controller = new DirectoryWorkspaceController({
      directory: DIRECTORY,
      store,
      blocker,
      getRoute: () => route,
      navigate: async () => {
        throw new Error("Unexpected route change")
      },
    })
    const lifecycle = new DirectoryWorkspaceLifecycleService({
      directory: DIRECTORY,
      getProjection: projection,
      getTabs: () => [],
      getHydrationStatus: () => "ready",
      getRouteFallbackContext: () => null,
    })
    const workspace = Object.freeze({
      directory: DIRECTORY,
      store,
      blocker,
      controller,
      lifecycle,
      route,
      projection: projection(),
    })
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree: createRootRoute({
        component: () => (
          <ServerProvider
            value={{ url: "", username: null, password: null, isEmbeddedBackend: false }}
          >
            <QueryClientProvider client={client}>
              <DirectoryWorkspaceContext.Provider value={workspace}>
                <BenchRouteContextProvider
                  active={false}
                  visible
                  activeSessionID={undefined}
                  state={{
                    directory: DIRECTORY,
                    target: TARGET,
                    route: "/",
                    mode: "docked",
                    layoutProfile: "practice",
                    floatingRect: { x: 0, y: 0, width: 600, height: 600 },
                    floatingChatState: "open",
                  }}
                  fallbackProvider={{
                    read: () => {
                      throw new Error("Unexpected fallback")
                    },
                  }}
                  setMode={() => undefined}
                  setFloatingChatState={() => undefined}
                >
                  <LauncherHarness deck={deck} />
                </BenchRouteContextProvider>
              </DirectoryWorkspaceContext.Provider>
            </QueryClientProvider>
          </ServerProvider>
        ),
      }),
    })
    await act(async () => {
      await router.load()
      root.render(<RouterProvider router={router} />)
    })
    await waitFor(() => !!button("Deck order fixture"))
  }

  function button(label: string) {
    return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (entry) => entry.textContent?.trim() === label,
    )
  }
  async function click(label: string) {
    const target = button(label)
    if (!target) throw new Error(`Missing action: ${label}`)
    await act(async () => target.click())
  }
  const summary = () => container.querySelector('[data-component="flashcard-session-summary"]')
  const surface = () =>
    readFlashcardDeckSurfaceState(benchSurfaceUiKey({ directory: DIRECTORY, target: TARGET }))

  for (const launcher of ["Deck order fixture", "Open search result"]) {
    test(`opens the completed deck through ${launcher}, dismisses for this visit, and shows it on either reopen`, async () => {
      await render()
      await click(launcher)
      await waitFor(() => !!summary())
      expect(summary()?.textContent).toContain("Study again")
      expect(summary()?.textContent).toContain("All done for now!")
      expect(summary()?.textContent).not.toContain("0 reviewed")
      expect(surface().reviewTally.reviewed).toBe(0)
      await click("Back to deck")
      expect(summary()).toBeNull()
      expect(container.textContent).toContain("All caught up")
      await click(launcher === "Deck order fixture" ? "Open search result" : "Deck order fixture")
      await waitFor(() => !!summary())
      expect(surface().reviewTally.reviewed).toBe(0)
    })
  }

  for (const config of [
    {},
    { newPerDay: 0 },
    { reviewsPerDay: 0 },
    { newPerDay: 0, reviewsPerDay: 0 },
  ]) {
    test(`Study again deals France (deck card 1), drains to summary, and restarts again with ${JSON.stringify(config)}`, async () => {
      deck = completedDeck(config)
      await render()
      await click("Open search result")
      await waitFor(() => !!summary())
      resetGate = new Promise<void>((resolve) => {
        releaseReset = resolve
      })
      const studyAgain = button("Study again")
      if (!studyAgain) throw new Error("Missing Study again")
      await act(async () => {
        studyAgain.click()
        studyAgain.click()
      })
      expect(resetCount).toBe(1)
      await act(async () => {
        releaseReset?.()
      })
      await waitFor(
        () =>
          surface().mode === "review" &&
          !!container.querySelector('[data-component="flashcard-review-stage"]'),
      )
      await waitFor(() => container.textContent?.includes("Card one is Paris") === true)
      expect(surface().mode).toBe("review")
      expect(resetCount).toBe(1)
      for (const cardID of ["card-z", "card-b", "card-a"]) {
        await waitFor(() => !!container.querySelector('[aria-label="Tap the card to reveal"]'))
        const flip = container.querySelector<HTMLElement>('[aria-label="Tap the card to reveal"]')
        if (!flip) throw new Error("Missing card reveal")
        await act(async () => flip.click())
        await waitFor(() => !!button("Easy"))
        await click("Easy")
        await waitFor(() => answered.includes(cardID))
        await waitFor(() =>
          cardID === "card-a" ? !!summary() : !button("Easy") || button("Easy")?.disabled === false,
        )
      }
      await waitFor(() => !!summary())
      expect(answered).toEqual(["card-z", "card-b", "card-a"])
      expect(surface().mode).toBe("done")
      expect(summary()?.textContent).toContain("Study again")
      await click("Back to deck")
      await click("Open search result")
      await waitFor(() => !!summary())
      expect(surface().reviewTally.reviewed).toBe(0)
      await click("Study again")
      await waitFor(
        () =>
          surface().mode === "review" &&
          container.textContent?.includes("Card one is Paris") === true,
      )
      expect(resetCount).toBe(2)
      expect(surface().reviewTally.reviewed).toBe(0)
    })
  }

  test("resumes the uncapped sitting after remount and restores limits on the next explicit open", async () => {
    deck = completedDeck({ newPerDay: 0, reviewsPerDay: 0 })
    await render()
    await click("Open search result")
    await waitFor(() => !!summary())
    await click("Study again")
    await waitFor(() => container.textContent?.includes("Card one is Paris") === true)
    await act(async () => root.unmount())
    root = createRoot(container)
    await render()
    await waitFor(() => container.textContent?.includes("Card one is Paris") === true)
    expect(resetCount).toBe(1)
    expect(surface().mode).toBe("review")
    await click("Open search result")
    await waitFor(() => surface().mode === "deck")
    expect(summary()).toBeNull()
    expect(surface().reviewMode).toBe("scheduled")
  })

  for (const standing of ["due", "learning-wait", "limit-new", "limit-review", "empty"]) {
    test(`keeps ${standing} on the deck page`, async () => {
      if (standing === "empty") deck = { ...deck, cards: [], notes: [] }
      if (standing === "due") {
        initialQueue.newCount = 1
        initialQueue.cards = deck.cards.slice(0, 1)
      }
      if (standing === "learning-wait") {
        initialQueue.completion.learningLaterToday = 1
        initialQueue.completion.nextLearningAt = Date.now() + 3_600_000
      }
      if (standing === "limit-new") {
        initialQueue.completion.newLimitReached = true
        initialQueue.completion.newHeldBack = 1
      }
      if (standing === "limit-review") {
        initialQueue.completion.reviewLimitReached = true
        initialQueue.completion.reviewHeldBack = 1
      }
      await render()
      await click("Open search result")
      expect(summary()).toBeNull()
      expect(surface().mode).toBe("deck")
    })
  }

  test("preserves a failed reset and Retry after eviction, then resets before dealing a card", async () => {
    await render()
    await click("Open search result")
    await waitFor(() => !!summary())
    resetFailure = true
    await click("Study again")
    await waitFor(() => container.textContent?.includes("Reset unavailable") === true)
    expect(surface().mode).toBe("review")
    expect(resetCount).toBe(1)
    resetFailure = false
    await act(async () => root.unmount())
    root = createRoot(container)
    await render()
    await waitFor(
      () => container.textContent?.includes("Reset unavailable") === true && !!button("Retry"),
    )
    expect(surface().mode).toBe("review")
    expect(resetCount).toBe(1)
    await click("Retry")
    await waitFor(() => container.textContent?.includes("Card one is Paris") === true)
    expect(resetCount).toBe(2)
    expect(surface().mode).toBe("review")
  })
})
