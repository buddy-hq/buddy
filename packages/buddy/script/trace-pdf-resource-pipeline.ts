#!/usr/bin/env bun

import { stat } from "node:fs/promises"
import path from "node:path"
import type { PageComplexityStats, ParsedPage } from "@llamaindex/liteparse"
import { isObjectValue, type TJsonObject } from "./parse-values"
import { extractResourcePack } from "../src/resource-packs/extractors"
import {
  analyzePdfComplexityWithLiteParse,
  buildLiteParsePdfExtraction,
  formatLiteParseTargetPages,
  parsePdfPagesWithLiteParse,
} from "../src/resource-packs/pdf/liteparse-parser"
import { selectPdfPagesForOcr } from "../src/resource-packs/pdf/selective-ocr-parser"
import type { ResourceClassification } from "../src/resource-packs/contracts"

const DEFAULT_SOURCE_PATH =
  "/Users/prashantbhudwal/Code/resources/.buddy/objects/v1/resource/01KWFEX2Q2WHZ7W38JFTV48CH8/source/TheHistoryOfWesternEducation - The History Of Western Educatio.pdf" as const
const HEARTBEAT_INTERVAL_MS = 15_000
const BYTES_PER_MIB = 1_048_576
const PDF_CLASSIFICATION = {
  kind: "pack",
  format: "pdf",
  mime: "application/pdf",
} satisfies ResourceClassification

type TraceMode =
  | "selective-pipeline"
  | "complexity"
  | "no-ocr"
  | "ocr-pages"
  | "extract-resource-pack"

type CliOptions = {
  sourcePath: string
  mode: TraceMode
  targetPages?: number[]
}

const options = parseCliOptions(process.argv.slice(2))
await traceSource(options)

async function traceSource(options: CliOptions): Promise<void> {
  const sourceStat = await stat(options.sourcePath)
  trace("source", {
    path: options.sourcePath,
    basename: path.basename(options.sourcePath),
    bytes: sourceStat.size,
    mode: options.mode,
  })

  if (options.mode === "complexity") {
    await traceComplexity(options.sourcePath)
    return
  }

  if (options.mode === "no-ocr") {
    await traceNoOcr(options.sourcePath)
    return
  }

  if (options.mode === "ocr-pages") {
    await traceOcrPages({
      sourcePath: options.sourcePath,
      targetPages: requireTargetPages(options.targetPages),
    })
    return
  }

  if (options.mode === "extract-resource-pack") {
    await traceExtractResourcePack(options.sourcePath)
    return
  }

  await traceSelectivePipeline(options.sourcePath)
}

async function traceSelectivePipeline(sourcePath: string): Promise<void> {
  const complexity = await traceComplexity(sourcePath)
  const nativePages = await traceNoOcr(sourcePath)
  const ocrPageNumbers = selectPdfPagesForOcr(complexity)
  trace("selective-ocr-pages", {
    count: ocrPageNumbers.length,
    targetPages: formatLiteParseTargetPages(ocrPageNumbers) ?? "none",
    reasonCounts: countComplexityReasons(complexity),
  })

  if (ocrPageNumbers.length === 0) {
    await tracePhase("build-native-extraction", async () => {
      const extraction = buildLiteParsePdfExtraction(nativePages)
      return {
        pages: extraction.pageTexts.length,
        chars: extraction.pageTexts.join("\n").length,
        warnings: extraction.warnings,
      }
    })
    return
  }

  const ocrPages = await traceOcrPages({
    sourcePath,
    targetPages: ocrPageNumbers,
  })

  await tracePhase("merge-and-build-extraction", async () => {
    const mergedPages = mergeParsedPages(nativePages, ocrPages)
    const extraction = buildLiteParsePdfExtraction(mergedPages)
    return {
      mergedPages: mergedPages.length,
      chars: extraction.pageTexts.join("\n").length,
      warnings: extraction.warnings,
    }
  })
}

async function traceComplexity(sourcePath: string): Promise<PageComplexityStats[]> {
  return await tracePhase("liteparse-complexity", async () => {
    const complexity = await analyzePdfComplexityWithLiteParse(sourcePath)
    return withSummary(complexity, {
      pages: complexity.length,
      ocrPages: selectPdfPagesForOcr(complexity).length,
      reasonCounts: countComplexityReasons(complexity),
    })
  })
}

async function traceNoOcr(sourcePath: string): Promise<ParsedPage[]> {
  return await tracePhase("liteparse-native-no-ocr", async () => {
    const pages = await parsePdfPagesWithLiteParse(sourcePath, {
      ocrEnabled: false,
    })
    return withSummary(pages, summarizePages(pages))
  })
}

async function traceOcrPages(input: {
  sourcePath: string
  targetPages: number[]
}): Promise<ParsedPage[]> {
  return await tracePhase("liteparse-targeted-ocr", async () => {
    trace("liteparse-targeted-ocr-input", {
      count: input.targetPages.length,
      targetPages: formatLiteParseTargetPages(input.targetPages) ?? "none",
    })
    const pages = await parsePdfPagesWithLiteParse(input.sourcePath, {
      ocrEnabled: true,
      targetPages: input.targetPages,
    })
    return withSummary(pages, summarizePages(pages))
  })
}

