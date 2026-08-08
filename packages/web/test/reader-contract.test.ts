import { describe, expect, test } from "bun:test"
import {
  MAX_PDF_QUADS_PER_SEGMENT,
  MAX_PDF_QUOTE_LENGTH,
  MAX_PDF_TEXT_SEGMENTS,
  READER_ANCHOR_KIND_CFI_POSITION,
  READER_ANCHOR_KIND_CFI_TEXT,
  READER_ANCHOR_KIND_PDF_POSITION,
  READER_ANCHOR_KIND_PDF_TEXT,
  formatReaderPositionAnchor,
  legacyCfiPositionAnchor,
  legacyCfiTextAnchor,
  readAllowedExternalLink,
  readReaderExternalLink,
  readReaderLocation,
  readReaderPositionAnchor,
  readReaderTextAnchor,
  readerPositionAnchorEquals,
  readerPositionIndex,
  readerTextAnchorEquals,
  readerTextAnchorKey,
  type PdfPositionAnchor,
  type PdfQuad,
  type PdfTextAnchor,
} from "@buddy/reader-contract"

const CFI = "epubcfi(/6/2[chapter]!/4/2/6)"
const OTHER_CFI = "epubcfi(/6/4[appendix]!/4/2)"
const CFI_MAXIMUM_LENGTH = 16_384
const PDF_COORDINATE_MAXIMUM_ABSOLUTE_VALUE = 10_000_000
const PDF_QUOTE_CONTEXT_MAXIMUM_LENGTH = 1_024

function createQuad(offset = 0): PdfQuad {
  return {
    topLeft: { x: 10 + offset, y: 20 + offset },
    topRight: { x: 110 + offset, y: 20 + offset },
    bottomRight: { x: 110 + offset, y: 40 + offset },
    bottomLeft: { x: 10 + offset, y: 40 + offset },
  }
}

function createPdfTextAnchor(): PdfTextAnchor {
  return {
    kind: READER_ANCHOR_KIND_PDF_TEXT,
    segments: [
      {
        pageIndex: 2,
        quads: [createQuad()],
        startOffset: 4,
        endOffset: 12,
      },
      {
        pageIndex: 3,
        quads: [createQuad(5)],
      },
    ],
    quote: {
      exact: "Selected text",
      prefix: "Before ",
      suffix: " after",
    },
  }
}

