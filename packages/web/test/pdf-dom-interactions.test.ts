import { afterEach, describe, expect, test } from "bun:test"
import { MAX_PDF_QUOTE_LENGTH, type PdfQuad } from "@buddy/reader-contract"
import { READER_SELECTION_BACKGROUND } from "../src/components/readers/foliate-reader-constants"
import {
  isPdfSelectionEventTarget,
  readPdfSelection,
  renderPdfAnnotations,
  renderPdfSearchResult,
  renderPdfSelection,
} from "../src/components/readers/pdf/pdf-dom-interactions"
import type { PdfPageViewGeometry } from "../src/components/readers/pdf/pdf-geometry"
import type {
  ReaderAnnotation,
  ReaderSearchResult,
  ReaderSelection,
} from "../src/components/readers/reader-types"

const PAGE_INDEX = 0
const PAGE_NUMBER = "1"

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return DOMRect.fromRect({ x, y, width, height })
}

function createGeometry(input: {
  page: HTMLDivElement
  textLayer: HTMLDivElement
}): PdfPageViewGeometry {
  return {
    div: input.page,
    textLayerDiv: input.textLayer,
    viewport: {
      width: 200,
      height: 300,
      convertToPdfPoint: (x, y) => [x, y],
      convertToViewportPoint: (x, y) => [x, y],
    },
    cropBox: { xMin: 0, yMin: 0, xMax: 200, yMax: 300 },
    cropBoxOrigin: { x: 0, y: 0 },
  }
}

function createPage(): {
  root: HTMLDivElement
  page: HTMLDivElement
  textLayer: HTMLDivElement
} {
  const root = document.createElement("div")
  const page = document.createElement("div")
  const textLayer = document.createElement("div")
  page.className = "page"
  page.dataset.pageNumber = PAGE_NUMBER
  textLayer.className = "textLayer"
  page.append(textLayer)
  const viewer = document.createElement("div")
  viewer.className = "pdfViewer"
  viewer.append(page)
  root.append(viewer)
  document.body.append(root)
  return { root, page, textLayer }
}

