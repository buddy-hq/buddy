import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { act, useMemo, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FlashcardBenchDeck } from "../src/components/bench/flashcard-bench-deck"
import { FlashcardDeckView } from "../src/components/flashcard/flashcard-deck-view"
import { resolveFlashcardStanding } from "../src/components/flashcard/flashcard-deck-standing"
import {
  BenchRouteContextProvider,
  useRegisterBenchContextProvider,
} from "../src/components/bench/bench-route-context"
import { BenchMediaPreview } from "../src/components/bench/bench-media-preview"
import { DirectoryWorkspaceProvider } from "../src/components/directory-chat/directory-workspace-context"
import { QuestionSetBenchReview } from "../src/components/bench/question-set-bench-review"
import { SvgBenchView } from "../src/components/bench/svg-bench-view"
import {
  BenchSurfaceViewer,
  BenchZoomableViewer,
} from "../src/components/bench/bench-viewer-shell"
import { HtmlWidgetFrame } from "../src/components/chat/tools/render/html-widget"
import { ServerProvider, type ServerConnection } from "../src/context/server"
import { withFetchPreconnect } from "../src/lib/fetch-transport"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_LAYOUT_PROFILE_VISUAL,
  benchTargetKey,
  type BenchTarget,
} from "../src/lib/bench-navigation"
import {
  benchSurfaceUiKey,
  readBenchSurfaceViewport,
  useBenchSurfaceUiState,
  writeFlashcardDeckSurfaceState,
  writeBenchSurfaceViewport,
} from "../src/state/bench-surface-ui-state"
import type { HtmlWidgetPresentation } from "../src/lib/html-widgets"
import {
  DirectoryWorkspaceLifecycleService,
  type BenchSurfaceRegistrationInput,
} from "../src/lib/directory-workspace-lifecycle"
import { useChatStore } from "../src/state/chat-store"
import { createDirectoryChatState } from "./test-utils"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
  ObjectQuestionSetReadQuestionsResponse,
} from "@buddy/sdk/types"
import { parseRequestUrl } from "./parse-test-values"

const TEST_DIRECTORY = "/repo"
const TEST_DECK_ID = "deck-1"
const TEST_NOTE_ID = "note-1"
const TEST_CARD_ID = "card-1"
const TEST_QUESTION_SET_ID = "object-questions"
const TEST_FLASHCARD_TARGET = {
  type: "object",
  ref: {
    kind: "flashcard-deck",
    objectID: TEST_DECK_ID,
    revisionID: null,
    itemID: null,
  },
  viewID: "review",
} satisfies BenchTarget
const TEST_QUESTION_SET_TARGET = {
  type: "object",
  ref: {
    kind: "question-set",
    objectID: TEST_QUESTION_SET_ID,
    revisionID: null,
    itemID: null,
  },
  viewID: "practice",
} satisfies BenchTarget
const FLUSH_DELAY_MS = 0
const WAIT_FOR_EFFECT_ATTEMPTS = 20
const FLASHCARD_DECK_READ_PATH = `/api/objects/flashcard-deck/${TEST_DECK_ID}/deck?`
const FLASHCARD_DECK_QUEUE_PATH = `/api/objects/flashcard-deck/${TEST_DECK_ID}/queued-cards`
const TEST_FLOATING_RECT = {
  x: 24,
  y: 24,
  width: 480,
  height: 360,
}
const TEST_ALPHA_MARKDOWN_TARGET = {
  type: "workspace-file",
  path: "alpha-switch.md",
  viewer: "markdown",
} satisfies BenchTarget
const TEST_BETA_MARKDOWN_TARGET = {
  type: "workspace-file",
  path: "beta-switch.md",
  viewer: "markdown",
} satisfies BenchTarget

const originalFetch = globalThis.fetch

function createServerConnection(): ServerConnection {
  return {
    url: "",
    username: null,
    password: null,
    isEmbeddedBackend: false,
  }
}

let testRouterChildren: ReactNode = null

function TestRouterRoute() {
  return <>{testRouterChildren}</>
}

function TestRouterProvider(props: { children: ReactNode }) {
  testRouterChildren = props.children
  const rootRoute = createRootRoute({
    component: TestRouterRoute,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({
      initialEntries: ["/"],
    }),
  })

  return <RouterProvider router={router} />
}