describe("reader position anchors", () => {
  test("parses CFI position anchors and removes unknown fields", () => {
    expect(
      readReaderPositionAnchor({
        kind: READER_ANCHOR_KIND_CFI_POSITION,
        cfi: CFI,
        sectionIndex: 3,
        ignored: true,
      }),
    ).toEqual({
      kind: READER_ANCHOR_KIND_CFI_POSITION,
      cfi: CFI,
      sectionIndex: 3,
    })

    expect(
      readReaderPositionAnchor({ kind: READER_ANCHOR_KIND_CFI_POSITION, cfi: CFI }),
    ).toEqual({ kind: READER_ANCHOR_KIND_CFI_POSITION, cfi: CFI })
  })

  test("rejects malformed CFI position anchors", () => {
    const invalidAnchors: unknown[] = [
      null,
      [],
      {},
      { kind: READER_ANCHOR_KIND_CFI_POSITION, cfi: "" },
      {
        kind: READER_ANCHOR_KIND_CFI_POSITION,
        cfi: "x".repeat(CFI_MAXIMUM_LENGTH + 1),
      },
      { kind: READER_ANCHOR_KIND_CFI_POSITION, cfi: CFI, sectionIndex: -1 },
      { kind: READER_ANCHOR_KIND_CFI_POSITION, cfi: CFI, sectionIndex: 1.5 },
      { kind: READER_ANCHOR_KIND_CFI_POSITION, cfi: CFI, sectionIndex: Number.NaN },
      {
        kind: READER_ANCHOR_KIND_CFI_POSITION,
        cfi: CFI,
        sectionIndex: Number.POSITIVE_INFINITY,
      },
    ]

    for (const anchor of invalidAnchors) {
      expect(readReaderPositionAnchor(anchor)).toBeUndefined()
    }
  })

  test("parses PDF position anchors at both coordinate boundaries", () => {
    expect(
      readReaderPositionAnchor({
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 0,
        xRatio: 0,
        yRatio: 0,
      }),
    ).toEqual({
      kind: READER_ANCHOR_KIND_PDF_POSITION,
      pageIndex: 0,
      xRatio: 0,
      yRatio: 0,
    })
    expect(
      readReaderPositionAnchor({
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 9,
        xRatio: 1,
        yRatio: 1,
      }),
    ).toEqual({
      kind: READER_ANCHOR_KIND_PDF_POSITION,
      pageIndex: 9,
      xRatio: 1,
      yRatio: 1,
    })
  })

  test("rejects invalid PDF page indexes and position ratios", () => {
    const invalidAnchors: unknown[] = [
      {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: -1,
        xRatio: 0.5,
        yRatio: 0.5,
      },
      {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 1.5,
        xRatio: 0.5,
        yRatio: 0.5,
      },
      {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: Number.POSITIVE_INFINITY,
        xRatio: 0.5,
        yRatio: 0.5,
      },
      { kind: READER_ANCHOR_KIND_PDF_POSITION, pageIndex: 1, xRatio: 0.5, yRatio: -0.01 },
      { kind: READER_ANCHOR_KIND_PDF_POSITION, pageIndex: 1, xRatio: 0.5, yRatio: 1.01 },
      {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 1,
        xRatio: 0.5,
        yRatio: Number.NaN,
      },
      {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 1,
        xRatio: 0.5,
        yRatio: Number.NEGATIVE_INFINITY,
      },
      { kind: READER_ANCHOR_KIND_PDF_POSITION, pageIndex: 1, xRatio: -0.01, yRatio: 0.5 },
      { kind: READER_ANCHOR_KIND_PDF_POSITION, pageIndex: 1, xRatio: 1.01, yRatio: 0.5 },
      {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 1,
        xRatio: Number.NaN,
        yRatio: 0.5,
      },
      {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 1,
        xRatio: Number.POSITIVE_INFINITY,
        yRatio: 0.5,
      },
      { kind: READER_ANCHOR_KIND_PDF_POSITION, pageIndex: 1, yRatio: 0.5 },
    ]

    for (const anchor of invalidAnchors) {
      expect(readReaderPositionAnchor(anchor)).toBeUndefined()
    }
  })
})

