import "../happydom"
import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, useLayoutEffect, useRef, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { WhiteboardLearnerSaveHandler } from "../src/components/whiteboard/whiteboard-learner-save"

type MockElement = {
  id: string
  type: string
  version: number
  isDeleted: boolean
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
  initialData: {
    elements: MockElement[]
  }
  children?: ReactNode
}

let activeSceneElements: MockElement[] = []
let refreshCount = 0

const CANVAS_FALLBACK_SETTLE_WAIT_MS = 450

function MockExcalidraw(props: MockExcalidrawProps) {
  const { excalidrawAPI } = props
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
        if (update.elements) activeSceneElements = [...update.elements]
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
  return <div data-component="mock-excalidraw">{props.children}</div>
}

mock.module("@excalidraw/excalidraw/index.css", () => ({}))

mock.module("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "never" },
  Excalidraw: MockExcalidraw,
  FONT_FAMILY: { Excalifont: 1 },
  Footer: (props: { children?: ReactNode }) => props.children,
  convertToExcalidrawElements: (elements: MockElement[]) =>
    elements.map((element) => ({ ...element, version: element.version ?? 1, isDeleted: false })),
  getCommonBounds: () => [0, 0, 0, 0],
  restore: (scene: { elements: MockElement[] }) => scene,
  zoomToFitBounds: () => ({ appState: { zoom: { value: 1 } } }),
}))

mock.module("@/theme", () => ({
  useTheme: () => ({ mode: "dark" }),
}))

mock.module("@/components/directory-chat/directory-workspace-context", () => ({
  useDirectoryWorkspaceOptional: () => undefined,
}))

mock.module("@/state/whiteboard-preferences", () => ({
  useWhiteboardPreferences: (
    selector: (state: { panelPlacement: "bottom"; togglePanelPlacement: () => void }) => unknown,
  ) => selector({ panelPlacement: "bottom", togglePanelPlacement: () => undefined }),
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
    const callbacks = [...pendingFrames.values()]
    pendingFrames = new Map()
    await act(async () => {
      for (const callback of callbacks) callback(performance.now())
      await Promise.resolve()
    })
  }
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
})

describe("whiteboard canvas", () => {
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
          readOnly={true}
          onSave={saveSuccessfully}
        />,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(pendingFrames.size).toBeGreaterThan(0)
    expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).not.toBeNull()

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

    await flushAnimationFrames()

    expect(activeSceneElements.map((element) => element.id)).toEqual(["persisted"])
    expect(refreshCount).toBeGreaterThan(0)
    expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).toBeNull()
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
      await new Promise((resolve) =>
        window.setTimeout(resolve, CANVAS_FALLBACK_SETTLE_WAIT_MS),
      )
    })

    expect(activeSceneElements.map((element) => element.id)).toEqual(["persisted"])
    expect(refreshCount).toBeGreaterThan(0)
    expect(container.querySelector('[data-component="whiteboard-canvas-settling"]')).toBeNull()
  })
})