function TestBenchContextProvider(props: { children: ReactNode; target?: BenchTarget }) {
  const target = props.target ?? {
    type: "object" as const,
    ref: {
      kind: "whiteboard" as const,
      objectID: "whiteboard-1",
      revisionID: null,
      itemID: null,
    },
    viewID: "current",
  }
  return (
    <TestRouterProvider>
      <DirectoryWorkspaceProvider directory={TEST_DIRECTORY}>
        <BenchRouteContextProvider
          active
          state={{
            directory: TEST_DIRECTORY,
            target,
            route: "/test",
            mode: BENCH_CHAT_LAYOUT_DOCKED,
            layoutProfile: BENCH_LAYOUT_PROFILE_VISUAL,
            floatingRect: TEST_FLOATING_RECT,
            floatingChatState: "open",
          }}
          visible={true}
          activeSessionID={undefined}
          setMode={() => undefined}
          setFloatingChatState={() => undefined}
          fallbackProvider={{
            read: () => ({
              status: "open",
              targetKey: benchTargetKey({
                type: "object",
                ref: {
                  kind: "whiteboard",
                  objectID: "whiteboard-1",
                  revisionID: null,
                  itemID: null,
                },
                viewID: "current",
              }),
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
      </DirectoryWorkspaceProvider>
    </TestRouterProvider>
  )
}

function TargetBoundContextProbe(props: { target: BenchTarget; content: string }) {
  const provider = useMemo(
    () => ({
      read: () => ({
        targetStatus: "ready" as const,
        metadata: [],
        content: props.content,
      }),
    }),
    [props.content],
  )
  useRegisterBenchContextProvider({ target: props.target, provider })
  return null
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

function createQueuedCardsResponse(): ObjectFlashcardDeckQueuedCardsResponse {
  return {
    queuedCardIDs: [TEST_CARD_ID],
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
    resolvedConfig: {
      newPerDay: 20,
      reviewsPerDay: 200,
      leechThreshold: 8,
    },
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
}

function createDeferredQueueResponse(nextQueueAt: number): ObjectFlashcardDeckQueuedCardsResponse {
  return {
    queuedCardIDs: [],
    cards: [],
    queueLease: null,
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    resolvedConfig: {
      newPerDay: 20,
      reviewsPerDay: 200,
      leechThreshold: 8,
    },
    completion: {
      nextLearningAt: nextQueueAt,
      nextDueAt: nextQueueAt,
      nextQueueAt,
      newLimitReached: false,
      reviewLimitReached: false,
      newHeldBack: 0,
      reviewHeldBack: 0,
      learningLaterToday: 1,
      returningLater: 0,
      reviewedToday: { newCount: 0, reviewCount: 0 },
    },
  }
}

function createEmptyQueueResponse(): ObjectFlashcardDeckQueuedCardsResponse {
  const queue = createDeferredQueueResponse(0)
  return {
    ...queue,
    completion: {
      ...queue.completion,
      nextLearningAt: null,
      nextDueAt: null,
      nextQueueAt: null,
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
    useBenchSurfaceUiState.setState({ flashcardDeckByKey: {}, viewportByKey: {} })
    useChatStore.setState({ directories: {} })
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

  test("does not register an outgoing surface under the next route target", async () => {
    const registrations: BenchSurfaceRegistrationInput[] = []
    const registerSurface = spyOn(
      DirectoryWorkspaceLifecycleService.prototype,
      "registerSurface",
    ).mockImplementation((input) => {
      registrations.push(input)
      return () => undefined
    })

    try {
      await act(async () => {
        root.render(
          <TestBenchContextProvider target={TEST_ALPHA_MARKDOWN_TARGET}>
            <TargetBoundContextProbe
              target={TEST_ALPHA_MARKDOWN_TARGET}
              content="alpha-token-9944-zzzz"
            />
          </TestBenchContextProvider>,
        )
        await flushEffects()
      })

      expect(registrations.map((registration) => benchTargetKey(registration.target))).toEqual([
        benchTargetKey(TEST_ALPHA_MARKDOWN_TARGET),
      ])

      await act(async () => {
        root.render(
          <TestBenchContextProvider target={TEST_BETA_MARKDOWN_TARGET}>
            <TargetBoundContextProbe
              target={TEST_ALPHA_MARKDOWN_TARGET}
              content="alpha-token-9944-zzzz"
            />
          </TestBenchContextProvider>,
        )
        await flushEffects()
      })

      expect(registrations.map((registration) => benchTargetKey(registration.target))).toEqual([
        benchTargetKey(TEST_ALPHA_MARKDOWN_TARGET),
      ])
    } finally {
      registerSurface.mockRestore()
    }
  })

  test("renders image previews against the full bench surface", async () => {
    await act(async () => {
      root.render(
        <BenchMediaPreview title="generated/image.png" src="/image.png" renderMode="image" />,
      )
    })

    const image = container.querySelector<HTMLImageElement>("img")
    expect(image).not.toBeNull()
    expect(image?.className).toContain("max-h-full")
    expect(image?.className).toContain("max-w-full")
    expect(image?.className).not.toContain("72vh")
    expect(image?.className).not.toContain("72vw")
  })

  test("renders SVG previews as isolated images in the zoomable bench", async () => {
    await act(async () => {
      root.render(
        <SvgBenchView
          title="Triangle proof"
          subtitle="Generated figure"
          src="/api/objects/figure/triangle/raw"
        />,
      )
      await flushEffects()
    })

    const image = container.querySelector<HTMLImageElement>(
      '[data-component="svg-bench-surface"] img',
    )
    expect(image).not.toBeNull()
    if (!image) throw new Error("Expected SVG image")

    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 320 },
      naturalHeight: { configurable: true, value: 180 },
    })
    await act(async () => {
      image.dispatchEvent(new Event("load"))
      await flushEffects()
    })

    const surface = container.querySelector<HTMLElement>('[data-component="svg-bench-surface"]')
    expect(surface).not.toBeNull()
    expect(surface?.className).not.toContain("border")
    expect(surface?.className).not.toContain("bg-white")
    expect(surface?.style.width).toBe("960px")
    expect(surface?.style.height).toBe("540px")
    const visibleImage = surface?.querySelector<HTMLImageElement>("img")
    expect(visibleImage).toBe(image)
    expect(visibleImage?.getAttribute("src")).toBe("/api/objects/figure/triangle/raw")
    expect(surface?.querySelector("svg")).toBeNull()
    const zoomContent = container.querySelector('[data-component="bench-zoom-content"]')
    expect(zoomContent).not.toBeNull()
    expect(zoomContent?.className).not.toContain("transition-transform")
  })

  test("renders zoomable asset surfaces without a top bar and places controls in the bottom dock", async () => {
    await act(async () => {
      root.render(
        <SvgBenchView
          title="Triangle proof"
          subtitle="Generated figure"
          src="/api/objects/figure/triangle/raw"
          actions={[
            {
              label: "Copy SVG",
              dataAction: "copy-svg",
              icon: <span aria-hidden>Copy</span>,
              onClick: () => undefined,
            },
          ]}
        />,
      )
      await flushEffects()
    })

    expect(container.querySelector('[data-component="bench-viewer-shell"] header')).toBeNull()
    expect(
      container.querySelector(
        '[data-component="bench-viewer-shell"] header [data-action="copy-svg"]',
      ),
    ).toBeNull()
    expect(
      container.querySelector('[data-component="bench-control-dock"] [data-action="copy-svg"]'),
    ).not.toBeNull()
    expect(
      container.querySelector(
        '[data-component="bench-control-dock"] [data-action="bench-zoom-in"]',
      ),
    ).not.toBeNull()
  })

  test("places expanded controls in a separate row above the minimal dock", async () => {
    await act(async () => {
      root.render(
        <BenchSurfaceViewer
          title="Document"
          hideHeader
          controlsPlacement="dock"
          toolbar={<button type="button">Minimal</button>}
          dockPanel={<div data-testid="advanced-tools">Advanced</div>}
        >
          <div>Document</div>
        </BenchSurfaceViewer>,
      )
      await flushEffects()
    })

    const panel = container.querySelector('[data-component="bench-control-dock-panel"]')
    const dock = container.querySelector('[data-component="bench-control-dock"]')
    expect(panel?.querySelector('[data-testid="advanced-tools"]')).not.toBeNull()
    expect(panel?.compareDocumentPosition(dock ?? document.body)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  test("renders immersive HTML bench surfaces without header or dock overlays", async () => {
    await act(async () => {
      root.render(
        <BenchSurfaceViewer
          title="HTML widget"
          subtitle="standard"
          hideHeader
          surfaceClassName="bg-background-base"
        >
          <iframe
            title="HTML widget"
            src="/widget"
            sandbox=""
            className="block h-full w-full border-0"
          />
        </BenchSurfaceViewer>,
      )
      await flushEffects()
    })

    expect(container.querySelector('[data-component="bench-viewer-shell"] header')).toBeNull()
    expect(container.querySelector('[data-component="bench-control-dock"]')).toBeNull()
  })

  test("animates only explicit user zoom changes in the zoomable bench", async () => {
    await act(async () => {
      root.render(
        <BenchZoomableViewer title="Measured asset" fitContent>
          <div>Asset</div>
        </BenchZoomableViewer>,
      )
      await flushEffects()
    })

    const zoomContent = container.querySelector<HTMLElement>(
      '[data-component="bench-zoom-content"]',
    )
    expect(zoomContent).not.toBeNull()
    expect(zoomContent?.className).not.toContain("transition-transform")

    const zoomIn = container.querySelector<HTMLButtonElement>('[data-action="bench-zoom-in"]')
    expect(zoomIn).not.toBeNull()
    await act(async () => {
      zoomIn?.click()
      await flushEffects()
    })

    expect(zoomContent?.className).toContain("transition-transform")
  })

  test("derives auto-fit metrics and centering from the same measured layout", async () => {
    const originalResizeObserver = globalThis.ResizeObserver
    Reflect.deleteProperty(globalThis, "ResizeObserver")

    try {
      await act(async () => {
        root.render(
          <BenchZoomableViewer title="Measured asset" fitContent>
            <div>Asset</div>
          </BenchZoomableViewer>,
        )
        await flushEffects()
      })

      const viewport = container.querySelector<HTMLElement>(
        '[data-component="bench-pan-zoom-canvas"]',
      )
      const content = container.querySelector<HTMLElement>('[data-component="bench-zoom-content"]')
      expect(viewport).not.toBeNull()
      expect(content).not.toBeNull()
      if (!viewport || !content) throw new Error("Expected zoomable Bench elements")

      Object.defineProperties(viewport, {
        clientWidth: { configurable: true, value: 1_200 },
        clientHeight: { configurable: true, value: 900 },
      })
      Object.defineProperties(content, {
        offsetWidth: { configurable: true, value: 1_000 },
        offsetHeight: { configurable: true, value: 500 },
      })

      await act(async () => {
        window.dispatchEvent(new Event("resize"))
        await flushEffects()
      })

      expect(container.querySelector('[data-component="bench-zoom-label"]')?.textContent).toBe(
        "114%",
      )
      expect(viewport.scrollLeft).toBe(512)
      expect(viewport.scrollTop).toBe(512)
    } finally {
      if (originalResizeObserver) {
        globalThis.ResizeObserver = originalResizeObserver
      }
    }
  })

  test("restores a manual zoom and pan after a zoomable surface is evicted", async () => {
    const viewportKey = "zoomable-surface"
    writeBenchSurfaceViewport(viewportKey, {
      zoom: 1.5,
      autoFit: false,
      panX: 140,
      panY: 220,
    })
    const originalResizeObserver = globalThis.ResizeObserver
    Reflect.deleteProperty(globalThis, "ResizeObserver")

    try {
      await act(async () => {
        root.render(
          <BenchZoomableViewer title="Restored asset" fitContent viewportKey={viewportKey}>
            <div>Asset</div>
          </BenchZoomableViewer>,
        )
        await flushEffects()
      })

      const viewport = container.querySelector<HTMLElement>(
        '[data-component="bench-pan-zoom-canvas"]',
      )
      const content = container.querySelector<HTMLElement>('[data-component="bench-zoom-content"]')
      if (!viewport || !content) throw new Error("Expected zoomable Bench elements")

      Object.defineProperties(viewport, {
        clientWidth: { configurable: true, value: 1_200 },
        clientHeight: { configurable: true, value: 900 },
      })
      Object.defineProperties(content, {
        offsetWidth: { configurable: true, value: 1_000 },
        offsetHeight: { configurable: true, value: 500 },
      })

      await act(async () => {
        window.dispatchEvent(new Event("resize"))
        await flushEffects()
      })

      expect(container.querySelector('[data-component="bench-zoom-label"]')?.textContent).toBe(
        "150%",
      )
      expect(viewport.scrollLeft).toBe(140)
      expect(viewport.scrollTop).toBe(220)
    } finally {
      if (originalResizeObserver) {
        globalThis.ResizeObserver = originalResizeObserver
      }
    }
  })

  test("captures zoomable pan before the surface DOM is removed", async () => {
    const viewportKey = "evicted-zoomable-surface"

    await act(async () => {
      root.render(
        <BenchZoomableViewer title="Evicted asset" viewportKey={viewportKey}>
          <div>Asset</div>
        </BenchZoomableViewer>,
      )
      await flushEffects()
    })

    const viewport = container.querySelector<HTMLElement>(
      '[data-component="bench-pan-zoom-canvas"]',
    )
    if (!viewport) throw new Error("Expected zoomable Bench viewport")
    viewport.scrollLeft = 75
    viewport.scrollTop = 125

    await act(async () => {
      root.render(<div />)
      await flushEffects()
    })

    expect(readBenchSurfaceViewport(viewportKey)).toMatchObject({
      panX: 75,
      panY: 125,
      autoFit: false,
    })
  })

  test("uses the loader flashcard deck without re-reading it on mount", async () => {
    const calls: string[] = []
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")
        calls.push(`${method} ${url}`)

        if (method === "GET" && url.includes(FLASHCARD_DECK_READ_PATH)) {
          return Response.json(createFlashcardDeck())
        }

        if (method === "GET" && url.includes(FLASHCARD_DECK_QUEUE_PATH)) {
          return Response.json(createQueuedCardsResponse())
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
    writeFlashcardDeckSurfaceState(
      benchSurfaceUiKey({ directory: TEST_DIRECTORY, target: TEST_FLASHCARD_TARGET }),
      { mode: "review" },
    )

    await act(async () => {
      root.render(
        <ServerProvider value={createServerConnection()}>
          <TestBenchContextProvider>
            <QueryClientProvider client={queryClient}>
              <FlashcardBenchDeck
                directory={TEST_DIRECTORY}
                objectID={TEST_DECK_ID}
                target={TEST_FLASHCARD_TARGET}
                deck={createFlashcardDeck()}
              />
            </QueryClientProvider>
          </TestBenchContextProvider>
        </ServerProvider>,
      )
      await flushEffects()
    })
    await waitForEffect(() => calls.some((call) => call.includes(FLASHCARD_DECK_QUEUE_PATH)))

    const readCalls = calls.filter((call) => call.includes(FLASHCARD_DECK_READ_PATH))
    const queueCalls = calls.filter((call) => call.includes(FLASHCARD_DECK_QUEUE_PATH))
    const shell = container.querySelector<HTMLElement>('[data-component="bench-viewer-shell"]')
    const reviewStage = container.querySelector('[data-component="flashcard-review-stage"]')
    const cardFrame = container.querySelector('[data-component="flashcard-review-card-frame"]')
    const reviewHeader = container.querySelector('[data-component="flashcard-review-header"]')

    queryClient.clear()
    expect(readCalls).toEqual([])
    expect(queueCalls.length).toBe(1)
    expect(calls.some((call) => call.includes("/api/objects?"))).toBe(false)
    expect(Array.from(shell?.children ?? []).some((child) => child.tagName === "HEADER")).toBe(
      false,
    )
    expect(reviewHeader?.textContent).toContain("Biology Review")
    expect(reviewStage).not.toBeNull()
    expect(cardFrame).not.toBeNull()
    // The card is dealt from the loader's deck, so its front is on screen.
    expect(container.textContent).toContain("What powers the cell?")
  })

  test("publishes the authoritative absolute flashcard edit path without a revision path", async () => {
    const registrations: BenchSurfaceRegistrationInput[] = []
    const registerSurface = spyOn(
      DirectoryWorkspaceLifecycleService.prototype,
      "registerSurface",
    ).mockImplementation((input) => {
      registrations.push(input)
      return () => undefined
    })
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (method === "GET" && url.includes(FLASHCARD_DECK_QUEUE_PATH)) {
          return Response.json(createQueuedCardsResponse())
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    try {
      await act(async () => {
        root.render(
          <ServerProvider value={createServerConnection()}>
            <TestBenchContextProvider target={TEST_FLASHCARD_TARGET}>
              <QueryClientProvider client={queryClient}>
                <FlashcardBenchDeck
                  directory={TEST_DIRECTORY}
                  objectID={TEST_DECK_ID}
                  target={TEST_FLASHCARD_TARGET}
                  deck={createFlashcardDeck()}
                />
              </QueryClientProvider>
            </TestBenchContextProvider>
          </ServerProvider>,
        )
        await flushEffects()
      })
      await waitForEffect(() => registrations.length > 0)

      const context = registrations.at(-1)?.getSnapshot().context
      const editPath = `${TEST_DIRECTORY}/.buddy/objects/v1/flashcard-deck/${TEST_DECK_ID}/state/deck.json`

      expect(context?.metadata[0]).toBe(`edit_path: ${editPath}`)
      expect(context?.content).toContain(`Edit path: ${editPath}`)
      expect(context?.refs).toContainEqual({
        kind: "file",
        value: editPath,
        note: "Authoritative flashcard deck state for minor text edits.",
      })
      expect(context?.hints.join("\n")).toContain("edit only notes[].fields text")
      expect(context?.metadata.join("\n")).not.toContain("/revisions/")
    } finally {
      queryClient.clear()
      registerSurface.mockRestore()
    }
  })

  test("refreshes an open flashcard deck after the agent turn becomes idle", async () => {
    const updatedDeck = createFlashcardDeck()
    updatedDeck.notes[0] = {
      ...updatedDeck.notes[0],
      fields: {
        front: "What is the powerhouse of the cell?",
        back: "Mitochondria",
      },
    }
    let readCalls = 0
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (method === "GET" && url.includes(FLASHCARD_DECK_READ_PATH)) {
          readCalls++
          return Response.json(updatedDeck)
        }
        if (method === "GET" && url.includes(FLASHCARD_DECK_QUEUE_PATH)) {
          return Response.json(createQueuedCardsResponse())
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )
    useChatStore.setState({
      directories: {
        [TEST_DIRECTORY]: createDirectoryChatState({ isBusy: true }),
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await act(async () => {
      root.render(
        <ServerProvider value={createServerConnection()}>
          <TestBenchContextProvider>
            <QueryClientProvider client={queryClient}>
              <FlashcardBenchDeck
                directory={TEST_DIRECTORY}
                objectID={TEST_DECK_ID}
                target={TEST_FLASHCARD_TARGET}
                deck={createFlashcardDeck()}
              />
            </QueryClientProvider>
          </TestBenchContextProvider>
        </ServerProvider>,
      )
      await flushEffects()
    })

    expect(readCalls).toBe(0)
    expect(container.textContent).toContain("What powers the cell?")

    await act(async () => {
      useChatStore.setState({
        directories: {
          [TEST_DIRECTORY]: createDirectoryChatState({ isBusy: false }),
        },
      })
      await flushEffects()
    })
    await waitForEffect(() => readCalls === 1)
    await waitForEffect(
      () => container.textContent?.includes("What is the powerhouse of the cell?") === true,
    )

    queryClient.clear()
    expect(container.textContent).not.toContain("What powers the cell?")
  })

  test("restores a completed review tally after the Bench surface remounts", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (method === "GET" && url.includes(FLASHCARD_DECK_QUEUE_PATH)) {
          return Response.json(createEmptyQueueResponse())
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    writeFlashcardDeckSurfaceState(
      benchSurfaceUiKey({ directory: TEST_DIRECTORY, target: TEST_FLASHCARD_TARGET }),
      {
        mode: "done",
        reviewTally: {
          reviewed: 3,
          elapsedMs: 4500,
          ratings: { again: 1, hard: 0, good: 2, easy: 0 },
        },
      },
    )

    await act(async () => {
      root.render(
        <ServerProvider value={createServerConnection()}>
          <TestBenchContextProvider>
            <QueryClientProvider client={queryClient}>
              <FlashcardBenchDeck
                directory={TEST_DIRECTORY}
                objectID={TEST_DECK_ID}
                target={TEST_FLASHCARD_TARGET}
                deck={createFlashcardDeck()}
              />
            </QueryClientProvider>
          </TestBenchContextProvider>
        </ServerProvider>,
      )
      await flushEffects()
    })
    await waitForEffect(
      () => container.querySelector('[data-component="flashcard-session-summary"]') !== null,
    )

    expect(container.textContent).toContain("3 reviewed in")
    expect(container.textContent).toContain("1 Again · 2 Good")
  })

  test("uses the complete scheduled ID set for the deck Due filter", async () => {
    const secondNoteID = "note-2"
    const secondCardID = "card-2"
    const baseDeck = createFlashcardDeck()
    const deck: ObjectFlashcardDeckReadDeckResponse = {
      ...baseDeck,
      notes: [
        ...baseDeck.notes,
        {
          noteID: secondNoteID,
          objectID: TEST_DECK_ID,
          type: "basic",
          fields: { front: "What captures light energy?", back: "Chlorophyll" },
        },
      ],
      cards: [
        ...baseDeck.cards,
        {
          cardID: secondCardID,
          noteID: secondNoteID,
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
    }
    const queue: ObjectFlashcardDeckQueuedCardsResponse = {
      ...createQueuedCardsResponse(),
      queuedCardIDs: [TEST_CARD_ID, secondCardID],
      newCount: 2,
    }

    await act(async () => {
      root.render(
        <FlashcardDeckView
          deck={deck}
          queue={queue}
          standing={resolveFlashcardStanding({ deck, queue, now: Date.now() })}
          peekCardID={undefined}
          onPeek={() => {}}
          onAction={() => {}}
        />,
      )
      await flushEffects()
    })

    const dueFilter = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Due",
    )
    await act(async () => {
      dueFilter?.click()
      await flushEffects()
    })

    expect(container.textContent).toContain("What powers the cell?")
    expect(container.textContent).toContain("What captures light energy?")
  })

  test("refreshes an open scheduled deck when the backend queue says to check again", async () => {
    let queueCalls = 0
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (method === "GET" && url.includes(FLASHCARD_DECK_QUEUE_PATH)) {
          queueCalls++
          return Response.json(
            queueCalls === 1
              ? createDeferredQueueResponse(Date.now() + 10)
              : createQueuedCardsResponse(),
          )
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
              <FlashcardBenchDeck
                directory={TEST_DIRECTORY}
                objectID={TEST_DECK_ID}
                target={TEST_FLASHCARD_TARGET}
                deck={createFlashcardDeck()}
              />
            </QueryClientProvider>
          </TestBenchContextProvider>
        </ServerProvider>,
      )
      await flushEffects()
    })
    expect(container.textContent).toContain("Next card in a moment")
    expect(
      Array.from(
        container.querySelector<HTMLElement>('[data-component="bench-viewer-shell"]')?.children ??
          [],
      ).some((child) => child.tagName === "HEADER"),
    ).toBe(false)

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 300))
      await flushEffects()
    })

    queryClient.clear()
    expect(queueCalls).toBe(2)
    expect(container.textContent).toContain("New deck")
    expect(container.textContent).toContain("Start studying")
    expect(container.textContent).toContain("What powers the cell?")
  })

  test("renders off-schedule practice as the Easel card stage without rating controls", async () => {
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (method === "GET" && url.includes(FLASHCARD_DECK_QUEUE_PATH)) {
          return Response.json(createQueuedCardsResponse())
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const surfaceKey = benchSurfaceUiKey({
      directory: TEST_DIRECTORY,
      target: TEST_FLASHCARD_TARGET,
    })
    writeFlashcardDeckSurfaceState(surfaceKey, {
      mode: "practice",
      practiceIndex: 0,
      practiceRevealed: false,
    })

    await act(async () => {
      root.render(
        <ServerProvider value={createServerConnection()}>
          <TestBenchContextProvider>
            <QueryClientProvider client={queryClient}>
              <FlashcardBenchDeck
                directory={TEST_DIRECTORY}
                objectID={TEST_DECK_ID}
                target={TEST_FLASHCARD_TARGET}
                deck={createFlashcardDeck()}
              />
            </QueryClientProvider>
          </TestBenchContextProvider>
        </ServerProvider>,
      )
      await flushEffects()
    })

    const cardGroup = container.querySelector<HTMLElement>(
      '[data-component="flashcard-practice-card-group"]',
    )
    const shell = container.querySelector<HTMLElement>('[data-component="bench-viewer-shell"]')
    const practiceHeader = container.querySelector('[data-component="flashcard-practice-header"]')
    expect(Array.from(shell?.children ?? []).some((child) => child.tagName === "HEADER")).toBe(
      false,
    )
    expect(practiceHeader?.textContent).toContain("Biology Review")
    expect(container.querySelector('[data-component="flashcard-practice-stage"]')).not.toBeNull()
    expect(
      container.querySelector('[data-component="flashcard-practice-card-frame"]'),
    ).not.toBeNull()
    expect(cardGroup?.style.maxWidth).toBe("560px")
    expect(cardGroup?.style.maxHeight).toBe("467px")
    expect(container.textContent).toContain("Off schedule")
    expect(container.textContent).toContain("Nothing here is rated")
    expect(container.textContent).toContain("Show answer")
    expect(container.textContent).toContain("Next card")
    expect(container.textContent).not.toContain("Again")
    expect(container.textContent).not.toContain("Hard")
    expect(container.textContent).not.toContain("Good")
    expect(container.textContent).not.toContain("Easy")

    queryClient.clear()
  })

  test("publishes the actual practice card and reveal state without exposing a hidden answer", async () => {
    const registrations: BenchSurfaceRegistrationInput[] = []
    const registerSurface = spyOn(
      DirectoryWorkspaceLifecycleService.prototype,
      "registerSurface",
    ).mockImplementation((input) => {
      registrations.push(input)
      return () => undefined
    })
    globalThis.fetch = withFetchPreconnect(
      mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          parseRequestUrl(input)
        const method = input instanceof Request ? input.method : (init?.method ?? "GET")

        if (method === "GET" && url.includes(FLASHCARD_DECK_QUEUE_PATH)) {
          return Response.json(createQueuedCardsResponse())
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`)
      }),
      originalFetch,
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    writeFlashcardDeckSurfaceState(
      benchSurfaceUiKey({ directory: TEST_DIRECTORY, target: TEST_FLASHCARD_TARGET }),
      { mode: "practice", practiceIndex: 0, practiceRevealed: false },
    )

    try {
      await act(async () => {
        root.render(
          <ServerProvider value={createServerConnection()}>
            <TestBenchContextProvider target={TEST_FLASHCARD_TARGET}>
              <QueryClientProvider client={queryClient}>
                <FlashcardBenchDeck
                  directory={TEST_DIRECTORY}
                  objectID={TEST_DECK_ID}
                  target={TEST_FLASHCARD_TARGET}
                  deck={createFlashcardDeck()}
                />
              </QueryClientProvider>
            </TestBenchContextProvider>
          </ServerProvider>,
        )
        await flushEffects()
      })
      await waitForEffect(() => registrations.length > 0)

      const context = registrations.at(-1)?.getSnapshot().context
      expect(context?.metadata).toContain("deck_mode: practice")
      expect(context?.metadata).toContain("revealed: false")
      expect(context?.metadata).toContain(`card_id: ${TEST_CARD_ID}`)
      expect(context?.content).toContain("Flashcard practice: Biology Review")
      expect(context?.content).toContain("Front:\nWhat powers the cell?")
      expect(context?.content).toContain("Back: hidden until revealed")
      expect(context?.content).not.toContain("Mitochondria")
    } finally {
      queryClient.clear()
      registerSurface.mockRestore()
    }
  })

  test("renders question sets in Bench with wizard and list modes", async () => {
    await act(async () => {
      root.render(
        <TestBenchContextProvider>
          <QuestionSetBenchReview
            directory={TEST_DIRECTORY}
            target={TEST_QUESTION_SET_TARGET}
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

  test("publishes the current question-set revision as an absolute content-only edit path", async () => {
    const registrations: BenchSurfaceRegistrationInput[] = []
    const registerSurface = spyOn(
      DirectoryWorkspaceLifecycleService.prototype,
      "registerSurface",
    ).mockImplementation((input) => {
      registrations.push(input)
      return () => undefined
    })

    try {
      await act(async () => {
        root.render(
          <TestBenchContextProvider target={TEST_QUESTION_SET_TARGET}>
            <QuestionSetBenchReview
              directory={TEST_DIRECTORY}
              target={TEST_QUESTION_SET_TARGET}
              questionSet={createRandomizedQuestionSet()}
              onSubmit={async () => ({
                totalQuestions: 2,
                correctQuestions: 0,
                status: "partial",
                questions: [],
              })}
            />
          </TestBenchContextProvider>,
        )
        await flushEffects()
      })
      await waitForEffect(() => registrations.length > 0)

      const editPath = `${TEST_DIRECTORY}/.buddy/objects/v1/question-set/${TEST_QUESTION_SET_ID}/revisions/question-revision-1/question-set.json`
      const context = registrations.at(-1)?.getSnapshot().context

      expect(context?.metadata[0]).toBe(`edit_path: ${editPath}`)
      expect(context?.content).toContain(`Edit path: ${editPath}`)
      expect(context?.refs).toContainEqual({
        kind: "file",
        value: editPath,
        note: "Authoritative question-set payload for minor text edits.",
      })
      expect(context?.hints.join("\n")).toContain("questions[].payload.choices[].content")
      expect(context?.hints.join("\n")).toContain("Preserve object, revision, question")
    } finally {
      registerSurface.mockRestore()
    }
  })

  test("rotates the Bench question-set submission key only after an answer changes", async () => {
    const submissionIDs: string[] = []
    await act(async () => {
      root.render(
        <TestBenchContextProvider>
          <QuestionSetBenchReview
            directory={TEST_DIRECTORY}
            target={TEST_QUESTION_SET_TARGET}
            questionSet={createRandomizedQuestionSet()}
            onSubmit={async (_answers, submissionID) => {
              submissionIDs.push(submissionID)
              throw new Error("Ambiguous network failure")
            }}
          />
        </TestBenchContextProvider>,
      )
      await flushEffects()
    })

    const findButton = (label: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
        button.textContent?.includes(label),
      )
    const firstChoice = findButton("Choice A")
    const listButton = findButton("List")
    if (!firstChoice || !listButton) throw new Error("Expected question-set controls.")

    await act(async () => {
      firstChoice.click()
      listButton.click()
      await flushEffects()
    })

    const submitButton = findButton("Submit Entire Quiz")
    if (!submitButton) throw new Error("Expected the question-set submit button.")
    await act(async () => {
      submitButton.click()
      await flushEffects()
    })
    await act(async () => {
      submitButton.click()
      await flushEffects()
    })
    expect(submissionIDs).toHaveLength(2)
    expect(submissionIDs[1]).toBe(submissionIDs[0])

    const changedChoice = findButton("Choice C")
    if (!changedChoice) throw new Error("Expected an alternate question-set choice.")
    await act(async () => {
      changedChoice.click()
      submitButton.click()
      await flushEffects()
    })
    expect(submissionIDs).toHaveLength(3)
    expect(submissionIDs[2]).not.toBe(submissionIDs[1])
  })
})
