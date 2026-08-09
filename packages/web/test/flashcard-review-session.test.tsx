import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useFlashcardReviewSession } from "../src/components/flashcard/flashcard-review-session"
import { ServerProvider, type ServerConnection } from "../src/context/server"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
} from "@buddy/sdk/types"

const TEST_DIRECTORY = "/repo"
const TEST_DECK_ID = "deck-1"
const TEST_NOTE_ID = "note-1"
const TEST_CARD_ID = "card-1"
const WAIT_ATTEMPTS = 20
const originalFetch = globalThis.fetch

const DECK: ObjectFlashcardDeckReadDeckResponse = {
  objectID: TEST_DECK_ID,
  kind: "flashcard-deck",
  title: "Biology",
  config: {},
  notes: [
    {
      noteID: TEST_NOTE_ID,
      objectID: TEST_DECK_ID,
      type: "basic",
      fields: { front: "Question", back: "Answer" },
    },
  ],
  cards: [
    {
      cardID: TEST_CARD_ID,
      noteID: TEST_NOTE_ID,
      templateIdx: 0,
      state: "new",
      queue: "new",
      due: 0,
      interval: 0,
      easeFactor: 2500,
      reps: 0,
      lapses: 0,
      remainingSteps: 0,
    },
  ],
  createdAt: "2026-08-09T00:00:00.000Z",
  createdBy: { kind: "app", reason: "test" },
}

const QUEUE: ObjectFlashcardDeckQueuedCardsResponse = {
  queuedCardIDs: [TEST_CARD_ID],
  cards: DECK.cards,
  queueLease: {
    queuedAt: 0,
    card: {
      cardID: TEST_CARD_ID,
      state: "new",
      queue: "new",
      due: 0,
      interval: 0,
      easeFactor: 2500,
      reps: 0,
      lapses: 0,
      remainingSteps: 0,
    },
  },
  newCount: 1,
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

function createServerConnection(): ServerConnection {
  return {
    url: "",
    username: null,
    password: null,
    isEmbeddedBackend: false,
  }
}

function SessionHarness() {
  const session = useFlashcardReviewSession({
    directory: TEST_DIRECTORY,
    objectID: TEST_DECK_ID,
    initialDeck: DECK,
    initialTally: {
      reviewed: 3,
      elapsedMs: 4500,
      ratings: { again: 1, hard: 0, good: 2, easy: 0 },
    },
  })

  return (
    <>
      <span data-testid="session-state">
        {session.phase.kind}:{session.cardsReviewed}
      </span>
      <button type="button" onClick={() => session.restart(DECK)}>
        Restart
      </button>
    </>
  )
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
    if (check()) return
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error("Timed out waiting for review session state")
}

describe("flashcard review session", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(async () => {
    globalThis.fetch = originalFetch
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("starts a fresh tally and reloads the deck without remounting", async () => {
    let queueCalls = 0
    let deckCalls = 0
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        if (method === "GET" && url.includes("/queued-cards")) {
          queueCalls++
          return Response.json(QUEUE)
        }
        if (method === "GET" && url.includes("/deck")) {
          deckCalls++
          return Response.json(DECK)
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    await act(async () => {
      root.render(
        <ServerProvider value={createServerConnection()}>
          <QueryClientProvider client={queryClient}>
            <SessionHarness />
          </QueryClientProvider>
        </ServerProvider>,
      )
    })
    await waitFor(() => container.textContent?.includes("card:3") === true)

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")?.click()
    })
    await waitFor(() => container.textContent?.includes("card:0") === true)

    expect(queueCalls).toBe(2)
    expect(deckCalls).toBe(1)
  })
})
