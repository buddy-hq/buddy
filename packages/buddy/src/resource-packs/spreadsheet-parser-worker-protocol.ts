import {
  isNativeSpreadsheetFormat,
  type NativeSpreadsheetFormat,
} from "@buddy/workspace-file-policy"
import { RESOURCE_PACK_UNIT_KIND_SECTION } from "./chunking-config"
import { RESOURCE_PACK_STATUS_READY } from "./contracts"
import {
  parseTJsonArray,
  parseTJsonObject,
  parseTNonEmptyString,
  parseTNumber,
  parseTString,
  type TJsonValue,
} from "./json-value"
export { SPREADSHEET_PARSER_WORKER_BUNDLED_FILENAME } from "@buddy/script/backend-node-runtime"

export const SPREADSHEET_PARSER_WORKER_SOURCE_FILENAME = "spreadsheet-parser-worker.ts"
export const SPREADSHEET_PARSER_WORKER_NAME = "buddy-spreadsheet-parser"
export const SPREADSHEET_PARSER_EXTRACTOR_NAME = "sheetjs"
export const SPREADSHEET_PARSER_TIMEOUT_MS = 300_000
export const SPREADSHEET_PARSER_MAX_OLD_GENERATION_SIZE_MB = 512
export const SPREADSHEET_PARSER_MAX_YOUNG_GENERATION_SIZE_MB = 64
export const SPREADSHEET_PARSER_STAGED_DIRECTORY_PREFIX = "buddy-spreadsheet-parser-"
export const SPREADSHEET_PARSER_STAGED_FULL_TEXT_FILENAME = "full-text.txt"
export const SPREADSHEET_PARSER_STAGED_ARTIFACTS_DIRECTORY = "artifacts"
export const SPREADSHEET_PARSER_FULL_TEXT_SEPARATOR = "\n\n"

const SPREADSHEET_PARSER_STAGED_ARTIFACT_INDEX_PAD = 3

export type TSpreadsheetParserWorkerInput = {
  sourcePath: string
  format: NativeSpreadsheetFormat
  outputDirectory: string
}

export type TSpreadsheetParserWorkerChunk = {
  unitKind: typeof RESOURCE_PACK_UNIT_KIND_SECTION
  unitTitle: string
  unitIndex: number
  textStart: number
  textLength: number
}

export type TSpreadsheetParserWorkerTextArtifact = {
  relativePath: string
}

export type TSpreadsheetParserWorkerOutput = {
  status: typeof RESOURCE_PACK_STATUS_READY
  warnings: string[]
  extractor: typeof SPREADSHEET_PARSER_EXTRACTOR_NAME
  tocMarkdown: string
  title?: string
  chunkUnits: TSpreadsheetParserWorkerChunk[]
  textArtifacts: TSpreadsheetParserWorkerTextArtifact[]
}

type TSpreadsheetParserExtractorField = {
  extractor: typeof SPREADSHEET_PARSER_EXTRACTOR_NAME
}

export const spreadsheetParserExtractorField: TSpreadsheetParserExtractorField = {
  extractor: SPREADSHEET_PARSER_EXTRACTOR_NAME,
}

export type SpreadsheetParserWorkerInput = TSpreadsheetParserWorkerInput
export type SpreadsheetParserWorkerChunk = TSpreadsheetParserWorkerChunk
export type SpreadsheetParserWorkerTextArtifact = TSpreadsheetParserWorkerTextArtifact
export type SpreadsheetParserWorkerOutput = TSpreadsheetParserWorkerOutput

export function spreadsheetParserStagedArtifactFilename(index: number): string {
  return `${String(index + 1).padStart(SPREADSHEET_PARSER_STAGED_ARTIFACT_INDEX_PAD, "0")}.csv`
}

export function parseTSpreadsheetParserWorkerInput<TValue>(
  value: TValue,
): TSpreadsheetParserWorkerInput | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const sourcePath = parseTNonEmptyString(record.sourcePath)
  const format = parseTNativeSpreadsheetFormat(record.format)
  const outputDirectory = parseTNonEmptyString(record.outputDirectory)
  if (sourcePath === undefined || format === undefined || outputDirectory === undefined) {
    return undefined
  }
  return { sourcePath, format, outputDirectory }
}

