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
const SPARSE_TEXT_OCR_MAX_NATIVE_CHARACTERS = 200

const STRONG_OCR_REASONS: ReadonlySet<string> = new Set([
  OCR_REASON_SCANNED,
  OCR_REASON_NO_TEXT,
  OCR_REASON_GARBLED,
  OCR_REASON_VECTOR_TEXT,
])

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

  const ocrPages = await parsePdfPagesWithLiteParse(sourcePath, {
    ocrEnabled: true,
    targetPages: ocrPageNumbers,
  })
  return buildLiteParsePdfExtraction(mergeParsedPages(nativePages, ocrPages))
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

  return (
    page.reasons.includes(OCR_REASON_SPARSE_TEXT) &&
    (page.fullPageImage || page.textLength < SPARSE_TEXT_OCR_MAX_NATIVE_CHARACTERS)
  )
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
