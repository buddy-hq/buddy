import "../happydom"
import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ObjectWhiteboardObjectReadResponse } from "@buddy/sdk/types"
import { PlatformProvider, type Platform } from "../src/context/platform"
import { WhiteboardPane } from "../src/components/whiteboard/whiteboard-pane"
import { whiteboardQueryKeys } from "../src/components/whiteboard/whiteboard-query"
import { WHITEBOARD_PRESENTATION_MAX_FRAMES } from "../src/components/whiteboard/whiteboard-presentation"
import type { MessageWithParts } from "../src/state/chat-types"
import {
  applyTranscriptMessageUpdated,
  applyTranscriptPartDelta,
  applyTranscriptPartUpdated,
  getTranscriptMessages,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"
import type { WhiteboardLearnerSaveHandler } from "../src/components/whiteboard/whiteboard-learner-save"
import { createFetchStub } from "./test-utils"

type MockElement = {
  id: string
  type: string
  version: number
  isDeleted: boolean
  width?: number
  height?: number
}

type MockSceneUpdate = {
  elements?: MockElement[]
}

type MockExcalidrawAPI = {
  getSceneElements: () => MockElement[]
  getSceneElementsIncludingDeleted: () => MockElement[]
  getAppState: () => {
    scrollX: number
    scrollY: number
    width: number
    height: number
    zoom: { value: number }
  }
  updateScene: (update: MockSceneUpdate) => void
  refresh: () => void
}

type MockExcalidrawProps = {
  excalidrawAPI?: (api: MockExcalidrawAPI) => void
  viewModeEnabled?: boolean
  initialData: {
    elements: MockElement[]
  }
  children?: ReactNode
}

let activeSceneElements: MockElement[] = []
let refreshCount = 0
let measuredTextWidth = 48

const CANVAS_FALLBACK_SETTLE_WAIT_MS = 450
const noOp: () => void = () => undefined

function MockExcalidraw(props: MockExcalidrawProps) {
  const { excalidrawAPI } = props
  const [renderedElements, setRenderedElements] = useState(props.initialData.elements)
  const apiRef = useRef<MockExcalidrawAPI>()
  if (!apiRef.current) {
    activeSceneElements = [...props.initialData.elements]
    apiRef.current = {
      getSceneElements: () => activeSceneElements,
      getSceneElementsIncludingDeleted: () => activeSceneElements,
      getAppState: () => ({
        scrollX: 0,
        scrollY: 0,
        width: 1_000,
        height: 800,
        zoom: { value: 1 },
      }),
      updateScene: (update) => {
        if (update.elements) {
          activeSceneElements = [...update.elements]
          setRenderedElements(activeSceneElements)
        }
      },
      refresh: () => {
        refreshCount += 1
      },
    }
  }
  const api = apiRef.current
  useLayoutEffect(() => {
    excalidrawAPI?.(api)
  }, [api, excalidrawAPI])
  return (
    <div data-component="mock-excalidraw" data-read-only={props.viewModeEnabled ? "true" : "false"}>
      <output>{renderedElements.map((element) => element.id).join(",")}</output>
      {props.children}
    </div>
  )
}

mock.module("@excalidraw/excalidraw/index.css", () => ({}))
mock.module("lottie-react", () => ({ default: () => null }))

mock.module("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "never" },
  Excalidraw: MockExcalidraw,
  FONT_FAMILY: { Excalifont: 1 },
  Footer: (props: { children?: ReactNode }) => props.children,
  convertToExcalidrawElements: (elements: MockElement[]) =>
    elements.map((element) => ({ ...element, version: element.version ?? 1, isDeleted: false })),
  getCommonBounds: () => [0, 0, 0, 0],
  restore: (
    scene: { elements: MockElement[] },
    _appState: null,
    _localElements: null,
    options?: { repairBindings?: boolean; refreshDimensions?: boolean },
  ) => ({
    elements: scene.elements.map((element) =>
      element.type === "text" && options?.repairBindings && options.refreshDimensions
        ? { ...element, width: measuredTextWidth, height: 24 }
        : element,
    ),
  }),
  zoomToFitBounds: () => ({ appState: { zoom: { value: 1 } } }),
}))

mock.module("@/theme", () => ({
  useTheme: () => ({ mode: "dark" }),
}))

mock.module("@/components/directory-chat/directory-workspace-context", () => ({
  useDirectoryWorkspaceOptional: () => undefined,
}))

type TWhiteboardPreferencesSlice = {
  panelPlacement: "bottom"
  togglePanelPlacement: () => void
}