async function traceExtractResourcePack(sourcePath: string): Promise<void> {
  await tracePhase("extract-resource-pack", async () => {
    const result = await extractResourcePack(sourcePath, PDF_CLASSIFICATION)
    return {
      status: result.status,
      extractor: result.extractor,
      fullTextChars: result.fullText.length,
      warnings: result.warnings,
      pageCount: result.pageMarkdowns?.length ?? 0,
      chunkCount: result.chunkUnits?.length ?? 0,
    }
  })
}

async function tracePhase<T>(name: string, run: () => Promise<T | TTraceWrappedValue<T>>): Promise<T> {
  const startedAt = performance.now()
  trace(`${name}:start`, memorySnapshot())
  const heartbeat = setInterval(() => {
    trace(`${name}:heartbeat`, {
      elapsedMs: Math.round(performance.now() - startedAt),
      ...memorySnapshot(),
    })
  }, HEARTBEAT_INTERVAL_MS)

  try {
    const result = await run()
    const traceValue = unwrapTraceValue(result)
    trace(`${name}:done`, {
      elapsedMs: Math.round(performance.now() - startedAt),
      ...memorySnapshot(),
      ...traceValue.summary,
    })
    return traceValue.value
  } catch (error) {
    trace(`${name}:error`, {
      elapsedMs: Math.round(performance.now() - startedAt),
      ...memorySnapshot(),
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  } finally {
    clearInterval(heartbeat)
  }
}

type TTraceSummary = TJsonObject

type TTraceWrappedValue<T> = {
  value: T
  summary: TTraceSummary
}

function withSummary<T>(value: T, summary: TTraceSummary): TTraceWrappedValue<T> {
  return { value, summary }
}

function unwrapTraceValue<T>(value: T | TTraceWrappedValue<T>): TTraceWrappedValue<T> {
  if (isTraceWrappedValue(value)) return value
  return {
    value,
    summary: {},
  }
}

function isTraceWrappedValue<T>(value: T | TTraceWrappedValue<T>): value is TTraceWrappedValue<T> {
  if (!isObjectValue(value)) return false
  return "value" in value && "summary" in value
}

function summarizePages(pages: ParsedPage[]) {
  const pageChars = pages.map((page) => page.text.length)
  const nonEmptyPages = pageChars.filter((chars) => chars > 0).length
  return {
    pages: pages.length,
    nonEmptyPages,
    chars: pageChars.reduce((total, chars) => total + chars, 0),
    firstPage: pages[0]?.pageNum ?? null,
    lastPage: pages.at(-1)?.pageNum ?? null,
    maxPageChars: Math.max(0, ...pageChars),
  }
}

function countComplexityReasons(complexity: PageComplexityStats[]): TTraceSummary {
  const counts = new Map<string, number>()
  for (const page of complexity) {
    for (const reason of page.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
  }
  return Object.fromEntries([...counts.entries()].toSorted())
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

function memorySnapshot() {
  const memory = process.memoryUsage()
  return {
    rssMiB: Math.round(memory.rss / BYTES_PER_MIB),
    heapUsedMiB: Math.round(memory.heapUsed / BYTES_PER_MIB),
    externalMiB: Math.round(memory.external / BYTES_PER_MIB),
  }
}

function trace(event: string, data: TTraceSummary): void {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      event,
      ...data,
    }),
  )
}

function requireTargetPages(targetPages: number[] | undefined): number[] {
  if (!targetPages || targetPages.length === 0) {
    throw new Error("--pages is required in ocr-pages mode.")
  }
  return targetPages
}

function parseCliOptions(args: string[]): CliOptions {
  let sourcePath: string = DEFAULT_SOURCE_PATH
  let mode: TraceMode = "selective-pipeline"
  let targetPages: number[] | undefined

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--source") {
      sourcePath = requireNextArgument(args, index, argument)
      index += 1
      continue
    }
    if (argument === "--mode") {
      mode = parseTraceMode(requireNextArgument(args, index, argument))
      index += 1
      continue
    }
    if (argument === "--pages") {
      targetPages = parsePageList(requireNextArgument(args, index, argument))
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${argument}`)
  }

  return Object.assign(
    {
      sourcePath,
      mode,
    },
    targetPages ? { targetPages } : undefined,
  )
}

function requireNextArgument(args: string[], index: number, option: string): string {
  const value = args[index + 1]
  if (!value) throw new Error(`${option} requires a value.`)
  return value
}

function parseTraceMode(value: string): TraceMode {
  if (
    value === "selective-pipeline" ||
    value === "complexity" ||
    value === "no-ocr" ||
    value === "ocr-pages" ||
    value === "extract-resource-pack"
  ) {
    return value
  }
  throw new Error(`Unsupported --mode: ${value}`)
}

function parsePageList(value: string): number[] {
  const pages = new Set<number>()
  for (const part of value.split(",")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const range = trimmed.split("-")
    if (range.length === 1) {
      pages.add(parsePageNumber(range[0] ?? ""))
      continue
    }
    if (range.length !== 2) {
      throw new Error(`Invalid page range: ${trimmed}`)
    }
    const start = parsePageNumber(range[0] ?? "")
    const end = parsePageNumber(range[1] ?? "")
    if (end < start) {
      throw new Error(`Invalid descending page range: ${trimmed}`)
    }
    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      pages.add(pageNumber)
    }
  }
  return [...pages].toSorted((left, right) => left - right)
}

function parsePageNumber(value: string): number {
  const pageNumber = Number(value)
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error(`Invalid page number: ${value}`)
  }
  return pageNumber
}
