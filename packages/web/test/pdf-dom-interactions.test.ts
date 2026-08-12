import { afterEach, describe, expect, test } from "bun:test"
import { MAX_PDF_QUOTE_LENGTH } from "@buddy/reader-contract"
import {
  beginPdfWhitespaceSelectionDrag,
  isPdfSelectionEventTarget,
  readPdfSelection,
  updatePdfWhitespaceSelectionDrag,
} from "../src/components/readers/pdf/pdf-dom-interactions"
import type { PdfPageViewGeometry } from "../src/components/readers/pdf/pdf-geometry"

const PAGE_INDEX = 0
const PAGE_NUMBER = "1"
const TEXT_LAYER_LEFT = 100
const TEXT_LAYER_TOP = 50

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
  Object.defineProperty(root, "getBoundingClientRect", {
    value: () => rect(20, 10, 240, 340),
  })
  Object.defineProperty(textLayer, "getBoundingClientRect", {
    value: () => rect(TEXT_LAYER_LEFT, TEXT_LAYER_TOP, 200, 300),
  })
  return { root, page, textLayer }
}

function selectRange(configure: (range: Range) => void): void {
  const range = document.createRange()
  configure(range)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * PDF.js reports rects for structural nodes too, so the stub answers element
 * ranges (the whole text layer) with the boxes a real page would report for its
 * `<br>` sentinels, and text ranges with the boxes of their own glyphs.
 */
function stubClientRects(input: {
  structural: DOMRect[]
  byText: Record<string, DOMRect[]>
}): () => void {
  const original = Range.prototype.getClientRects
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: function getClientRects(this: Range) {
      const container = this.startContainer
      if (container instanceof Text) return input.byText[container.data] ?? []
      return input.structural
    },
  })
  return () => {
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: original,
    })
  }
}

