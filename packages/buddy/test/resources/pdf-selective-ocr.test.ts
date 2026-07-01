import { describe, expect, test } from "bun:test"
import type { PageComplexityStats } from "@llamaindex/liteparse"
import { formatLiteParseTargetPages } from "../../src/resource-packs/pdf/liteparse-parser"
import { selectPdfPagesForOcr } from "../../src/resource-packs/pdf/selective-ocr-parser"

describe("PDF selective OCR", () => {
  test("selects strong missing-text signals and ignores embedded images alone", () => {
    const pages = [
      pageComplexity({ pageNumber: 1, reasons: ["embedded-images"], textLength: 1_500 }),
      pageComplexity({ pageNumber: 2, reasons: ["scanned"], textLength: 0 }),
      pageComplexity({ pageNumber: 3, reasons: ["garbled"], textLength: 800 }),
      pageComplexity({ pageNumber: 4, reasons: ["vector-text"], textLength: 0 }),
    ]

    expect(selectPdfPagesForOcr(pages)).toEqual([2, 3, 4])
  })

  test("only selects sparse text when native text is extremely limited", () => {
    const pages = [
      pageComplexity({ pageNumber: 1, reasons: ["sparse-text"], textLength: 199 }),
      pageComplexity({ pageNumber: 2, reasons: ["sparse-text"], textLength: 200 }),
      pageComplexity({
        pageNumber: 3,
        reasons: ["sparse-text"],
        textLength: 500,
        fullPageImage: true,
      }),
    ]

    expect(selectPdfPagesForOcr(pages)).toEqual([1, 3])
  })

  test("formats targeted pages as compact LiteParse ranges", () => {
    expect(formatLiteParseTargetPages([7, 2, 3, 4, 7, 10])).toBe("2-4,7,10")
    expect(formatLiteParseTargetPages([])).toBeUndefined()
  })
})

function pageComplexity(input: {
  pageNumber: number
  reasons: string[]
  textLength: number
  fullPageImage?: boolean
}): PageComplexityStats {
  return {
    pageNumber: input.pageNumber,
    textLength: input.textLength,
    textCoverage: 0,
    hasSubstantialImages: input.reasons.includes("embedded-images"),
    imageBlockCount: 0,
    imageCoverage: 0,
    largestImageCoverage: 0,
    fullPageImage: input.fullPageImage ?? false,
    isGarbled: input.reasons.includes("garbled"),
    pageArea: 1,
    needsOcr: input.reasons.length > 0,
    reasons: input.reasons,
  }
}