function selectWhiteboardPreference<TValue>(
  selector: (state: TWhiteboardPreferencesSlice) => TValue,
) {
  return selector({ panelPlacement: "bottom", togglePanelPlacement: () => undefined })
}

mock.module("@/state/whiteboard-preferences", () => ({
  useWhiteboardPreferences: selectWhiteboardPreference,
}))

type WhiteboardCanvasModule = typeof import("../src/components/whiteboard/whiteboard-canvas")

const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
const originalDocumentFontsDescriptor = Object.getOwnPropertyDescriptor(document, "fonts")

let module: WhiteboardCanvasModule | undefined
let container: HTMLDivElement
let root: Root
let nextFrameID = 1
let pendingFrames = new Map<number, FrameRequestCallback>()

const saveSuccessfully: WhiteboardLearnerSaveHandler = async () => ({ status: "saved" })

async function flushAnimationFrames(): Promise<void> {
  while (pendingFrames.size > 0) {
    await advanceAnimationFrame()
  }
}

async function advanceAnimationFrame(): Promise<void> {
  const callbacks = [...pendingFrames.values()]
  pendingFrames = new Map()
  await act(async () => {
    for (const callback of callbacks) callback(performance.now())
    await Promise.resolve()
  })
}

beforeAll(async () => {
  module = await import("../src/components/whiteboard/whiteboard-canvas")
})

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  nextFrameID = 1
  pendingFrames = new Map()
  activeSceneElements = []
  refreshCount = 0
  measuredTextWidth = 48
  globalThis.requestAnimationFrame = (callback) => {
    const frameID = nextFrameID
    nextFrameID += 1
    pendingFrames.set(frameID, callback)
    return frameID
  }
  globalThis.cancelAnimationFrame = (frameID) => {
    pendingFrames.delete(frameID)
  }
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: async () => [],
      ready: Promise.resolve(),
    },
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
    await Promise.resolve()
  })
  container.remove()
  if (originalRequestAnimationFrame) {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, "requestAnimationFrame")
  }
  if (originalCancelAnimationFrame) {
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, "cancelAnimationFrame")
  }
  if (originalDocumentFontsDescriptor) {
    Object.defineProperty(document, "fonts", originalDocumentFontsDescriptor)
  } else {
    Reflect.deleteProperty(document, "fonts")
  }
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  resetTranscriptRepositoryForTests()
})

async function appendWhiteboardRawDelta(delta: string) {
  await act(async () => {
    applyTranscriptPartDelta("/repo", {
      sessionID: "session-1",
      messageID: "message-1",
      partID: "part-1",
      field: "state.raw",
      delta,
    })
  })
}