describe("reader text anchors", () => {
  test("parses CFI text anchors", () => {
    expect(
      readReaderTextAnchor({
        kind: READER_ANCHOR_KIND_CFI_TEXT,
        cfi: CFI,
        sectionIndex: 4,
      }),
    ).toEqual({ kind: READER_ANCHOR_KIND_CFI_TEXT, cfi: CFI, sectionIndex: 4 })
  })

  test("rejects malformed CFI text anchors", () => {
    const invalidAnchors: unknown[] = [
      { kind: READER_ANCHOR_KIND_CFI_TEXT, cfi: "" },
      { kind: READER_ANCHOR_KIND_CFI_TEXT, cfi: 42 },
      {
        kind: READER_ANCHOR_KIND_CFI_TEXT,
        cfi: "x".repeat(CFI_MAXIMUM_LENGTH + 1),
      },
      { kind: READER_ANCHOR_KIND_CFI_TEXT, cfi: CFI, sectionIndex: -1 },
      { kind: READER_ANCHOR_KIND_CFI_TEXT, cfi: CFI, sectionIndex: 0.5 },
    ]

    for (const anchor of invalidAnchors) {
      expect(readReaderTextAnchor(anchor)).toBeUndefined()
    }
  })

  test("parses multi-page PDF text geometry and quote context", () => {
    const anchor = createPdfTextAnchor()

    expect(readReaderTextAnchor(anchor)).toEqual(anchor)
  })

  test("rejects missing, empty, and excessive PDF text segments", () => {
    expect(
      readReaderTextAnchor({
        kind: READER_ANCHOR_KIND_PDF_TEXT,
        segments: [],
        quote: { exact: "Text" },
      }),
    ).toBeUndefined()
    expect(
      readReaderTextAnchor({
        kind: READER_ANCHOR_KIND_PDF_TEXT,
        segments: Array.from({ length: MAX_PDF_TEXT_SEGMENTS + 1 }, (_, pageIndex) => ({
          pageIndex,
          quads: [],
        })),
        quote: { exact: "Text" },
      }),
    ).toBeUndefined()
  })

  test("rejects invalid PDF segment offsets and page indexes", () => {
    const invalidSegments: unknown[] = [
      { pageIndex: -1, quads: [createQuad()] },
      { pageIndex: 0.5, quads: [createQuad()] },
      { pageIndex: 0, quads: [createQuad()], startOffset: -1 },
      { pageIndex: 0, quads: [createQuad()], endOffset: 1.5 },
      { pageIndex: 0, quads: [createQuad()], startOffset: 8, endOffset: 7 },
      { pageIndex: 0, quads: "not-quads" },
    ]

    for (const segment of invalidSegments) {
      expect(
        readReaderTextAnchor({
          kind: READER_ANCHOR_KIND_PDF_TEXT,
          segments: [segment],
          quote: { exact: "Text" },
        }),
      ).toBeUndefined()
    }
  })

  test("rejects malformed and excessive PDF quads", () => {
    const malformedQuad = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomRight: { x: 1, y: 1 },
    }
    const invalidSegments: unknown[] = [
      { pageIndex: 0, quads: [malformedQuad] },
      {
        pageIndex: 0,
        quads: Array.from(
          { length: MAX_PDF_QUADS_PER_SEGMENT + 1 },
          () => createQuad(),
        ),
      },
    ]

    for (const segment of invalidSegments) {
      expect(
        readReaderTextAnchor({
          kind: READER_ANCHOR_KIND_PDF_TEXT,
          segments: [segment],
          quote: { exact: "Text" },
        }),
      ).toBeUndefined()
    }
  })

  test("rejects non-finite and out-of-range PDF geometry", () => {
    const invalidCoordinates = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      PDF_COORDINATE_MAXIMUM_ABSOLUTE_VALUE + 1,
      -PDF_COORDINATE_MAXIMUM_ABSOLUTE_VALUE - 1,
    ]

    for (const x of invalidCoordinates) {
      expect(
        readReaderTextAnchor({
          kind: READER_ANCHOR_KIND_PDF_TEXT,
          segments: [
            {
              pageIndex: 0,
              quads: [
                {
                  ...createQuad(),
                  topLeft: { x, y: 0 },
                },
              ],
            },
          ],
          quote: { exact: "Text" },
        }),
      ).toBeUndefined()
    }
  })

  test("accepts PDF coordinates at the supported absolute boundary", () => {
    const anchor = {
      kind: READER_ANCHOR_KIND_PDF_TEXT,
      segments: [
        {
          pageIndex: 0,
          quads: [
            {
              topLeft: {
                x: -PDF_COORDINATE_MAXIMUM_ABSOLUTE_VALUE,
                y: PDF_COORDINATE_MAXIMUM_ABSOLUTE_VALUE,
              },
              topRight: { x: 0, y: 0 },
              bottomRight: { x: 1, y: 1 },
              bottomLeft: { x: -1, y: 1 },
            },
          ],
        },
      ],
      quote: { exact: "Text" },
    }

    expect(readReaderTextAnchor(anchor)).toEqual(anchor)
  })

  test("rejects invalid PDF quote and context lengths", () => {
    const segment = { pageIndex: 0, quads: [createQuad()] }
    const invalidQuotes: unknown[] = [
      {},
      { exact: "" },
      { exact: 42 },
      { exact: "x".repeat(MAX_PDF_QUOTE_LENGTH + 1) },
      { exact: "Text", prefix: "x".repeat(PDF_QUOTE_CONTEXT_MAXIMUM_LENGTH + 1) },
      { exact: "Text", suffix: "x".repeat(PDF_QUOTE_CONTEXT_MAXIMUM_LENGTH + 1) },
    ]

    for (const quote of invalidQuotes) {
      expect(
        readReaderTextAnchor({
          kind: READER_ANCHOR_KIND_PDF_TEXT,
          segments: [segment],
          quote,
        }),
      ).toBeUndefined()
    }
  })
})