export function parseTSpreadsheetParserWorkerOutput<TValue>(
  value: TValue,
): TSpreadsheetParserWorkerOutput | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  if (record.status !== RESOURCE_PACK_STATUS_READY) return undefined
  const warnings = parseTStringArray(record.warnings)
  if (warnings === undefined) return undefined
  if (record.extractor !== SPREADSHEET_PARSER_EXTRACTOR_NAME) return undefined
  const tocMarkdown = parseTString(record.tocMarkdown)
  if (tocMarkdown === undefined) return undefined
  const title = parseTOptionalString(record.title)
  if (title === undefined && record.title !== undefined) return undefined
  const chunkUnits = parseTSpreadsheetParserWorkerChunks(record.chunkUnits)
  const textArtifacts = parseTSpreadsheetParserWorkerTextArtifacts(record.textArtifacts)
  if (chunkUnits === undefined || textArtifacts === undefined) return undefined
  const output: TSpreadsheetParserWorkerOutput = Object.assign(
    {
      status: RESOURCE_PACK_STATUS_READY,
      warnings,
      tocMarkdown,
      chunkUnits,
      textArtifacts,
    },
    spreadsheetParserExtractorField,
    title !== undefined ? { title } : undefined,
  )
  return output
}

function parseTNativeSpreadsheetFormat<TValue>(value: TValue): NativeSpreadsheetFormat | undefined {
  const format = parseTString(value)
  if (format === undefined || !isNativeSpreadsheetFormat(format)) return undefined
  return format
}

function parseTOptionalString<TValue>(value: TValue): string | undefined {
  if (value === undefined) return undefined
  return parseTString(value)
}

function parseTStringArray(value: TJsonValue | undefined): string[] | undefined {
  const entries = parseTJsonArray(value)
  if (entries === undefined) return undefined
  const result: string[] = []
  for (const entry of entries) {
    const text = parseTString(entry)
    if (text === undefined) return undefined
    result.push(text)
  }
  return result
}

function parseTSpreadsheetParserWorkerChunks(
  value: TJsonValue | undefined,
): TSpreadsheetParserWorkerChunk[] | undefined {
  const entries = parseTJsonArray(value)
  if (entries === undefined) return undefined
  const chunks: TSpreadsheetParserWorkerChunk[] = []
  for (const entry of entries) {
    const chunk = parseTSpreadsheetParserWorkerChunk(entry)
    if (chunk === undefined) return undefined
    chunks.push(chunk)
  }
  return chunks
}

function parseTSpreadsheetParserWorkerChunk<TValue>(
  value: TValue,
): TSpreadsheetParserWorkerChunk | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  if (record.unitKind !== RESOURCE_PACK_UNIT_KIND_SECTION) return undefined
  const unitTitle = parseTString(record.unitTitle)
  const unitIndex = parseTPositiveInteger(record.unitIndex)
  const textStart = parseTNonNegativeInteger(record.textStart)
  const textLength = parseTNonNegativeInteger(record.textLength)
  if (
    unitTitle === undefined ||
    unitIndex === undefined ||
    textStart === undefined ||
    textLength === undefined
  ) {
    return undefined
  }
  return {
    unitKind: RESOURCE_PACK_UNIT_KIND_SECTION,
    unitTitle,
    unitIndex,
    textStart,
    textLength,
  }
}

function parseTSpreadsheetParserWorkerTextArtifacts(
  value: TJsonValue | undefined,
): TSpreadsheetParserWorkerTextArtifact[] | undefined {
  const entries = parseTJsonArray(value)
  if (entries === undefined) return undefined
  const artifacts: TSpreadsheetParserWorkerTextArtifact[] = []
  for (const entry of entries) {
    const artifact = parseTSpreadsheetParserWorkerTextArtifact(entry)
    if (artifact === undefined) return undefined
    artifacts.push(artifact)
  }
  return artifacts
}

function parseTSpreadsheetParserWorkerTextArtifact<TValue>(
  value: TValue,
): TSpreadsheetParserWorkerTextArtifact | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const relativePath = parseTNonEmptyString(record.relativePath)
  if (relativePath === undefined) return undefined
  return { relativePath }
}

function parseTPositiveInteger<TValue>(value: TValue): number | undefined {
  const numeric = parseTNumber(value)
  if (numeric === undefined || !Number.isInteger(numeric) || numeric <= 0) return undefined
  return numeric
}

function parseTNonNegativeInteger<TValue>(value: TValue): number | undefined {
  const numeric = parseTNumber(value)
  if (numeric === undefined || !Number.isInteger(numeric) || numeric < 0) return undefined
  return numeric
}