function seedPendingWhiteboardTool(): MessageWithParts[] {
  const message: MessageWithParts = {
    info: {
      id: "message-1",
      sessionID: "session-1",
      role: "assistant",
      parentID: "message-0",
      time: { created: 1 },
      mode: "buddy",
      agent: "buddy",
      modelID: "model-1",
      providerID: "provider-1",
      path: { cwd: "", root: "" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: [
      {
        id: "part-1",
        callID: "call-1",
        sessionID: "session-1",
        messageID: "message-1",
        type: "tool",
        tool: "whiteboard_create_view",
        state: { status: "pending", input: {}, raw: "" },
      },
    ],
  }
  applyTranscriptMessageUpdated("/repo", message.info)
  for (const part of message.parts) applyTranscriptPartUpdated("/repo", part)
  return getTranscriptMessages("/repo", "session-1")
}

function createWhiteboardPlatform(readBoard: () => ObjectWhiteboardObjectReadResponse): Platform {
  return {
    platform: "web",
    fetch: createFetchStub(
      async () =>
        new Response(JSON.stringify(readBoard()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
    openLink: noOp,
    restart: async () => undefined,
    back: noOp,
    forward: noOp,
    notify: async () => undefined,
  }
}

function renderWhiteboardPane(input: {
  queryClient: QueryClient
  platform: Platform
  objectID: string
  messages: MessageWithParts[]
  isBusy: boolean
}) {
  root.render(
    <PlatformProvider value={input.platform}>
      <QueryClientProvider client={input.queryClient}>
        <WhiteboardPane
          directory="/repo"
          objectID={input.objectID}
          isBusy={input.isBusy}
          messages={input.messages}
        />
      </QueryClientProvider>
    </PlatformProvider>,
  )
}

describe("whiteboard canvas", () => {
  test("paints progressive text before fonts load, then remeasures it without remounting", async () => {
    const WhiteboardCanvas = module?.WhiteboardCanvas
    if (!WhiteboardCanvas) throw new Error("WhiteboardCanvas was not initialized")
    let finishFontLoading = noOp
    const fontsLoaded = new Promise<void>((resolve) => {
      finishFontLoading = resolve
    })
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { load: async () => fontsLoaded, ready: fontsLoaded },
    })
    const textElement = {
      type: "text",
      id: "label",
      x: 0,
      y: 0,
      text: "A label",
      fontSize: 20,
    }

    await act(async () => {
      root.render(
        <WhiteboardCanvas
          board={{ elements: [textElement] }}
          progressive
          readOnly
          onSave={saveSuccessfully}
        />,
      )
      await Promise.resolve()
    })
    await flushAnimationFrames()

    const originalEditor = container.querySelector('[data-component="mock-excalidraw"]')
    expect(container.querySelector("output")?.textContent).toBe("label")
    expect(activeSceneElements.find((element) => element.id === "label")?.width).toBe(48)
    expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).toBeNull()

    await act(async () => {
      measuredTextWidth = 96
      finishFontLoading()
      await fontsLoaded
    })
    await flushAnimationFrames()

    expect(container.querySelector('[data-component="mock-excalidraw"]')).toBe(originalEditor)
    expect(activeSceneElements.find((element) => element.id === "label")?.width).toBe(96)
  })

  test("streams an existing-board update over its populated canvas before completion", async () => {
    const objectID = "existing-board"
    const persistedBoard = {
      objectID,
      currentBoard: {
        boardID: "board-1",
        origin: "agent" as const,
        updatedAt: "2026-09-20T00:00:00.000Z",
        elements: [{ type: "rectangle", id: "persisted", x: 0, y: 0, width: 100, height: 100 }],
      },
    }
    const platform = createWhiteboardPlatform(() => persistedBoard)
    const messages = seedPendingWhiteboardTool()
    const queryClient = new QueryClient()
    queryClient.setQueryData(whiteboardQueryKeys.object("/repo", objectID), persistedBoard)

    await act(async () => {
      renderWhiteboardPane({ queryClient, platform, objectID, messages, isBusy: true })
      await Promise.resolve()
      await Promise.resolve()
    })
    await flushAnimationFrames()
    expect(container.querySelector("output")?.textContent).toBe("persisted")

    const raw = JSON.stringify({
      objectAction: "update",
      objectID,
      boardAction: "continue_current_board",
      elements: JSON.stringify([
        { type: "rectangle", id: "first", x: 160, y: 0, width: 100, height: 100 },
        { type: "rectangle", id: "second", x: 320, y: 0, width: 100, height: 100 },
      ]),
    })
    const firstBoundary = raw.indexOf("},{") + 1
    const secondBoundary = raw.lastIndexOf("}]") + 1
    expect(firstBoundary).toBeGreaterThan(0)

    try {
      await appendWhiteboardRawDelta(raw.slice(0, firstBoundary))
      await flushAnimationFrames()
      expect(container.querySelector("output")?.textContent).toBe("persisted,first")
      expect(container.querySelector('[data-component="whiteboard-opening-animation"]')).toBeNull()
      expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).toBeNull()

      await appendWhiteboardRawDelta(raw.slice(firstBoundary, secondBoundary))
      await flushAnimationFrames()
      expect(container.querySelector("output")?.textContent).toBe("persisted,first,second")
    } finally {
      queryClient.clear()
    }
  })

  test("finishes progressive one-shot presentation after the completed board is fetched before RAF", async () => {
    const objectID = "one-shot-board"
    const existingElement = {
      type: "rectangle",
      id: "persisted",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    }
    const addedElements = Array.from({ length: 12 }, (_, index) => ({
      type: "rectangle",
      id: `added-${index}`,
      x: 120 * (index + 1),
      y: 0,
      width: 100,
      height: 80,
    }))
    const initialBoard = {
      objectID,
      currentBoard: {
        boardID: "board-1",
        origin: "agent" as const,
        updatedAt: "2026-09-20T00:00:00.000Z",
        elements: [existingElement],
      },
    }
    const finalBoard = {
      ...initialBoard,
      currentBoard: {
        ...initialBoard.currentBoard,
        boardID: "board-2",
        elements: [existingElement, ...addedElements],
      },
    }
    let fetchedBoard = initialBoard
    const platform = createWhiteboardPlatform(() => fetchedBoard)
    const messages = seedPendingWhiteboardTool()
    const queryClient = new QueryClient()
    const queryKey = whiteboardQueryKeys.object("/repo", objectID)
    queryClient.setQueryData(queryKey, initialBoard)
    const render = () =>
      renderWhiteboardPane({ queryClient, platform, objectID, messages, isBusy: false })
    try {
      await act(async () => {
        render()
      })
      await flushAnimationFrames()
      const originalCanvas = container.querySelector('[data-component="mock-excalidraw"]')
      expect(container.querySelector("output")?.textContent).toBe("persisted")
      fetchedBoard = finalBoard
      const completedPart = {
        id: "part-1",
        callID: "call-1",
        sessionID: "session-1",
        messageID: "message-1",
        type: "tool" as const,
        tool: "whiteboard_create_view",
        state: {
          status: "completed" as const,
          input: {
            objectAction: "update",
            objectID,
            boardAction: "continue_current_board",
            elements: JSON.stringify(addedElements),
          },
          output: "",
          title: "",
          time: { start: 1, end: 2 },
          metadata: { objectID, boardID: "board-2", saved: true },
        },
      }
      await act(async () => {
        applyTranscriptPartUpdated("/repo", completedPart)
      })
      // The real query completes before any presentation callback is allowed to run.
      await act(async () => {
        await queryClient.refetchQueries({ queryKey, exact: true })
        render()
      })
      expect(container.querySelector("output")?.textContent).toBe("persisted")
      const visibleFrames: string[] = []
      expect(originalCanvas?.getAttribute("data-read-only")).toBe("true")
      for (let index = 0; index < WHITEBOARD_PRESENTATION_MAX_FRAMES; index += 1) {
        await advanceAnimationFrame()
        const visible = container.querySelector("output")?.textContent ?? ""
        if (visibleFrames.at(-1) !== visible) visibleFrames.push(visible)
      }
      expect(visibleFrames.length).toBeGreaterThan(1)
      expect(visibleFrames.length).toBeLessThanOrEqual(WHITEBOARD_PRESENTATION_MAX_FRAMES)
      expect(visibleFrames[0]?.split(",").length).toBeLessThan(
        finalBoard.currentBoard.elements.length,
      )
      expect(visibleFrames.at(-1)).toBe(
        finalBoard.currentBoard.elements.map((element) => element.id).join(","),
      )
      expect(container.querySelector('[data-component="mock-excalidraw"]')).toBe(originalCanvas)
      expect(originalCanvas?.getAttribute("data-read-only")).toBe("false")
      expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).toBeNull()
    } finally {
      queryClient.clear()
    }
  })

  test("settles the latest persisted board when it arrives during preview initialization", async () => {
    const WhiteboardCanvas = module?.WhiteboardCanvas
    if (!WhiteboardCanvas) throw new Error("WhiteboardCanvas was not initialized")
    const viewport = { x: 0, y: 0, width: 1_200, height: 900 }
    const previewElement = {
      id: "preview",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    }
    const persistedElement = {
      id: "persisted",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }

    await act(async () => {
      root.render(
        <WhiteboardCanvas
          board={{ elements: [previewElement], viewport }}
          progressive={true}
          readOnly={true}
          onSave={saveSuccessfully}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(pendingFrames.size).toBeGreaterThan(0)

    await act(async () => {
      root.render(
        <WhiteboardCanvas
          board={{ boardID: "board-1", elements: [persistedElement], viewport }}
          readOnly={false}
          onSave={saveSuccessfully}
        />,
      )
      await Promise.resolve()
    })

    expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).toBeNull()
    await flushAnimationFrames()

    expect(activeSceneElements.map((element) => element.id)).toEqual(["persisted"])
    expect(refreshCount).toBeGreaterThan(0)
  })

  test("unblocks a painted board when animation frames are suspended", async () => {
    const WhiteboardCanvas = module?.WhiteboardCanvas
    if (!WhiteboardCanvas) throw new Error("WhiteboardCanvas was not initialized")
    const viewport = { x: 0, y: 0, width: 1_200, height: 900 }
    const persistedElement = {
      id: "persisted",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
    }

    await act(async () => {
      root.render(
        <WhiteboardCanvas
          board={{ boardID: "board-1", elements: [persistedElement], viewport }}
          readOnly={false}
          onSave={saveSuccessfully}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(pendingFrames.size).toBeGreaterThan(0)
    expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).not.toBeNull()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, CANVAS_FALLBACK_SETTLE_WAIT_MS))
    })

    expect(activeSceneElements.map((element) => element.id)).toEqual(["persisted"])
    expect(refreshCount).toBeGreaterThan(0)
    expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).toBeNull()
  })
})
