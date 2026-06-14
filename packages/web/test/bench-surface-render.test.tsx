import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FlashcardBenchReview } from "../src/components/bench/flashcard-bench-review"
import { BenchMediaPreview } from "../src/components/bench/bench-media-preview"
import { QuestionSetBenchReview } from "../src/components/bench/question-set-bench-review"
import { SvgArtifactBenchView } from "../src/components/bench/svg-artifact-bench-view"
import {
  resolveBenchCenteredScroll,
  resolveBenchFitZoom,
  resolveBenchZoomableCanvasMetrics,
} from "../src/components/bench/bench-viewer-shell"
import { HtmlWidgetFrame } from "../src/components/chat/tools/render/html-widget"
import { ServerProvider, type ServerConnection } from "../src/context/server"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import type { HtmlWidgetToolOutput } from "../src/lib/html-widgets"
import type {
  ArtifactsListResponse,
  FlashcardDeckNextCardResponse,
  FlashcardDeckReadResponse,
} from "@buddy/sdk/types"
import type { PublicQuestionSetArtifact } from "../src/components/chat/tools/render/question-set/question-set-inline-view"

const TEST_DIRECTORY = "/repo"
const TEST_DECK_ID = "deck-1"
const TEST_NOTE_ID = "note-1"
const TEST_CARD_ID = "card-1"
const FLUSH_DELAY_MS = 0
const WAIT_FOR_EFFECT_ATTEMPTS = 20
const FLASHCARD_DECK_READ_PATH = `/api/artifacts/flashcard-deck/${TEST_DECK_ID}?`
const FLASHCARD_DECK_NEXT_CARD_PATH = `/api/artifacts/flashcard-deck/${TEST_DECK_ID}/next-card`

const originalFetch = globalThis.fetch

function createServerConnection(): ServerConnection {
  return {
    url: "",
    username: null,
    password: null,
    isSidecar: false,
  }
}

function createWidget(): HtmlWidgetToolOutput {
  return {
    artifactID: "widget_1",
    kind: "html-widget",
    title: "Stress Test Widget",
    viewport: {
      preset: "standard_16_10",
      width: 960,
      height: 600,
      label: "Standard 16:10",
    },
    runtimeUrl: "/api/artifacts/html-widget/widget_1/runtime?directory=%2Frepo",
    sourceUrl: "/api/artifacts/html-widget/widget_1/source?directory=%2Frepo",
    sourceHash: "hash",
    warnings: [],
  }
}

function createFlashcardDeck(): FlashcardDeckReadResponse {
  return {
    artifactID: TEST_DECK_ID,
    kind: "flashcard-deck",
    title: "Biology Review",
    config: {},
    notes: [
      {
        noteID: TEST_NOTE_ID,
        artifactID: TEST_DECK_ID,
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

function createFlashcardArtifacts(): ArtifactsListResponse {
  return {
    artifacts: [
      {
        artifactID: TEST_DECK_ID,
        kind: "flashcard-deck",
        title: "Biology Review",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        summary: {
          noteCount: 1,
          cardCount: 1,
          dueCounts: {
            new: 1,
            learning: 0,
            review: 0,
          },
          reviewAvailable: true,
        },
      },
    ],
    loadErrors: [],
  }
}

function createRandomizedQuestionSet(): PublicQuestionSetArtifact {
  return {
    artifactID: "artifact-questions",
    title: "Randomized Review",
    groupType: "quiz",
    questions: [
      {
        id: "question-1",
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

function createNextCardResponse(): FlashcardDeckNextCardResponse {
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

  test("renders SVG artifact previews inline in the zoomable bench", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async () => {
        return new Response(
          '<svg viewBox="0 0 320 180"><polygon points="160 20 300 160 20 160" fill="green" /></svg>',
          {
            headers: { "content-type": "image/svg+xml" },
          },
        )
      }),
      originalFetch,
    )

    await act(async () => {
      root.render(
        <ServerProvider value={createServerConnection()}>
          <SvgArtifactBenchView
            title="Triangle proof"
            subtitle="Generated figure"
            rawUrl="/api/artifacts/figure/figure-1/raw?directory=%2Frepo"
          />
        </ServerProvider>,
      )
      await flushEffects()
    })
    await waitForEffect(
      () => container.querySelector('[data-component="svg-artifact-bench-surface"] svg') !== null,
    )

    const surface = container.querySelector<HTMLElement>(
      '[data-component="svg-artifact-bench-surface"]',
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

        if (
          method === "GET" &&
          url.includes("/api/artifacts?") &&
          url.includes("kind=flashcard-deck")
        ) {
          return Response.json(createFlashcardArtifacts())
        }

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
          <QueryClientProvider client={queryClient}>
            <FlashcardBenchReview
              directory={TEST_DIRECTORY}
              artifactID={TEST_DECK_ID}
              deck={createFlashcardDeck()}
            />
          </QueryClientProvider>
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
        <QuestionSetBenchReview
          artifact={createRandomizedQuestionSet()}
          onSubmit={async () => ({
            totalQuestions: 1,
            correctQuestions: 0,
            status: "partial",
            questions: [],
          })}
        />,
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

    expect(choiceLabels).toEqual(["Choice D", "Choice C", "Choice B", "Choice A"])

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