afterEach(() => {
  document.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe("PDF selection reading", () => {
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

  test("starts selecting where a whitespace-origin drag first intersects text", () => {
    const { root, page, textLayer } = createPage()
    const paragraph = document.createElement("span")
    const text = document.createTextNode("Paragraph text")
    paragraph.append(text)
    textLayer.append(paragraph)
    const restoreRects = stubClientRects({
      structural: [],
      byText: { "Paragraph text": [rect(110, 60, 120, 18)] },
    })
    const originalCaretPosition = Object.getOwnPropertyDescriptor(
      document,
      "caretPositionFromPoint",
    )
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: (x: number) => ({ offsetNode: text, offset: x < 150 ? 0 : 9 }),
    })

    try {
      const drag = beginPdfWhitespaceSelectionDrag({
        root,
        pointer: { target: page, pointerId: 7, clientX: 120, clientY: 30 },
      })
      expect(drag).toBeDefined()
      if (!drag) return

      expect(
        updatePdfWhitespaceSelectionDrag({
          root,
          drag,
          pointer: { target: paragraph, pointerId: 7, clientX: 120, clientY: 65 },
        }),
      ).toBe(true)
      expect(document.getSelection()?.isCollapsed).toBe(true)

      expect(
        updatePdfWhitespaceSelectionDrag({
          root,
          drag,
          pointer: { target: paragraph, pointerId: 7, clientX: 180, clientY: 65 },
        }),
      ).toBe(true)
      expect(document.getSelection()?.toString()).toBe("Paragraph")
    } finally {
      restoreRects()
      if (originalCaretPosition) {
        Object.defineProperty(document, "caretPositionFromPoint", originalCaretPosition)
      } else {
        Reflect.deleteProperty(document, "caretPositionFromPoint")
      }
    }
  })

  test("does not capture whitespace drags from PDF annotation controls", () => {
    const { root, page } = createPage()
    const annotationLayer = document.createElement("div")
    annotationLayer.className = "annotationLayer"
    const link = document.createElement("a")
    link.href = "#reference"
    const label = document.createElement("span")
    label.textContent = "Reference"
    link.append(label)
    annotationLayer.append(link)
    page.append(annotationLayer)

    expect(
      beginPdfWhitespaceSelectionDrag({
        root,
        pointer: { target: label, pointerId: 8, clientX: 120, clientY: 30 },
      }),
    ).toBeUndefined()
    expect(
      beginPdfWhitespaceSelectionDrag({
        root,
        pointer: { target: annotationLayer, pointerId: 9, clientX: 120, clientY: 30 },
      }),
    ).toEqual({ pointerId: 9, anchor: undefined })
  })

  test("decodes an in-page text range into a canonical chat selection", () => {
    const { root, page, textLayer } = createPage()
    const text = document.createTextNode("Hello Buddy reader")
    textLayer.append(text)
    const restore = stubClientRects({
      structural: [],
      byText: { "Hello Buddy reader": [rect(110, 60, 20, 20)] },
    })

    try {
      selectRange((range) => {
        range.setStart(text, 6)
        range.setEnd(text, 11)
      })

      const selection = readPdfSelection({
        root,
        session: {
          getPageGeometry: (pageIndex) =>
            pageIndex === PAGE_INDEX ? createGeometry({ page, textLayer }) : undefined,
          getPageLabel: () => "Sheet 7",
          getTocLabel: () => "Results",
        },
      })

      expect(selection).toMatchObject({
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
    } finally {
      restore()
    }
  })

  test("ignores the structural boxes the text layer parks at the page origin", () => {
    const { root, page, textLayer } = createPage()
    const first = document.createElement("span")
    first.append(document.createTextNode("First line"))
    const lineBreak = document.createElement("br")
    const second = document.createElement("span")
    second.append(document.createTextNode("Second line"))
    textLayer.append(first, lineBreak, second)
    const restore = stubClientRects({
      // A selected `<br>` collapses onto the page origin and would paint a stray
      // band down the left edge if it reached the anchor.
      structural: [rect(TEXT_LAYER_LEFT, TEXT_LAYER_TOP, 2, 14)],
      byText: {
        "First line": [rect(110, 60, 40, 14)],
        "Second line": [rect(110, 80, 50, 14)],
      },
    })

    try {
      selectRange((range) => range.selectNodeContents(textLayer))

      const selection = readPdfSelection({
        root,
        session: {
          getPageGeometry: (pageIndex) =>
            pageIndex === PAGE_INDEX ? createGeometry({ page, textLayer }) : undefined,
        },
      })

      const quads = selection?.anchor.kind === "pdf-text" ? selection.anchor.segments[0]?.quads : []
      expect(quads).toHaveLength(2)
      expect(quads?.map((quad) => quad.topLeft)).toEqual([
        { x: 10, y: 10 },
        { x: 10, y: 30 },
      ])
    } finally {
      restore()
    }
  })

  test("merges the per-span rects of one visual line into a single quad", () => {
    const { root, page, textLayer } = createPage()
    const first = document.createElement("span")
    first.append(document.createTextNode("One "))
    const second = document.createElement("span")
    second.append(document.createTextNode("line"))
    textLayer.append(first, second)
    const restore = stubClientRects({
      structural: [],
      byText: {
        "One ": [rect(110, 60, 20, 14)],
        line: [rect(131, 61, 25, 12)],
      },
    })

    try {
      selectRange((range) => range.selectNodeContents(textLayer))

      const selection = readPdfSelection({
        root,
        session: {
          getPageGeometry: (pageIndex) =>
            pageIndex === PAGE_INDEX ? createGeometry({ page, textLayer }) : undefined,
        },
      })

      const quads = selection?.anchor.kind === "pdf-text" ? selection.anchor.segments[0]?.quads : []
      expect(quads).toHaveLength(1)
      expect(quads?.[0]).toEqual({
        topLeft: { x: 10, y: 10 },
        topRight: { x: 56, y: 10 },
        bottomRight: { x: 56, y: 24 },
        bottomLeft: { x: 10, y: 24 },
      })
    } finally {
      restore()
    }
  })

  test("rejects selections that cannot survive the persisted anchor contract", () => {
    const { root, textLayer } = createPage()
    const text = document.createTextNode("x".repeat(MAX_PDF_QUOTE_LENGTH + 1))
    textLayer.append(text)
    selectRange((range) => range.selectNodeContents(text))
    let limitErrors = 0

    const selection = readPdfSelection({
      root,
      session: { getPageGeometry: () => undefined },
      onLimitExceeded: () => {
        limitErrors += 1
      },
    })

    expect(selection).toBeUndefined()
    expect(limitErrors).toBe(1)
  })
})
