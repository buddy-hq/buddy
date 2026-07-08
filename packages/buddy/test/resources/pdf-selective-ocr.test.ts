import { describe, expect, test } from "bun:test"
import type { PageComplexityStats, ParsedPage } from "@llamaindex/liteparse"
import { formatLiteParseTargetPages } from "../../src/resource-packs/pdf/liteparse-parser"
import {
  buildNativeExtractionWithSkippedOcrWarning,
  PDF_AUTOMATIC_OCR_PAGE_BUDGET,
  selectPdfPagesForOcr,
  skippedOcrWithoutUsableNativeTextWarning,
  skippedOcrWarning,
  summarizeSkippedOcrPages,
} from "../../src/resource-packs/pdf/selective-ocr-parser"

describe("PDF selective OCR", () => {
  test("selects strong missing-text signals and ignores embedded images alone", () => {
    const pages = [
      pageComplexity({ pageNumber: 1, reasons: ["embedded-images"], textLength: 1_500 }),
      pageComplexity({ pageNumber: 2, reasons: ["scanned"], textLength: 0 }),
      pageComplexity({ pageNumber: 3, reasons: ["garbled"], textLength: 800 }),
      pageComplexity({ pageNumber: 4, reasons: ["no-text"], textLength: 0 }),
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

  test("only selects vector text when native text is weak", () => {
    const pages = [
      pageComplexity({ pageNumber: 1, reasons: ["vector-text"], textLength: 499 }),
      pageComplexity({
        pageNumber: 2,
        reasons: ["vector-text"],
        textLength: 500,
        textCoverage: 0.04,
      }),
      pageComplexity({
        pageNumber: 3,
        reasons: ["vector-text"],
        textLength: 999,
        textCoverage: 0.04,
      }),
      pageComplexity({
        pageNumber: 4,
        reasons: ["vector-text"],
        textLength: 999,
        textCoverage: 0.05,
      }),
      pageComplexity({
        pageNumber: 5,
        reasons: ["vector-text"],
        textLength: 1_000,
        textCoverage: 0.04,
      }),
      pageComplexity({
        pageNumber: 6,
        reasons: ["vector-text"],
        textLength: 2_500,
        textCoverage: 0.3,
      }),
    ]

    expect(selectPdfPagesForOcr(pages)).toEqual([1, 2, 3])
  })

  test("formats targeted pages as compact LiteParse ranges", () => {
    expect(formatLiteParseTargetPages([7, 2, 3, 4, 7, 10])).toBe("2-4,7,10")
    expect(formatLiteParseTargetPages([])).toBeUndefined()
  })

  test("keeps native text and warns when the automatic OCR budget is exceeded", () => {
    const skippedPageCount = PDF_AUTOMATIC_OCR_PAGE_BUDGET + 1
    const skippedOcr = {
      pageCount: skippedPageCount,
      reasons: [{ reason: "sparse-text", count: skippedPageCount }],
    }
    const extraction = buildNativeExtractionWithSkippedOcrWarning(
      [parsedPage({ pageNumber: 1, text: "NativeText".repeat(30) })],
      skippedOcr,
    )

    expect(extraction.pageTexts).toEqual(["NativeText".repeat(30)])
    expect(extraction.warnings).toEqual([skippedOcrWarning(skippedOcr)])
  })

  test("explains over-budget OCR when native text is not usable", () => {
    const skippedPageCount = PDF_AUTOMATIC_OCR_PAGE_BUDGET + 1
    const skippedOcr = {
      pageCount: skippedPageCount,
      reasons: [{ reason: "scanned", count: skippedPageCount }],
    }

    expect(() =>
      buildNativeExtractionWithSkippedOcrWarning(
        [parsedPage({ pageNumber: 1, text: "" })],
        skippedOcr,
      ),
    ).toThrow(skippedOcrWithoutUsableNativeTextWarning(skippedOcr))
  })

  test("summarizes skipped OCR reasons for selected pages", () => {
    const pages = [
      pageComplexity({ pageNumber: 1, reasons: ["scanned"], textLength: 0 }),
      pageComplexity({ pageNumber: 2, reasons: ["vector-text"], textLength: 0 }),
      pageComplexity({ pageNumber: 3, reasons: ["vector-text"], textLength: 0 }),
      pageComplexity({ pageNumber: 4, reasons: ["embedded-images"], textLength: 1_000 }),
    ]

    expect(summarizeSkippedOcrPages(pages, [1, 2, 3])).toEqual({
      pageCount: 3,
      reasons: [
        { reason: "scanned", count: 1 },
        { reason: "vector-text", count: 2 },
      ],
    })
  })

  test("summarizes skipped OCR reason groups for multi-signal pages", () => {
    const pages = [
      pageComplexity({
        pageNumber: 1,
        reasons: ["sparse-text", "embedded-images"],
        textLength: 100,
      }),
      pageComplexity({
        pageNumber: 2,
        reasons: ["sparse-text", "embedded-images"],
        textLength: 100,
      }),
      pageComplexity({ pageNumber: 3, reasons: ["sparse-text"], textLength: 100 }),
    ]

    expect(summarizeSkippedOcrPages(pages, [1, 2, 3])).toEqual({
      pageCount: 3,
      reasons: [
        { reason: "embedded-images+sparse-text", count: 2 },
        { reason: "sparse-text", count: 1 },
      ],
    })
  })
})

function pageComplexity(input: {
  pageNumber: number
  reasons: string[]
  textLength: number
  fullPageImage?: boolean
  textCoverage?: number
}): PageComplexityStats {
  return {
    pageNumber: input.pageNumber,
    textLength: input.textLength,
    textCoverage: input.textCoverage ?? 0,
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

function parsedPage(input: { pageNumber: number; text: string }): ParsedPage {
  return {
    pageNum: input.pageNumber,
    width: 100,
    height: 100,
    text: input.text,
    markdown: input.text,
    textItems: [],
  }
}
