import { afterEach, describe, expect, test } from "bun:test"
import type { PdfQuad } from "@buddy/reader-contract"
import { READER_SELECTION_BACKGROUND } from "../src/components/readers/foliate-reader-constants"
import type { PdfPageViewGeometry } from "../src/components/readers/pdf/pdf-geometry"
import {
  pdfAnnotationAnchor,
  pdfAnnotationAtPoint,
  pdfSelectionAnchor,
  renderPdfAnnotations,
  renderPdfSearchResult,
  renderPdfSelection,
} from "../src/components/readers/pdf/pdf-overlay-layers"
import type {
  ReaderAnnotation,
  ReaderSearchResult,
  ReaderSelection,
} from "../src/components/readers/reader-types"

const PAGE_INDEX = 0
const PAGE_NUMBER = "1"
const ROOT_LEFT = 20
const ROOT_TOP = 10
const TEXT_LAYER_LEFT = 109
const TEXT_LAYER_TOP = 109

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
  session: { getPageGeometry: (pageIndex: number) => PdfPageViewGeometry | undefined }
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
  const geometry = createGeometry({ page, textLayer })
  return {
    root,
    page,
    textLayer,
    session: { getPageGeometry: (pageIndex) => (pageIndex === PAGE_INDEX ? geometry : undefined) },
  }
}

/**
 * Reports the boxes a laid-out reader would: the surface and the text layer at
 * fixed positions, and every painted mark where its own inline styles put it.
 */
function stubLayout(root: HTMLDivElement): () => void {
  const original = HTMLElement.prototype.getBoundingClientRect
  const overlayBoxes = [
    "textLayer",
    "buddy-pdf-annotation-layer",
    "buddy-pdf-selection-layer",
    "buddy-pdf-search-layer",
  ]
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: function getBoundingClientRect(this: HTMLElement) {
      if (this === root) return rect(ROOT_LEFT, ROOT_TOP, 240, 340)
      if (this.classList.contains("page")) return rect(100, 100, 218, 318)
      if (overlayBoxes.some((name) => this.classList.contains(name))) {
        return rect(TEXT_LAYER_LEFT, TEXT_LAYER_TOP, 200, 300)
      }
      if (this.style.left && this.style.top) {
        return rect(
          TEXT_LAYER_LEFT + Number.parseFloat(this.style.left),
          TEXT_LAYER_TOP + Number.parseFloat(this.style.top),
          Number.parseFloat(this.style.width),
          Number.parseFloat(this.style.height),
        )
      }
      return original.call(this)
    },
  })
  return () => {
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: original,
    })
  }
}

function quad(left: number, top: number, right: number, bottom: number): PdfQuad {
  return {
    topLeft: { x: left, y: top },
    topRight: { x: right, y: top },
    bottomRight: { x: right, y: bottom },
    bottomLeft: { x: left, y: bottom },
  }
}

function createAnnotation(overrides: Partial<ReaderAnnotation> = {}): ReaderAnnotation {
  return {
    id: "annotation-1",
    anchor: {
      kind: "pdf-text",
      segments: [{ pageIndex: PAGE_INDEX, quads: [quad(10, 20, 40, 30), quad(10, 40, 35, 50)] }],
      quote: { exact: "Buddy" },
    },
    text: "Buddy",
    note: "",
    style: "highlight",
    color: "sky",
    created: "2026-07-15T00:00:00.000Z",
    modified: "2026-07-15T00:00:00.000Z",
    ...overrides,
  }
}

