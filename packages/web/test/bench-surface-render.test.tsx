import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FlashcardBenchReview } from "../src/components/bench/flashcard-bench-review"
import { BenchRouteContextProvider } from "../src/components/bench/bench-route-context"
import { BenchMediaPreview } from "../src/components/bench/bench-media-preview"
import { QuestionSetBenchReview } from "../src/components/bench/question-set-bench-review"
import { SvgObjectBenchView } from "../src/components/bench/svg-object-bench-view"
import {
  resolveBenchCenteredScroll,
  resolveBenchFitZoom,
  resolveBenchZoomableCanvasMetrics,
} from "../src/components/bench/bench-viewer-shell"
import { HtmlWidgetFrame } from "../src/components/chat/tools/render/html-widget"
import { ServerProvider, type ServerConnection } from "../src/context/server"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_LAYOUT_PROFILE_BALANCED,
} from "../src/lib/bench-navigation"
import type { HtmlWidgetPresentation } from "../src/lib/html-widgets"
import type {
  ObjectFlashcardDeckNextCardResponse,
  ObjectFlashcardDeckReadDeckResponse,
  ObjectQuestionSetReadQuestionsResponse,
} from "@buddy/sdk/types"

const TEST_DIRECTORY = "/repo"
const TEST_DECK_ID = "deck-1"
const TEST_NOTE_ID = "note-1"
const TEST_CARD_ID = "card-1"
const TEST_QUESTION_SET_ID = "object-questions"
const TEST_FLASHCARD_ROUTE = "/repo/_bench/objects/flashcard-deck/deck-1?view=review"
const TEST_QUESTION_SET_ROUTE = "/repo/_bench/objects/question-set/object-questions?view=practice"
const FLUSH_DELAY_MS = 0
const WAIT_FOR_EFFECT_ATTEMPTS = 20
const FLASHCARD_DECK_READ_PATH = `/api/objects/flashcard-deck/${TEST_DECK_ID}?`
const FLASHCARD_DECK_NEXT_CARD_PATH = `/api/objects/flashcard-deck/${TEST_DECK_ID}/next-card`
const TEST_FLOATING_RECT = {
  x: 24,
  y: 24,
  width: 480,
  height: 360,
}

const originalFetch = globalThis.fetch

function createServerConnection(): ServerConnection {
  return {
    url: "",
    username: null,
    password: null,
    isSidecar: false,
  }
}

function TestRouterProvider(props: { children: ReactNode }) {
  const rootRoute = createRootRoute({
    component: () => <>{props.children}</>,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/"],
    }),
  })

  return <RouterProvider router={router} />
}