afterEach(() => {
  document.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe("PDF DOM interactions", () => {
  test("keeps selection toolbar actions outside the PDF selection event boundary", () => {
    const root = document.createElement("div")
    const viewerContainer = document.createElement("div")
    const textLayer = document.createElement("div")
    const toolbar = document.createElement("div")
    const highlightButton = document.createElement("button")
    viewerContainer.append(textLayer)
    toolbar.append(highlightButton)
    root.append(viewerContainer, toolbar)

    expect(isPdfSelectionEventTarget(textLayer, viewerContainer)).toBe(true)
    expect(isPdfSelectionEventTarget(highlightButton, viewerContainer)).toBe(false)
    expect(isPdfSelectionEventTarget(root, viewerContainer)).toBe(false)
  })

  test("decodes an in-page text range into a canonical chat selection", () => {
    const { root, page, textLayer } = createPage()
    const text = document.createTextNode("Hello Buddy reader")
    textLayer.append(text)
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => rect(20, 10, 240, 340),
    })
    Object.defineProperty(textLayer, "getBoundingClientRect", {
      value: () => rect(100, 50, 200, 300),
    })

    const originalGetClientRects = Range.prototype.getClientRects
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [rect(110, 60, 20, 20)],
    })

    try {
      const selectedRange = document.createRange()
      selectedRange.setStart(text, 6)
      selectedRange.setEnd(text, 11)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(selectedRange)

      const geometry = createGeometry({ page, textLayer })
      const action = readPdfSelection({
        root,
        session: {
          getPageGeometry: (pageIndex) => (pageIndex === PAGE_INDEX ? geometry : undefined),
          getPageLabel: () => "Sheet 7",
          getTocLabel: () => "Results",
        },
      })

      expect(action).toBeDefined()
      expect(action?.selection).toMatchObject({
        text: "Buddy",
        pageLabel: "Sheet 7",
        tocLabel: "Results",
        anchor: {
          kind: "pdf-text",
          quote: { exact: "Buddy", prefix: "Hello ", suffix: " reader" },
          segments: [
            {
              pageIndex: PAGE_INDEX,
              startOffset: 6,
              endOffset: 11,
              quads: [
                {
                  topLeft: { x: 10, y: 10 },
                  topRight: { x: 30, y: 10 },
                  bottomRight: { x: 30, y: 30 },
                  bottomLeft: { x: 10, y: 30 },
                },
              ],
            },
          ],
        },
      })
      expect(action?.x).toBe(100)
      expect(action?.y).toBe(50)
    } finally {
      Object.defineProperty(Range.prototype, "getClientRects", {
        configurable: true,
        value: originalGetClientRects,
      })
    }
  })

  test("rejects selections that cannot survive the persisted anchor contract", () => {
    const { root, textLayer } = createPage()
    const text = document.createTextNode("x".repeat(MAX_PDF_QUOTE_LENGTH + 1))
    textLayer.append(text)
    const selectedRange = document.createRange()
    selectedRange.selectNodeContents(text)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(selectedRange)
    let limitErrors = 0

    const action = readPdfSelection({
      root,
      session: { getPageGeometry: () => undefined },
      onLimitExceeded: () => {
        limitErrors += 1
      },
    })

    expect(action).toBeUndefined()
    expect(limitErrors).toBe(1)
  })

  test("anchors the action menu to the first selected line instead of the full range box", () => {
    const { root, page, textLayer } = createPage()
    const text = document.createTextNode("One selected passage across several visual lines")
    textLayer.append(text)
    Object.defineProperty(root, "getBoundingClientRect", {
      value: () => rect(20, 10, 240, 340),
    })
    Object.defineProperty(textLayer, "getBoundingClientRect", {
      value: () => rect(100, 50, 200, 300),
    })

    const originalGetClientRects = Range.prototype.getClientRects
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [rect(110, 60, 20, 20), rect(130, 60, 30, 20), rect(100, 90, 180, 20)],
    })

    try {
      const selectedRange = document.createRange()
      selectedRange.selectNodeContents(text)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(selectedRange)

      const action = readPdfSelection({
        root,
        session: { getPageGeometry: () => createGeometry({ page, textLayer }) },
      })

      expect(action?.x).toBe(115)
      expect(action?.y).toBe(50)
    } finally {
      Object.defineProperty(Range.prototype, "getClientRects", {
        configurable: true,
        value: originalGetClientRects,
      })
    }
  })

  test("positions Buddy annotations from the overlay origin without double-counting the page border", () => {
    const { root, page, textLayer } = createPage()
    const geometry = createGeometry({ page, textLayer })
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect(this: HTMLElement) {
        if (this.classList.contains("page")) return rect(100, 100, 218, 318)
        if (this.classList.contains("textLayer")) return rect(109, 109, 200, 300)
        if (this.classList.contains("buddy-pdf-annotation-layer")) {
          return rect(109, 109, 200, 300)
        }
        return originalGetBoundingClientRect.call(this)
      },
    })

    const quad: PdfQuad = {
      topLeft: { x: 10, y: 20 },
      topRight: { x: 40, y: 20 },
      bottomRight: { x: 40, y: 30 },
      bottomLeft: { x: 10, y: 30 },
    }
    const annotation: ReaderAnnotation = {
      id: "annotation-1",
      anchor: {
        kind: "pdf-text",
        segments: [
          {
            pageIndex: PAGE_INDEX,
            quads: [
              quad,
              {
                topLeft: { x: 10, y: 40 },
                topRight: { x: 35, y: 40 },
                bottomRight: { x: 35, y: 50 },
                bottomLeft: { x: 10, y: 50 },
              },
            ],
          },
        ],
        quote: { exact: "Buddy" },
      },
      text: "Buddy",
      note: "",
      style: "highlight",
      color: "sky",
      created: "2026-07-15T00:00:00.000Z",
      modified: "2026-07-15T00:00:00.000Z",
    }

    try {
      renderPdfAnnotations({
        root,
        session: {
          getPageGeometry: (pageIndex) => (pageIndex === PAGE_INDEX ? geometry : undefined),
        },
        annotationsByPage: new Map([[PAGE_INDEX, [annotation]]]),
        onActivate: () => undefined,
      })

      const mark = page.querySelector<HTMLButtonElement>(".buddy-pdf-annotation-mark")
      expect(mark).not.toBeNull()
      expect(mark?.style.left).toBe("10px")
      expect(mark?.style.top).toBe("20px")
      expect(mark?.style.width).toBe("30px")
      expect(mark?.style.height).toBe("10px")
      expect(mark?.style.backgroundColor).toBe("var(--surface-info-base)")
      expect(mark?.style.opacity).toBe("0.34")
      expect(mark?.style.mixBlendMode).toBe("")
      const marks = page.querySelectorAll<HTMLElement>(".buddy-pdf-annotation-mark")
      expect(marks).toHaveLength(2)
      expect(page.querySelectorAll("button.buddy-pdf-annotation-mark")).toHaveLength(1)
      expect(marks[1]?.tagName).toBe("SPAN")
      expect(marks[1]?.getAttribute("aria-hidden")).toBe("true")
    } finally {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: originalGetBoundingClientRect,
      })
    }
  })

  test("renders a persistent transient selection from canonical PDF quads", () => {
    const { root, page, textLayer } = createPage()
    const geometry = createGeometry({ page, textLayer })
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect(this: HTMLElement) {
        if (this.classList.contains("page")) return rect(100, 100, 218, 318)
        if (this.classList.contains("textLayer")) return rect(109, 109, 200, 300)
        if (this.classList.contains("buddy-pdf-selection-layer")) {
          return rect(109, 109, 200, 300)
        }
        return originalGetBoundingClientRect.call(this)
      },
    })
    const quad: PdfQuad = {
      topLeft: { x: 12, y: 24 },
      topRight: { x: 52, y: 24 },
      bottomRight: { x: 52, y: 36 },
      bottomLeft: { x: 12, y: 36 },
    }
    const selection: ReaderSelection = {
      text: "Persistent selection",
      selectionKey: "selection-1",
      anchor: {
        kind: "pdf-text",
        segments: [{ pageIndex: PAGE_INDEX, quads: [quad] }],
        quote: { exact: "Persistent selection" },
      },
    }

    try {
      const session = {
        getPageGeometry: (pageIndex: number) => (pageIndex === PAGE_INDEX ? geometry : undefined),
      }
      renderPdfSelection({ root, session, selection })

      const mark = page.querySelector<HTMLElement>(".buddy-pdf-selection-mark")
      expect(mark?.style.left).toBe("12px")
      expect(mark?.style.top).toBe("24px")
      expect(mark?.style.width).toBe("40px")
      expect(mark?.style.height).toBe("12px")
      expect(mark?.style.backgroundColor).toBe(READER_SELECTION_BACKGROUND)
      expect(mark?.style.opacity).toBe("0.34")

      renderPdfSelection({ root, session, selection: undefined })
      expect(page.querySelector(".buddy-pdf-selection-layer")).toBeNull()
    } finally {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: originalGetBoundingClientRect,
      })
    }
  })

  test("renders and replaces the exact active PDF search result from canonical quads", () => {
    const { root, page, textLayer } = createPage()
    const geometry = createGeometry({ page, textLayer })
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: function getBoundingClientRect(this: HTMLElement) {
        if (this.classList.contains("textLayer")) return rect(109, 109, 200, 300)
        if (this.classList.contains("buddy-pdf-search-layer")) {
          return rect(109, 109, 200, 300)
        }
        return originalGetBoundingClientRect.call(this)
      },
    })
    const result: ReaderSearchResult = {
      id: "result-1",
      anchor: {
        kind: "pdf-text",
        segments: [
          {
            pageIndex: PAGE_INDEX,
            quads: [
              {
                topLeft: { x: 22, y: 44 },
                topRight: { x: 72, y: 44 },
                bottomRight: { x: 72, y: 58 },
                bottomLeft: { x: 22, y: 58 },
              },
            ],
          },
        ],
        quote: { exact: "Active match" },
      },
      excerpt: { pre: "", match: "Active match", post: "" },
    }

    try {
      const session = {
        getPageGeometry: (pageIndex: number) => (pageIndex === PAGE_INDEX ? geometry : undefined),
      }
      renderPdfSearchResult({ root, session, result })

      const mark = page.querySelector<HTMLElement>(".buddy-pdf-search-mark")
      expect(mark?.style.left).toBe("22px")
      expect(mark?.style.top).toBe("44px")
      expect(mark?.style.width).toBe("50px")
      expect(mark?.style.height).toBe("14px")
      expect(mark?.style.backgroundColor).toBe("var(--surface-warning-base)")
      expect(mark?.style.opacity).toBe("0.52")

      renderPdfSearchResult({ root, session, result: undefined })
      expect(page.querySelector(".buddy-pdf-search-layer")).toBeNull()
    } finally {
      Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
        configurable: true,
        value: originalGetBoundingClientRect,
      })
    }
  })
})