describe("reader anchor identity", () => {
  test("compares CFI and PDF position anchors by their complete identity", () => {
    const cfi = legacyCfiPositionAnchor(CFI, 2)
    const sameCfi = legacyCfiPositionAnchor(CFI, 2)
    const otherSection = legacyCfiPositionAnchor(CFI, 3)
    const pdf: PdfPositionAnchor = {
      kind: READER_ANCHOR_KIND_PDF_POSITION,
      pageIndex: 2,
      xRatio: 0.25,
      yRatio: 0.5,
    }
    const samePdf: PdfPositionAnchor = {
      kind: READER_ANCHOR_KIND_PDF_POSITION,
      pageIndex: 2,
      xRatio: 0.25,
      yRatio: 0.5,
    }
    const otherRatio: PdfPositionAnchor = {
      kind: READER_ANCHOR_KIND_PDF_POSITION,
      pageIndex: 2,
      xRatio: 0.25,
      yRatio: 0.6,
    }
    const otherHorizontalRatio: PdfPositionAnchor = {
      kind: READER_ANCHOR_KIND_PDF_POSITION,
      pageIndex: 2,
      xRatio: 0.75,
      yRatio: 0.5,
    }

    expect(readerPositionAnchorEquals(cfi, sameCfi)).toBe(true)
    expect(readerPositionAnchorEquals(cfi, otherSection)).toBe(false)
    expect(readerPositionAnchorEquals(cfi, pdf)).toBe(false)
    expect(readerPositionAnchorEquals(pdf, samePdf)).toBe(true)
    expect(readerPositionAnchorEquals(pdf, otherRatio)).toBe(false)
    expect(readerPositionAnchorEquals(pdf, otherHorizontalRatio)).toBe(false)
  })

  test("builds stable CFI text keys with section identity", () => {
    const anchor = legacyCfiTextAnchor(CFI, 7)

    expect(readerTextAnchorKey(anchor)).toBe(`${READER_ANCHOR_KIND_CFI_TEXT}:7:${CFI}`)
    expect(readerTextAnchorEquals(anchor, legacyCfiTextAnchor(CFI, 7))).toBe(true)
    expect(readerTextAnchorEquals(anchor, legacyCfiTextAnchor(CFI, 8))).toBe(false)
    expect(readerTextAnchorEquals(anchor, legacyCfiTextAnchor(OTHER_CFI, 7))).toBe(false)
  })

  test("keys PDF text anchors by geometry, offsets, and exact quote", () => {
    const anchor = createPdfTextAnchor()
    const sameAnchor = createPdfTextAnchor()
    const contextChanged = {
      ...createPdfTextAnchor(),
      quote: { exact: "Selected text", prefix: "Different context" },
    }
    const geometryChanged = createPdfTextAnchor()
    geometryChanged.segments[0] = {
      ...geometryChanged.segments[0],
      quads: [createQuad(1)],
    }
    const quoteChanged = {
      ...createPdfTextAnchor(),
      quote: { exact: "Different text" },
    }

    expect(readerTextAnchorKey(anchor)).toBe(readerTextAnchorKey(sameAnchor))
    expect(readerTextAnchorEquals(anchor, sameAnchor)).toBe(true)
    expect(readerTextAnchorEquals(anchor, contextChanged)).toBe(true)
    expect(readerTextAnchorEquals(anchor, geometryChanged)).toBe(false)
    expect(readerTextAnchorEquals(anchor, quoteChanged)).toBe(false)
  })
})

describe("legacy CFI conversion", () => {
  test("creates position and text anchors with optional section indexes", () => {
    expect(legacyCfiPositionAnchor(CFI)).toEqual({
      kind: READER_ANCHOR_KIND_CFI_POSITION,
      cfi: CFI,
    })
    expect(legacyCfiPositionAnchor(CFI, 5)).toEqual({
      kind: READER_ANCHOR_KIND_CFI_POSITION,
      cfi: CFI,
      sectionIndex: 5,
    })
    expect(legacyCfiTextAnchor(CFI)).toEqual({
      kind: READER_ANCHOR_KIND_CFI_TEXT,
      cfi: CFI,
    })
    expect(legacyCfiTextAnchor(CFI, 5)).toEqual({
      kind: READER_ANCHOR_KIND_CFI_TEXT,
      cfi: CFI,
      sectionIndex: 5,
    })
  })
})