function TestBenchContextProvider(props: { children: ReactNode }) {
  return (
    <TestRouterProvider>
      <BenchRouteContextProvider
        state={{
          directory: TEST_DIRECTORY,
          target: {
            type: "object",
            ref: {
              kind: "whiteboard",
              objectID: "whiteboard-1",
              revisionID: null,
              itemID: null,
            },
            viewID: "current",
          },
          mode: BENCH_CHAT_LAYOUT_DOCKED,
          layoutProfile: BENCH_LAYOUT_PROFILE_BALANCED,
          dockedChatWidthPx: 480,
          floatingRect: TEST_FLOATING_RECT,
          floatingChatState: "open",
        }}
        activeSessionID={undefined}
        setMode={() => undefined}
        setFloatingChatState={() => undefined}
        fallbackProvider={{
          read: () => ({
            status: "open",
            target: {
              type: "object",
              title: "Test Bench",
              workspaceRoot: TEST_DIRECTORY,
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
    </TestRouterProvider>
  )
}

function createWidget(): HtmlWidgetPresentation {
  return {
    objectID: "widget_1",
    kind: "html-widget",
    title: "Stress Test Widget",
    sourceRoot: ".buddy/objects/v1/html-widget/widget_1/source",
    entryPath: "index.html",
    sourceVersion: "source-version-1",
    viewport: {
      preset: "standard_16_10",
      width: 960,
      height: 600,
      label: "Standard 16:10",
    },
    runtimeUrl: "/api/objects/html-widget/widget_1/runtime?directory=%2Frepo",
  }
}

function createFlashcardDeck(): ObjectFlashcardDeckReadDeckResponse {
  return {
    objectID: TEST_DECK_ID,
    kind: "flashcard-deck",
    title: "Biology Review",
    config: {},
    notes: [
      {
        noteID: TEST_NOTE_ID,
        objectID: TEST_DECK_ID,
        type: "basic",
        fields: {
          front: "What powers the cell?",
          back: "Mitochondria",
        },
      },
    ],
    cards: [
      {
        cardID: TEST_CARD_ID,
        noteID: TEST_NOTE_ID,
        templateIdx: 0,
        state: "new",
        due: 0,
        interval: 0,
        easeFactor: 2500,
        reps: 0,
        lapses: 0,
        remainingSteps: 0,
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: {
      kind: "tool",
      sessionID: "session-1",
      messageID: "message-1",
      callID: "call-1",
      subagent: "flashcard-author",
    },
  }
}

function createRandomizedQuestionSet(): ObjectQuestionSetReadQuestionsResponse {
  return {
    objectID: TEST_QUESTION_SET_ID,
    revisionID: "question-revision-1",
    kind: "question-set",
    title: "Randomized Review",
    groupType: "quiz",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: {
      kind: "tool",
      sessionID: "session-1",
      messageID: "message-1",
      callID: "call-1",
      subagent: "question-set-author",
    },
    questions: [
      {
        id: "question-1",
        type: "mcq",
        prompt: "Pick one.",
        goalIds: [],
        payload: {
          multipleSelect: false,
          randomize: true,
          choices: [
            { id: "a", content: "Choice A" },
            { id: "b", content: "Choice B" },
            { id: "c", content: "Choice C" },
            { id: "d", content: "Choice D" },
          ],
        },
      },
      {
        id: "question-2",
        type: "mcq",
        prompt: "Pick another.",
        goalIds: [],
        payload: {
          multipleSelect: false,
          choices: [
            { id: "a", content: "Second A" },
            { id: "b", content: "Second B" },
          ],
        },
      },
    ],
  }
}

function createNextCardResponse(): ObjectFlashcardDeckNextCardResponse {
  return {
    card: {
      cardID: TEST_CARD_ID,
      noteID: TEST_NOTE_ID,
      templateIdx: 0,
      state: "new",
      due: 0,
      interval: 0,
      easeFactor: 2500,
      reps: 0,
      lapses: 0,
      remainingSteps: 0,
    },
  }
}

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, FLUSH_DELAY_MS)
  })
}

async function waitForEffect(predicate: () => boolean) {
  for (let attempt = 0; attempt < WAIT_FOR_EFFECT_ATTEMPTS; attempt += 1) {
    if (predicate()) return
    await act(async () => {
      await flushEffects()
    })
  }
  throw new Error("Expected effect did not complete")
}

describe("bench surface rendering", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    globalThis.fetch = originalFetch
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("renders HTML widgets as an unscaled full bench iframe", async () => {
    await act(async () => {
      root.render(
        <ServerProvider value={createServerConnection()}>
          <HtmlWidgetFrame widget={createWidget()} mode="bench" />
        </ServerProvider>,
      )
    })

    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()
    expect(iframe?.className).toContain("h-full")
    expect(iframe?.className).toContain("w-full")
    expect(iframe?.getAttribute("style") ?? "").not.toContain("transform")
  })

  test("renders image previews against the full bench surface", async () => {
    await act(async () => {
      root.render(<BenchMediaPreview title="generated/image.png" src="/image.png" renderMode="image" />)
    })

    const image = container.querySelector("img")
    expect(image).not.toBeNull()
    expect(image?.className).toContain("max-h-full")
    expect(image?.className).toContain("max-w-full")
    expect(image?.className).not.toContain("72vh")
    expect(image?.className).not.toContain("72vw")
  })

  test("renders SVG object previews inline in the zoomable bench", async () => {
    await act(async () => {
      root.render(
        <SvgObjectBenchView
          title="Triangle proof"
          subtitle="Generated figure"
          loadSvg={async () =>
            new Blob(
              [
                '<svg viewBox="0 0 320 180"><polygon points="160 20 300 160 20 160" fill="green" /></svg>',
              ],
              { type: "image/svg+xml" },
            )
          }
        />,
      )
      await flushEffects()
    })
    await waitForEffect(
      () => container.querySelector('[data-component="svg-object-bench-surface"] svg') !== null,
    )

    const surface = container.querySelector<HTMLElement>(
      '[data-component="svg-object-bench-surface"]',
    )
    expect(surface).not.toBeNull()
    expect(surface?.className).not.toContain("border")
    expect(surface?.className).not.toContain("bg-white")
    expect(surface?.style.width).toBe("960px")
    expect(surface?.style.height).toBe("540px")
    expect(surface?.querySelector("svg")).not.toBeNull()
    expect(container.querySelector('[data-component="bench-zoom-content"]')).not.toBeNull()
  })

  test("fits zoomable content to the bench viewport with padding", () => {
    const zoom = resolveBenchFitZoom({
      viewportSize: { width: 1_200, height: 900 },
      contentSize: { width: 1_000, height: 500 },
      canvasPadding: 32,
    })

    expect(zoom).toBe(1.136)
  })

  test("keeps zoomable content centered inside a larger pannable canvas", () => {
    const metrics = resolveBenchZoomableCanvasMetrics({
      viewportSize: { width: 1_000, height: 800 },
      contentSize: { width: 400, height: 300 },
      zoom: 2,
      canvasPadding: 32,
      panOverscan: 512,
    })

    expect(metrics).toEqual({
      canvasWidth: 2_024,
      canvasHeight: 1_824,
      contentOffsetX: 612,
      contentOffsetY: 612,
      renderedWidth: 800,
      renderedHeight: 600,
    })
    expect(
      resolveBenchCenteredScroll({
        viewportSize: { width: 1_000, height: 800 },
        metrics,
      }),
    ).toEqual({ left: 512, top: 512 })
  })

  test("uses the loader flashcard deck without re-reading it on mount", async () => {
    const calls: string[] = []
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        calls.push(`${method} ${url}`)

        if (method === "GET" && url.includes(FLASHCARD_DECK_READ_PATH)) {
          return Response.json(createFlashcardDeck())
        }

        if (method === "GET" && url.includes(FLASHCARD_DECK_NEXT_CARD_PATH)) {
          return Response.json(createNextCardResponse())
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    await act(async () => {
      root.render(
        <ServerProvider value={createServerConnection()}>
          <TestBenchContextProvider>
            <QueryClientProvider client={queryClient}>
              <FlashcardBenchReview
                directory={TEST_DIRECTORY}
                objectID={TEST_DECK_ID}
                route={TEST_FLASHCARD_ROUTE}
                deck={createFlashcardDeck()}
              />
            </QueryClientProvider>
          </TestBenchContextProvider>
        </ServerProvider>,
      )
      await flushEffects()
    })
    await waitForEffect(() => calls.some((call) => call.includes(FLASHCARD_DECK_NEXT_CARD_PATH)))

    const readCalls = calls.filter((call) => call.includes(FLASHCARD_DECK_READ_PATH))
    const nextCardCalls = calls.filter((call) => call.includes(FLASHCARD_DECK_NEXT_CARD_PATH))
    const reviewStage = container.querySelector('[data-component="flashcard-review-stage"]')
    const cardFrame = container.querySelector('[data-component="flashcard-review-card-frame"]')

    queryClient.clear()
    expect(readCalls).toEqual([])
    expect(nextCardCalls.length).toBe(1)
    expect(reviewStage).not.toBeNull()
    expect(reviewStage?.className).toContain("flex-1")
    expect(cardFrame).not.toBeNull()
    expect(cardFrame?.className).toContain("min-h-[12rem]")
  })

  test("renders question sets in Bench with wizard and list modes", async () => {
    await act(async () => {
      root.render(
        <TestBenchContextProvider>
          <QuestionSetBenchReview
            directory={TEST_DIRECTORY}
            route={TEST_QUESTION_SET_ROUTE}
            questionSet={createRandomizedQuestionSet()}
            onSubmit={async () => ({
              totalQuestions: 1,
              correctQuestions: 0,
              status: "partial",
              questions: [],
            })}
          />
        </TestBenchContextProvider>,
      )
      await flushEffects()
    })

    const review = container.querySelector<HTMLElement>(
      '[data-component="question-set-bench-review"]',
    )
    expect(review?.dataset.viewMode).toBe("wizard")
    expect(container.textContent).toContain("Pick one.")
    expect(container.textContent).not.toContain("Pick another.")
    expect(container.textContent).toContain("Question 1 of 2")

    const choiceLabels = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ).map((button) => button.textContent?.trim())

    expect(choiceLabels).toEqual(["Choice B", "Choice C", "Choice A", "Choice D"])

    const listButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("List"),
    )
    expect(listButton).not.toBeUndefined()

    await act(async () => {
      listButton?.click()
      await flushEffects()
    })

    expect(review?.dataset.viewMode).toBe("list")
    expect(container.textContent).toContain("Pick one.")
    expect(container.textContent).toContain("Pick another.")
    expect(container.textContent).toContain("Submit Entire Quiz")
  })
})
