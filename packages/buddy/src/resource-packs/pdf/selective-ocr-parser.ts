import type { PageComplexityStats, ParsedPage } from "@llamaindex/liteparse"
import {
  analyzePdfComplexityWithLiteParse,
  buildLiteParsePdfExtraction,
  parsePdfPagesWithLiteParse,
  type LiteParsePdfExtraction,
} from "./liteparse-parser"

const OCR_REASON_SCANNED = "scanned" as const
const OCR_REASON_NO_TEXT = "no-text" as const
const OCR_REASON_SPARSE_TEXT = "sparse-text" as const
const OCR_REASON_GARBLED = "garbled" as const
const OCR_REASON_VECTOR_TEXT = "vector-text" as const
const OCR_REASON_UNKNOWN = "unknown" as const
const SPARSE_TEXT_OCR_MAX_NATIVE_CHARACTERS = 200
const VECTOR_TEXT_OCR_MAX_NATIVE_CHARACTERS = 500
const VECTOR_TEXT_OCR_LOW_COVERAGE_MAX_NATIVE_CHARACTERS = 1_000
const VECTOR_TEXT_OCR_MAX_TEXT_COVERAGE = 0.05
const NATIVE_TEXT_USABLE_MIN_CHARS = 200
const NATIVE_TEXT_USABLE_CHARS_PER_PAGE = 50
const NATIVE_TEXT_USABLE_MAX_CHARS = 10_000
export const PDF_AUTOMATIC_OCR_PAGE_BUDGET = 10

const STRONG_OCR_REASONS: ReadonlySet<string> = new Set([
  OCR_REASON_SCANNED,
  OCR_REASON_NO_TEXT,
  OCR_REASON_GARBLED,
])

export type PdfOcrReasonCount = {
  reason: string
  count: number
}

export type PdfSkippedOcrSummary = {
  pageCount: number
  reasons: PdfOcrReasonCount[]
}

export async function extractPdfWithSelectiveOcr(
  sourcePath: string,
): Promise<LiteParsePdfExtraction> {
  const [complexity, nativePages] = await Promise.all([
    analyzePdfComplexityWithLiteParse(sourcePath),
    parsePdfPagesWithLiteParse(sourcePath, {
      ocrEnabled: false,
    }),
  ])
  const ocrPageNumbers = selectPdfPagesForOcr(complexity)
  if (ocrPageNumbers.length === 0) {
    return buildLiteParsePdfExtraction(nativePages)
  }
  if (ocrPageNumbers.length > PDF_AUTOMATIC_OCR_PAGE_BUDGET) {
    return buildNativeExtractionWithSkippedOcrWarning(
      nativePages,
      summarizeSkippedOcrPages(complexity, ocrPageNumbers),
    )
  }

  const ocrPages = await parsePdfPagesWithLiteParse(sourcePath, {
    ocrEnabled: true,
    targetPages: ocrPageNumbers,
  })
  return buildLiteParsePdfExtraction(mergeParsedPages(nativePages, ocrPages))
}

export function buildNativeExtractionWithSkippedOcrWarning(
  nativePages: ParsedPage[],
  skippedOcr: PdfSkippedOcrSummary,
): LiteParsePdfExtraction {
  if (!hasUsableNativeTextForSkippedOcr(nativePages)) {
    throw new Error(skippedOcrWithoutUsableNativeTextWarning(skippedOcr))
  }
  const extraction = buildLiteParsePdfExtraction(nativePages)
  return {
    ...extraction,
    warnings: [...extraction.warnings, skippedOcrWarning(skippedOcr)],
  }
}

export function skippedOcrWarning(skippedOcr: PdfSkippedOcrSummary): string {
  return [
    `OCR was skipped for ${skippedOcr.pageCount} PDF page(s) because automatic OCR is currently limited to ${PDF_AUTOMATIC_OCR_PAGE_BUDGET} page(s).`,
    `Skipped OCR reasons: ${formatReasonCounts(skippedOcr.reasons)}.`,
    "Native PDF text was prepared where available, but scanned/image-only pages may be missing text.",
  ].join(" ")
}