describe("reader locations", () => {
  test("parses CFI and PDF locations with optional display metadata", () => {
    expect(
      readReaderLocation({
        anchor: legacyCfiPositionAnchor(CFI, 2),
        fraction: 0,
        tocLabel: "Chapter 1",
        pageLabel: "xii",
        locationLabel: "Location 1 / 20",
        ignored: true,
      }),
    ).toEqual({
      anchor: legacyCfiPositionAnchor(CFI, 2),
      fraction: 0,
      tocLabel: "Chapter 1",
      pageLabel: "xii",
      locationLabel: "Location 1 / 20",
    })
    expect(
      readReaderLocation({
        anchor: {
          kind: READER_ANCHOR_KIND_PDF_POSITION,
          pageIndex: 4,
          xRatio: 0.25,
          yRatio: 0.75,
        },
        fraction: 1,
      }),
    ).toEqual({
      anchor: {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 4,
        xRatio: 0.25,
        yRatio: 0.75,
      },
      fraction: 1,
    })
  })

  test("rejects invalid locations, fractions, and labels", () => {
    const validAnchor = legacyCfiPositionAnchor(CFI)
    const invalidLocations: unknown[] = [
      null,
      {},
      { anchor: { kind: "unknown" } },
      { anchor: validAnchor, fraction: -0.01 },
      { anchor: validAnchor, fraction: 1.01 },
      { anchor: validAnchor, fraction: Number.NaN },
      { anchor: validAnchor, fraction: Number.POSITIVE_INFINITY },
      { anchor: validAnchor, tocLabel: 42 },
      { anchor: validAnchor, pageLabel: "x".repeat(PDF_QUOTE_CONTEXT_MAXIMUM_LENGTH + 1) },
      {
        anchor: validAnchor,
        locationLabel: "x".repeat(PDF_QUOTE_CONTEXT_MAXIMUM_LENGTH + 1),
      },
    ]

    for (const location of invalidLocations) {
      expect(readReaderLocation(location)).toBeUndefined()
    }
  })
})

describe("reader position formatting", () => {
  test("formats CFI and PDF positions and reports their indexes", () => {
    const cfiWithoutIndex = legacyCfiPositionAnchor(CFI)
    const cfiWithIndex = legacyCfiPositionAnchor(CFI, 8)
    const pdf: PdfPositionAnchor = {
      kind: READER_ANCHOR_KIND_PDF_POSITION,
      pageIndex: 4,
      xRatio: 0.125,
      yRatio: 0.456,
    }

    expect(formatReaderPositionAnchor(cfiWithoutIndex)).toBe(`CFI ${CFI}`)
    expect(formatReaderPositionAnchor(pdf)).toBe("Page 5, 13% across, 46% down")
    expect(formatReaderPositionAnchor(pdf, "  iv  ")).toBe("Page iv, 13% across, 46% down")
    expect(formatReaderPositionAnchor(pdf, "   ")).toBe("Page 5, 13% across, 46% down")
    expect(readerPositionIndex(cfiWithoutIndex)).toBeUndefined()
    expect(readerPositionIndex(cfiWithIndex)).toBe(8)
    expect(readerPositionIndex(pdf)).toBe(4)
  })
})

describe("reader external links", () => {
  test("allows only explicit web and email protocols", () => {
    expect(readReaderExternalLink("https://example.com/chapter?q=1")).toBe(
      "https://example.com/chapter?q=1",
    )
    expect(readReaderExternalLink("mailto:reader@example.com")).toBe(
      "mailto:reader@example.com",
    )
    expect(readReaderExternalLink("file:///Users/reader/private.txt")).toBeUndefined()
    expect(readReaderExternalLink("example-handler://run/action")).toBeUndefined()
    expect(readReaderExternalLink("/relative/chapter.xhtml")).toBeUndefined()
  })

  test("supports a wider explicit allow-list for the desktop boundary", () => {
    expect(readAllowedExternalLink("obsidian://open?vault=Notes", ["obsidian:"])).toBe(
      "obsidian://open?vault=Notes",
    )
    expect(readAllowedExternalLink({ href: "https://example.com" }, ["https:"])).toBeUndefined()
  })
})
