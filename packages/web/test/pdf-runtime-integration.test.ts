import { describe, expect, test } from "bun:test"
import {
  pdfPageOffsetRatios,
  pdfQuadFromClientRect,
  readPdfPageViewGeometry,
  viewportBoundsFromPdfQuad,
  type PdfViewportGeometry,
} from "../src/components/readers/pdf/pdf-geometry"
import { findPdfTextMatches } from "../src/components/readers/pdf/pdf-search"
import { pdfDocumentFingerprint } from "../src/components/readers/pdf/pdf-document-identity"
import { READER_THEMES } from "../src/components/readers/foliate-reader-constants"
import { disableFoliatePdfFallback } from "../scripts/create-foliate-vite-plugin"
import {
  prependPdfJsRuntimePolyfill,
  scopePdfJsViewerCss,
} from "../scripts/create-pdfjs-vite-plugin"

const DEFAULT_SEARCH_OPTIONS = {
  matchCase: false,
  matchWholeWords: false,
  matchDiacritics: false,
} as const

describe("Foliate Vite integration", () => {
  test("does not bundle Foliate's superseded PDF fallback", () => {
    const source = `if (isEpub) {
        book = epub
    }
    else if (await isPDF(file)) {
        const { makePDF } = await import('./pdf.js')
        book = await makePDF(file)
    }
    else {
        book = mobi
    }`

    const transformed = disableFoliatePdfFallback(source)

    expect(transformed).not.toContain("import('./pdf.js')")
    expect(transformed).toContain("PDF input must be opened with the Buddy PDF reader")
    expect(transformed).toContain("book = epub")
    expect(transformed).toContain("book = mobi")
  })
})

describe("PDF.js Vite integration", () => {
  test("includes a modified PDF's revision ID in its persistence fingerprint", () => {
    expect(pdfDocumentFingerprint(["permanent-id", null])).toBe("permanent-id")
    expect(pdfDocumentFingerprint(["permanent-id", "revision-id"])).toBe(
      "permanent-id:revision-id",
    )
  })

  test("scopes the stock viewer stylesheet without retaining root declarations", () => {
    const source = `:root { --viewer-container-height:0; color-scheme: light dark; }
.dialog { color: red; }
@media (prefers-color-scheme: dark) { :root { color: white; } }`

    const scoped = scopePdfJsViewerCss(source)

    expect(scoped.startsWith("@scope (.buddy-pdfjs-scope) {")).toBe(true)
    expect(scoped).not.toContain(":root")
    expect(scoped).not.toContain("--viewer-container-height:0;")
    expect(scoped).toContain("color-scheme: light dark;")
    expect(scoped).toContain(".dialog { color: red; }")
  })

  test("prepends the runtime compatibility shim exactly once", () => {
    const once = prependPdfJsRuntimePolyfill("export const value = 1")
    const twice = prependPdfJsRuntimePolyfill(once)

    expect(once).toContain("ensureBuddyPdfJsGetOrInsertComputed(Map)")
    expect(once).toContain("ensureBuddyPdfJsGetOrInsertComputed(WeakMap)")
    expect(twice).toBe(once)
  })

  test("preserves embedded image fidelity in dark PDF appearances", () => {
    const darkThemes = READER_THEMES.filter((theme) => theme.appearance === "dark")

    expect(darkThemes).not.toHaveLength(0)
    for (const theme of darkThemes) {
      expect(theme.pdfFilter).not.toContain("invert(")
      expect(theme.pdfFilter).not.toContain("hue-rotate(")
    }
  })
})