export function skippedOcrWithoutUsableNativeTextWarning(
  skippedOcr: PdfSkippedOcrSummary,
): string {
  return [
    `OCR was not run for ${skippedOcr.pageCount} PDF page(s) because automatic OCR is currently limited to ${PDF_AUTOMATIC_OCR_PAGE_BUDGET} page(s).`,
    `Skipped OCR reasons: ${formatReasonCounts(skippedOcr.reasons)}.`,
    "Native PDF text was not usable without OCR.",
  ].join(" ")
}

export function summarizeSkippedOcrPages(
  complexity: PageComplexityStats[],
  pageNumbers: number[],
): PdfSkippedOcrSummary {
  const skippedPages = new Set(pageNumbers)
  const reasonCounts = new Map<string, number>()
  for (const page of complexity) {
    if (!skippedPages.has(page.pageNumber)) continue
    const reasonGroup =
      page.reasons.length === 0 ? OCR_REASON_UNKNOWN : page.reasons.toSorted().join("+")
    reasonCounts.set(reasonGroup, (reasonCounts.get(reasonGroup) ?? 0) + 1)
  }
  return {
    pageCount: pageNumbers.length,
    reasons: [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .toSorted((left, right) => left.reason.localeCompare(right.reason)),
  }
}

export function selectPdfPagesForOcr(complexity: PageComplexityStats[]): number[] {
  return complexity
    .filter(shouldOcrPage)
    .map((page) => page.pageNumber)
    .toSorted((left, right) => left - right)
}

function shouldOcrPage(page: PageComplexityStats): boolean {
  if (page.reasons.some((reason) => STRONG_OCR_REASONS.has(reason))) {
    return true
  }

  if (
    page.reasons.includes(OCR_REASON_SPARSE_TEXT) &&
    (page.fullPageImage || page.textLength < SPARSE_TEXT_OCR_MAX_NATIVE_CHARACTERS)
  ) {
    return true
  }

  return (
    page.reasons.includes(OCR_REASON_VECTOR_TEXT) &&
    (page.textLength < VECTOR_TEXT_OCR_MAX_NATIVE_CHARACTERS ||
      (page.textLength < VECTOR_TEXT_OCR_LOW_COVERAGE_MAX_NATIVE_CHARACTERS &&
        page.textCoverage < VECTOR_TEXT_OCR_MAX_TEXT_COVERAGE))
  )
}

function hasUsableNativeTextForSkippedOcr(nativePages: ParsedPage[]): boolean {
  const pageCount = nativePages.length
  if (pageCount === 0) return false
  const nativeTextCharacters = nativePages.reduce(
    (total, page) => total + page.text.replace(/\s+/g, "").length,
    0,
  )
  const requiredCharacters = Math.min(
    NATIVE_TEXT_USABLE_MAX_CHARS,
    Math.max(NATIVE_TEXT_USABLE_MIN_CHARS, pageCount * NATIVE_TEXT_USABLE_CHARS_PER_PAGE),
  )
  return nativeTextCharacters >= requiredCharacters
}

function formatReasonCounts(reasonCounts: PdfOcrReasonCount[]): string {
  if (reasonCounts.length === 0) return "none"
  return reasonCounts.map((reasonCount) => `${reasonCount.reason}=${reasonCount.count}`).join(", ")
}

function mergeParsedPages(nativePages: ParsedPage[], ocrPages: ParsedPage[]): ParsedPage[] {
  const pagesByNumber = new Map(nativePages.map((page) => [page.pageNum, page]))
  for (const page of ocrPages) {
    if (!pagesByNumber.has(page.pageNum)) {
      throw new Error(`LiteParse returned unexpected targeted OCR page ${page.pageNum}.`)
    }
    pagesByNumber.set(page.pageNum, page)
  }
  return [...pagesByNumber.values()].toSorted((left, right) => left.pageNum - right.pageNum)
}
