import { access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { PageComplexityStats, ParsedPage } from "@llamaindex/liteparse"
import { BUDDY_ENV } from "../../storage"

const ENGLISH_TESSDATA_FILENAME = "eng.traineddata" as const
const LITEPARSE_EXTRACTOR = "@llamaindex/liteparse" as const
const LITEPARSE_OCR_LANGUAGE = "eng" as const
const LITEPARSE_WORKER_COUNT = 1

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))

export type LiteParsePdfExtraction = {
  extractor: typeof LITEPARSE_EXTRACTOR
  pageTexts: string[]
  warnings: string[]
}

export type LiteParsePdfParseOptions = {
  ocrEnabled: boolean
  targetPages?: number[]
}

export async function extractPdfWithLiteParse(
  sourcePath: string,
  options: LiteParsePdfParseOptions = {
    ocrEnabled: true,
  },
): Promise<LiteParsePdfExtraction> {
  const pages = await parsePdfPagesWithLiteParse(sourcePath, options)
  return buildLiteParsePdfExtraction(pages)
}

export async function parsePdfPagesWithLiteParse(
  sourcePath: string,
  options: LiteParsePdfParseOptions,
): Promise<ParsedPage[]> {
  const tessdataPath = options.ocrEnabled
    ? await resolveLiteParseTessdataDirectory()
    : undefined
  const { LiteParse } = await import("@llamaindex/liteparse")
  const parser = new LiteParse({
    imageMode: "off",
    numWorkers: LITEPARSE_WORKER_COUNT,
    ocrEnabled: options.ocrEnabled,
    ocrLanguage: LITEPARSE_OCR_LANGUAGE,
    outputFormat: "json",
    quiet: true,
    tessdataPath,
    targetPages: formatLiteParseTargetPages(options.targetPages),
  })
  const result = await parser.parse(sourcePath)
  return result.pages
}

export async function analyzePdfComplexityWithLiteParse(
  sourcePath: string,
): Promise<PageComplexityStats[]> {
  const { LiteParse } = await import("@llamaindex/liteparse")
  const parser = new LiteParse({
    imageMode: "off",
    numWorkers: LITEPARSE_WORKER_COUNT,
    ocrEnabled: false,
    outputFormat: "json",
    quiet: true,
  })
  return await parser.isComplex(sourcePath)
}

export function buildLiteParsePdfExtraction(
  pages: ParsedPage[],
): LiteParsePdfExtraction {
  const pageTexts = normalizePageTexts(pages)
  const extractedCharacters = pageTexts.reduce(
    (total, pageText) => total + pageText.replace(/\s+/g, "").length,
    0,
  )
  if (pageTexts.length === 0 || extractedCharacters === 0) {
    throw new Error("LiteParse returned no usable PDF text.")
  }

  const emptyPageCount = pageTexts.filter((pageText) => pageText.trim().length === 0).length
  return {
    extractor: LITEPARSE_EXTRACTOR,
    pageTexts,
    warnings:
      emptyPageCount > 0
        ? [`LiteParse returned ${emptyPageCount} PDF page(s) without text.`]
        : [],
  }
}

export function formatLiteParseTargetPages(pageNumbers: number[] | undefined): string | undefined {
  if (!pageNumbers || pageNumbers.length === 0) return undefined

  const orderedPages = [...new Set(pageNumbers)].toSorted((left, right) => left - right)
  const ranges: string[] = []
  let rangeStart = orderedPages[0]
  let previousPage = orderedPages[0]

  for (const pageNumber of orderedPages.slice(1)) {
    if (pageNumber === previousPage + 1) {
      previousPage = pageNumber
      continue
    }
    ranges.push(formatPageRange(rangeStart, previousPage))
    rangeStart = pageNumber
    previousPage = pageNumber
  }

  ranges.push(formatPageRange(rangeStart, previousPage))
  return ranges.join(",")
}

export async function resolveLiteParseTessdataDirectory(): Promise<string> {
  const configuredDirectory = process.env[BUDDY_ENV.TESSDATA_DIR]?.trim()
  const candidates = [
    ...(configuredDirectory ? [path.resolve(configuredDirectory)] : []),
    path.resolve(MODULE_DIRECTORY, "resources", "tessdata"),
    path.resolve(MODULE_DIRECTORY, "../../../resources/tessdata"),
    path.resolve(process.cwd(), "packages/buddy/resources/tessdata"),
    path.resolve(process.cwd(), "resources/tessdata"),
  ]

  for (const candidate of new Set(candidates)) {
    if (await fileExists(path.join(candidate, ENGLISH_TESSDATA_FILENAME))) {
      return candidate
    }
  }

  throw new Error(
    `Buddy English OCR data is missing. Expected ${ENGLISH_TESSDATA_FILENAME} in: ${candidates.join(", ")}`,
  )
}

function normalizePageTexts(pages: ParsedPage[]): string[] {
  const orderedPages = pages.toSorted((left, right) => left.pageNum - right.pageNum)
  const lastPageNumber = orderedPages.at(-1)?.pageNum
  if (
    lastPageNumber === undefined ||
    !Number.isInteger(lastPageNumber) ||
    lastPageNumber < 1
  ) {
    return []
  }

  const pageTexts = Array.from({ length: lastPageNumber }, () => "")
  for (const page of orderedPages) {
    if (!isValidPageNumber(page.pageNum, pageTexts.length)) {
      throw new Error(`LiteParse returned invalid PDF page number ${page.pageNum}.`)
    }
    pageTexts[page.pageNum - 1] = page.text.trim()
  }
  return pageTexts
}

function isValidPageNumber(pageNumber: number, pageCount: number): boolean {
  return Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount
}

function formatPageRange(start: number, end: number): string {
  return start === end ? String(start) : `${start}-${end}`
}

async function fileExists(filePath: string): Promise<boolean> {
  return await access(filePath).then(
    () => true,
    () => false,
  )
}