describe("PDF crop-relative geometry", () => {
  const viewport: PdfViewportGeometry = {
    width: 200,
    height: 200,
    convertToPdfPoint: (x, y) => [x + 10, 220 - y],
    convertToViewportPoint: (x, y) => [x - 10, 220 - y],
  }
  const textLayerBounds = { left: 100, top: 50, right: 300, bottom: 250 }
  const cropBoxOrigin = { x: 10, y: 20 }

  test("reads the page surface, viewport converters, and crop-box origin", () => {
    const div = document.createElement("div")
    const textLayerDiv = document.createElement("div")
    const geometry = readPdfPageViewGeometry({
      div,
      textLayer: { div: textLayerDiv },
      viewport,
      pdfPage: { view: [10, 20, 210, 220] },
    })

    expect(geometry?.div).toBe(div)
    expect(geometry?.textLayerDiv).toBe(textLayerDiv)
    expect(geometry?.cropBox).toEqual({ xMin: 10, yMin: 20, xMax: 210, yMax: 220 })
    expect(geometry?.cropBoxOrigin).toEqual(cropBoxOrigin)
    expect(geometry?.viewport.convertToPdfPoint(5, 6)).toEqual([15, 214])
  })

  test("uses text-layer bounds and persists coordinates relative to the crop box", () => {
    const quad = pdfQuadFromClientRect(
      { left: 110, top: 60, right: 130, bottom: 80 },
      textLayerBounds,
      viewport,
      cropBoxOrigin,
    )

    expect(quad).toEqual({
      topLeft: { x: 10, y: 190 },
      topRight: { x: 30, y: 190 },
      bottomRight: { x: 30, y: 170 },
      bottomLeft: { x: 10, y: 170 },
    })
    expect(quad && viewportBoundsFromPdfQuad(quad, viewport, cropBoxOrigin)).toEqual({
      left: 10,
      top: 10,
      width: 20,
      height: 20,
    })
  })

  test("clips client rectangles to the text layer and tracks both position axes", () => {
    const quad = pdfQuadFromClientRect(
      { left: 90, top: 40, right: 110, bottom: 60 },
      textLayerBounds,
      viewport,
      cropBoxOrigin,
    )

    expect(quad).toEqual({
      topLeft: { x: 0, y: 200 },
      topRight: { x: 10, y: 200 },
      bottomRight: { x: 10, y: 190 },
      bottomLeft: { x: 0, y: 190 },
    })
    expect(
      pdfPageOffsetRatios({
        textLayerBounds,
        viewportLeft: 200,
        viewportTop: 100,
      }),
    ).toEqual({ xRatio: 0.5, yRatio: 0.25 })
  })
})

describe("PDF text search offsets", () => {
  test("uses deterministic locale-independent case folding", () => {
    const matches = findPdfTextMatches("I İ ı i", "i", DEFAULT_SEARCH_OPTIONS)

    expect(matches.map((match) => [match.startOffset, match.endOffset])).toEqual([
      [0, 1],
      [2, 3],
      [6, 7],
    ])
  })

  test("preserves UTF-16 offsets for astral characters and whole-word boundaries", () => {
    const source = "𐐀abc 𐐀"
    const matches = findPdfTextMatches(source, "𐐀", {
      ...DEFAULT_SEARCH_OPTIONS,
      matchWholeWords: true,
    })
    const expectedStart = source.lastIndexOf("𐐀")

    expect(matches).toHaveLength(1)
    expect(matches[0]?.startOffset).toBe(expectedStart)
    expect(matches[0]?.endOffset).toBe(expectedStart + "𐐀".length)
    expect(matches[0]?.match).toBe("𐐀")
  })

  test("includes decomposed combining marks in source offsets when ignoring diacritics", () => {
    const source = "Cafe\u0301 noir"
    const matches = findPdfTextMatches(source, "é", DEFAULT_SEARCH_OPTIONS)

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      startOffset: 3,
      endOffset: 5,
      match: "e\u0301",
    })
  })

  test("keeps emoji matches on complete surrogate-pair boundaries", () => {
    const source = "a🙂b"
    const matches = findPdfTextMatches(source, "🙂", DEFAULT_SEARCH_OPTIONS)

    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({
      startOffset: 1,
      endOffset: 3,
      match: "🙂",
    })
  })
})
