import { describe, expect, test } from "bun:test"
import type { PdfTextAnchor } from "@buddy/reader-contract"
import {
  pdfCurrentPassageText,
  pdfTextAnchorFromOffsets,
  readPdfPageText,
  repairPdfTextAnchor,
} from "../src/components/readers/pdf/pdf-page-text"

const CROP_BOX = { xMin: 0, yMin: 0, xMax: 200, yMax: 200 }

function textItem(input: {
  text: string
  x: number
  y: number
  width: number
  height?: number
  direction?: "ltr" | "rtl" | "ttb"
  hasEndOfLine?: boolean
}) {
  return {
    str: input.text,
    dir: input.direction ?? "ltr",
    transform: [10, 0, 0, 10, input.x, input.y],
    width: input.width,
    height: input.height ?? 10,
    fontName: "reader-test-font",
    hasEOL: input.hasEndOfLine === true,
  }
}

describe("PDF page text geometry", () => {
  test("maps extracted offsets to crop-relative PDF quads", () => {
    const pageText = readPdfPageText(
      {
        items: [textItem({ text: "Hello Buddy", x: 20, y: 40, width: 110 })],
      },
      CROP_BOX,
    )
    const anchor = pdfTextAnchorFromOffsets({
      pageIndex: 2,
      pageText,
      startOffset: 6,
      endOffset: 11,
      quote: { exact: "Buddy" },
    })

    expect(pageText.text).toBe("Hello Buddy")
    expect(anchor).toMatchObject({
      kind: "pdf-text",
      segments: [
        {
          pageIndex: 2,
          startOffset: 6,
          endOffset: 11,
          quads: [
            {
              topLeft: { x: 80, y: 50 },
              topRight: { x: 130, y: 50 },
              bottomRight: { x: 130, y: 40 },
              bottomLeft: { x: 80, y: 40 },
            },
          ],
        },
      ],
    })
  })

  test("maps logical RTL offsets to the right side of the visual text run", () => {
    const pageText = readPdfPageText(
      {
        items: [
          textItem({
            text: "אבגד",
            x: 20,
            y: 40,
            width: 40,
            direction: "rtl",
          }),
        ],
      },
      CROP_BOX,
    )
    const anchor = pdfTextAnchorFromOffsets({
      pageIndex: 0,
      pageText,
      startOffset: 0,
      endOffset: 2,
      quote: { exact: "אב" },
    })

    expect(anchor?.segments[0]?.quads[0]).toEqual({
      topLeft: { x: 40, y: 50 },
      topRight: { x: 60, y: 50 },
      bottomRight: { x: 60, y: 40 },
      bottomLeft: { x: 40, y: 40 },
    })
  })

  test("maps top-to-bottom offsets from the visual top of a vertical text run", () => {
    const pageText = readPdfPageText(
      {
        items: [
          textItem({
            text: "天地玄黄",
            x: 20,
            y: 40,
            width: 10,
            height: 40,
            direction: "ttb",
          }),
        ],
      },
      CROP_BOX,
    )
    const anchor = pdfTextAnchorFromOffsets({
      pageIndex: 0,
      pageText,
      startOffset: 0,
      endOffset: 2,
      quote: { exact: "天地" },
    })

    expect(anchor?.segments[0]?.quads[0]).toEqual({
      topLeft: { x: 20, y: 80 },
      topRight: { x: 30, y: 80 },
      bottomRight: { x: 30, y: 60 },
      bottomLeft: { x: 20, y: 60 },
    })
  })

  test("derives current passage text from the reader's vertical position", () => {
    const topText = `TOP_MARKER ${"a".repeat(1_500)}`
    const pageText = readPdfPageText(
      {
        items: [
          textItem({ text: topText, x: 10, y: 180, width: 150 }),
          textItem({ text: "BOTTOM_MARKER visible passage", x: 10, y: 20, width: 150 }),
        ],
      },
      CROP_BOX,
    )

    const passage = pdfCurrentPassageText(pageText, { xRatio: 0.05, yRatio: 0.9 })

    expect(passage).toContain("BOTTOM_MARKER visible passage")
    expect(passage).not.toContain("TOP_MARKER")
  })

  test("uses both PDF axes when choosing context for rotated or multi-column pages", () => {
    const leftText = `LEFT_COLUMN ${"l".repeat(1_500)}`
    const pageText = readPdfPageText(
      {
        items: [
          textItem({ text: leftText, x: 10, y: 100, width: 80 }),
          textItem({ text: "RIGHT_COLUMN active text", x: 150, y: 100, width: 40 }),
        ],
      },
      CROP_BOX,
    )

    const passage = pdfCurrentPassageText(pageText, { xRatio: 0.9, yRatio: 0.5 })

    expect(passage).toContain("RIGHT_COLUMN active text")
    expect(passage).not.toContain("LEFT_COLUMN")
  })

  test("repairs a legacy quote-only anchor and uses quote context to disambiguate it", () => {
    const source = "first target then chosen target end"
    const pageText = readPdfPageText(
      { items: [textItem({ text: source, x: 10, y: 100, width: 180 })] },
      CROP_BOX,
    )
    const legacyAnchor: PdfTextAnchor = {
      kind: "pdf-text",
      segments: [{ pageIndex: 0, quads: [] }],
      quote: { exact: "target", prefix: "chosen " },
    }

    const repaired = repairPdfTextAnchor(legacyAnchor, new Map([[0, pageText]]))

    expect(repaired.segments[0]?.quads).toHaveLength(1)
    expect(repaired.segments[0]).toMatchObject({
      startOffset: source.lastIndexOf("target"),
      endOffset: source.lastIndexOf("target") + "target".length,
    })
  })
})