const SELECTION: ReaderSelection = {
  text: "Persistent selection",
  selectionKey: "selection-1",
  anchor: {
    kind: "pdf-text",
    segments: [{ pageIndex: PAGE_INDEX, quads: [quad(12, 24, 52, 36)] }],
    quote: { exact: "Persistent selection" },
  },
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("PDF overlay layers", () => {
  test("positions annotation marks from the overlay origin and washes them as one group", () => {
    const { root, page, session } = createPage()
    const restore = stubLayout(root)

    try {
      renderPdfAnnotations({
        root,
        session,
        annotationsByPage: new Map([[PAGE_INDEX, [createAnnotation()]]]),
        onActivate: () => undefined,
      })

      const group = page.querySelector<HTMLElement>(".buddy-pdf-annotation-group")
      expect(group?.style.opacity).toBe("0.34")
      const marks = page.querySelectorAll<HTMLElement>(".buddy-pdf-annotation-mark")
      expect(marks).toHaveLength(2)
      expect(marks[0]?.style.left).toBe("10px")
      expect(marks[0]?.style.top).toBe("20px")
      expect(marks[0]?.style.width).toBe("30px")
      expect(marks[0]?.style.height).toBe("10px")
      expect(marks[0]?.style.backgroundColor).toBe("var(--surface-info-base)")
      // Alpha belongs to the group so touching marks never darken each other.
      expect(marks[0]?.style.opacity).toBe("")
      // Marks never take pointer hits, so a drag can start over a highlight.
      expect(marks[0]?.style.pointerEvents).toBe("none")
      expect(page.querySelectorAll("button.buddy-pdf-annotation-mark")).toHaveLength(1)
      expect(marks[1]?.tagName).toBe("SPAN")
      expect(marks[1]?.getAttribute("aria-hidden")).toBe("true")
    } finally {
      restore()
    }
  })

  test("marks an annotation that carries a note at full strength", () => {
    const { root, page, session } = createPage()
    const restore = stubLayout(root)

    try {
      renderPdfAnnotations({
        root,
        session,
        annotationsByPage: new Map([[PAGE_INDEX, [createAnnotation({ note: "Check this" })]]]),
        onActivate: () => undefined,
      })

      const marker = page.querySelector<HTMLElement>(".buddy-pdf-annotation-note")
      expect(marker?.style.left).toBe("10px")
      expect(marker?.style.top).toBe("20px")
      expect(marker?.style.width).toBe("3px")
      expect(marker?.parentElement?.className).toBe("buddy-pdf-annotation-layer")
    } finally {
      restore()
    }
  })

  test("activates the annotation under a pointer without letting marks take the hit", () => {
    const { root, session } = createPage()
    const restore = stubLayout(root)

    try {
      renderPdfAnnotations({
        root,
        session,
        annotationsByPage: new Map([[PAGE_INDEX, [createAnnotation()]]]),
        onActivate: () => undefined,
      })

      const firstTarget = pdfAnnotationAtPoint(root, {
        x: TEXT_LAYER_LEFT + 20,
        y: TEXT_LAYER_TOP + 25,
      })
      expect(firstTarget).toEqual({
        annotationId: "annotation-1",
        pageIndex: PAGE_INDEX,
        segmentIndex: 0,
        quadIndex: 0,
      })
      const continuationTarget = pdfAnnotationAtPoint(root, {
        x: TEXT_LAYER_LEFT + 20,
        y: TEXT_LAYER_TOP + 45,
      })
      expect(continuationTarget).toEqual({
        annotationId: "annotation-1",
        pageIndex: PAGE_INDEX,
        segmentIndex: 0,
        quadIndex: 1,
      })
      expect(
        pdfAnnotationAtPoint(root, { x: TEXT_LAYER_LEFT + 120, y: TEXT_LAYER_TOP + 25 }),
      ).toBeUndefined()
      expect(firstTarget ? pdfAnnotationAnchor(root, firstTarget) : undefined).toEqual({
        x: TEXT_LAYER_LEFT + 25 - ROOT_LEFT,
        y: TEXT_LAYER_TOP + 20 - ROOT_TOP,
      })
      expect(
        continuationTarget ? pdfAnnotationAnchor(root, continuationTarget) : undefined,
      ).toEqual({
        x: TEXT_LAYER_LEFT + 22.5 - ROOT_LEFT,
        y: TEXT_LAYER_TOP + 40 - ROOT_TOP,
      })

      renderPdfAnnotations({
        root,
        session,
        annotationsByPage: new Map([[PAGE_INDEX, [createAnnotation()]]]),
        onActivate: () => undefined,
      })
      expect(
        continuationTarget ? pdfAnnotationAnchor(root, continuationTarget) : undefined,
      ).toEqual({
        x: TEXT_LAYER_LEFT + 22.5 - ROOT_LEFT,
        y: TEXT_LAYER_TOP + 40 - ROOT_TOP,
      })
    } finally {
      restore()
    }
  })

  test("renders a persistent transient selection from canonical PDF quads", () => {
    const { root, page, session } = createPage()
    const restore = stubLayout(root)

    try {
      renderPdfSelection({ root, session, selection: SELECTION })

      const layer = page.querySelector<HTMLElement>(".buddy-pdf-selection-layer")
      expect(layer?.style.opacity).toBe("0.34")
      const mark = page.querySelector<HTMLElement>(".buddy-pdf-selection-mark")
      expect(mark?.style.left).toBe("12px")
      expect(mark?.style.top).toBe("24px")
      expect(mark?.style.width).toBe("40px")
      expect(mark?.style.height).toBe("12px")
      expect(mark?.style.backgroundColor).toBe(READER_SELECTION_BACKGROUND)
      expect(mark?.style.opacity).toBe("")

      renderPdfSelection({ root, session, selection: undefined })
      expect(page.querySelector(".buddy-pdf-selection-layer")).toBeNull()
    } finally {
      restore()
    }
  })

  test("keeps the committed annotation painted when its transient selection is removed", () => {
    const { root, page, session } = createPage()
    const restore = stubLayout(root)
    const annotation = createAnnotation({ color: "rose" })

    try {
      renderPdfSelection({ root, session, selection: SELECTION })
      renderPdfAnnotations({
        root,
        session,
        annotationsByPage: new Map([[PAGE_INDEX, [annotation]]]),
        onActivate: () => undefined,
      })
      renderPdfSelection({ root, session, selection: undefined })

      expect(page.querySelector(".buddy-pdf-selection-layer")).toBeNull()
      const annotationMark = page.querySelector<HTMLElement>(".buddy-pdf-annotation-mark")
      expect(annotationMark?.style.backgroundColor).toBe("var(--surface-critical-base)")
    } finally {
      restore()
    }
  })

  test("anchors the selection toolbar to the painted marks and drops it off-surface", () => {
    const { root, session } = createPage()
    const restore = stubLayout(root)

    try {
      renderPdfSelection({ root, session, selection: SELECTION })

      expect(pdfSelectionAnchor(root)).toEqual({
        x: TEXT_LAYER_LEFT + 32 - ROOT_LEFT,
        y: TEXT_LAYER_TOP + 24 - ROOT_TOP,
      })

      renderPdfSelection({ root, session, selection: undefined })
      expect(pdfSelectionAnchor(root)).toBeUndefined()
    } finally {
      restore()
    }
  })

  test("renders and replaces the exact active PDF search result from canonical quads", () => {
    const { root, page, session } = createPage()
    const restore = stubLayout(root)
    const result: ReaderSearchResult = {
      id: "result-1",
      anchor: {
        kind: "pdf-text",
        segments: [{ pageIndex: PAGE_INDEX, quads: [quad(22, 44, 72, 58)] }],
        quote: { exact: "Active match" },
      },
      excerpt: { pre: "", match: "Active match", post: "" },
    }

    try {
      renderPdfSearchResult({ root, session, result })

      const layer = page.querySelector<HTMLElement>(".buddy-pdf-search-layer")
      expect(layer?.style.opacity).toBe("0.52")
      const mark = page.querySelector<HTMLElement>(".buddy-pdf-search-mark")
      expect(mark?.style.left).toBe("22px")
      expect(mark?.style.top).toBe("44px")
      expect(mark?.style.width).toBe("50px")
      expect(mark?.style.height).toBe("14px")
      expect(mark?.style.backgroundColor).toBe(READER_SELECTION_BACKGROUND)

      renderPdfSearchResult({ root, session, result: undefined })
      expect(page.querySelector(".buddy-pdf-search-layer")).toBeNull()
    } finally {
      restore()
    }
  })
})
