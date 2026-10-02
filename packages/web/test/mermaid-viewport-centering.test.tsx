import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { mermaidConstants } from "../src/components/media/renderers/mermaid/constants"
import type { MermaidRenderResult } from "../src/components/media/renderers/mermaid/lib/render"
import { MermaidInlineView } from "../src/components/media/renderers/mermaid/mermaid-inline-view"
import {
  useMermaidViewport,
  type MermaidViewportZoomState,
} from "../src/components/media/renderers/mermaid/use-mermaid-viewport"

const VIEWPORT_SELECTOR = '[data-component="mermaid-diagram-inline-viewport"]'
const VIEWPORT_WIDTH = 600
const VIEWPORT_HEIGHT = 400
const SMALL_DIAGRAM_SVG = '<svg viewBox="0 0 160 140"></svg>'
const WIDE_DIAGRAM_SVG = '<svg viewBox="0 0 1104 600"></svg>'
const SETTLE_ROUNDS = 4

function renderedDiagram(svg: string): MermaidRenderResult {
  return { svg, sourceHash: "source-hash", cacheKey: "cache-key", contrastAdjustments: [] }
}

let root: Root | undefined
let container: HTMLDivElement | undefined
let resizeCallbacks: Set<() => void>
let frameCallbacks: Map<number, FrameRequestCallback>
let nextFrameID: number
let restoreEnvironment: () => void

function isViewportElement(element: HTMLElement): boolean {
  return element.matches(VIEWPORT_SELECTOR)
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  resizeCallbacks = new Set()
  frameCallbacks = new Map()
  nextFrameID = 1

  const originalResizeObserver = globalThis.ResizeObserver
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame
  const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  )

  class ControlledResizeObserver {
    readonly #notify: () => void

    constructor(callback: ResizeObserverCallback) {
      this.#notify = () => callback([], this)
    }

    observe() {
      resizeCallbacks.add(this.#notify)
    }

    unobserve() {
      resizeCallbacks.delete(this.#notify)
    }

    disconnect() {
      resizeCallbacks.delete(this.#notify)
    }
  }

  globalThis.ResizeObserver = ControlledResizeObserver
  window.requestAnimationFrame = (callback) => {
    const frameID = nextFrameID
    nextFrameID += 1
    frameCallbacks.set(frameID, callback)
    return frameID
  }
  window.cancelAnimationFrame = (frameID) => {
    frameCallbacks.delete(frameID)
  }
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return isViewportElement(this) ? VIEWPORT_WIDTH : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return isViewportElement(this) ? VIEWPORT_HEIGHT : 0
    },
  })

  restoreEnvironment = () => {
    globalThis.ResizeObserver = originalResizeObserver
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth")
    }
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight)
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "clientHeight")
    }
  }
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
  restoreEnvironment()
})

function DiagramViewport(props: { value: MermaidRenderResult | undefined }) {
  const [zoomState, setZoomState] = useState<MermaidViewportZoomState>({
    zoom: mermaidConstants.zoom.DEFAULT,
    isAutoZoom: true,
  })
  const viewport = useMermaidViewport({
    value: props.value,
    enabled: props.value !== undefined,
    zoomState,
    onZoomStateChange: setZoomState,
    canvasPadding: mermaidConstants.viewport.INLINE_CANVAS_PADDING,
    panOverscan: mermaidConstants.viewport.INLINE_PAN_OVERSCAN,
    defaultZoomMode: "responsive",
    responsiveAutoZoomStrategy: {
      minimumRenderedHeight: mermaidConstants.viewport.INLINE_AUTO_MIN_RENDERED_HEIGHT,
      maxViewportWidths: mermaidConstants.viewport.INLINE_AUTO_MAX_VIEWPORT_WIDTHS,
    },
  })

  return props.value ? <MermaidInlineView ariaLabel="Diagram" viewport={viewport} /> : null
}

async function renderDiagram(value: MermaidRenderResult | undefined) {
  await act(async () => {
    root?.render(<DiagramViewport value={value} />)
  })
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    await act(async () => {
      for (const notify of Array.from(resizeCallbacks)) notify()
    })
    await act(async () => {
      const pendingFrames = Array.from(frameCallbacks.values())
      frameCallbacks.clear()
      for (const runFrame of pendingFrames) runFrame(performance.now())
    })
  }
}

function mountedViewport(): HTMLElement {
  const viewport = container?.querySelector<HTMLElement>(VIEWPORT_SELECTOR)
  if (!viewport) throw new Error("The Mermaid viewport is not mounted.")
  return viewport
}

function expectCentered(viewport: HTMLElement) {
  expect({ left: viewport.scrollLeft, top: viewport.scrollTop }).toEqual({
    left: mermaidConstants.viewport.INLINE_PAN_OVERSCAN,
    top: mermaidConstants.viewport.INLINE_PAN_OVERSCAN,
  })
}

describe("mermaid viewport centering", () => {
  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  test("centers a diagram on its first render", async () => {
    await renderDiagram(renderedDiagram(SMALL_DIAGRAM_SVG))

    expectCentered(mountedViewport())
  })

  test("centers a small diagram again after it re-renders through loading", async () => {
    await renderDiagram(renderedDiagram(SMALL_DIAGRAM_SVG))
    const firstViewport = mountedViewport()

    await renderDiagram(undefined)
    await renderDiagram(renderedDiagram(SMALL_DIAGRAM_SVG))

    const secondViewport = mountedViewport()
    expect(secondViewport).not.toBe(firstViewport)
    expectCentered(secondViewport)
  })

  test("centers a zoomed-out diagram again after it re-renders through loading", async () => {
    await renderDiagram(renderedDiagram(WIDE_DIAGRAM_SVG))

    await renderDiagram(undefined)
    await renderDiagram(renderedDiagram(WIDE_DIAGRAM_SVG))

    expectCentered(mountedViewport())
  })
})
