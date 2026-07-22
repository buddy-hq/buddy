import {
  isNativeSpreadsheetFormat,
  type NativeSpreadsheetFormat,
} from "@buddy/workspace-file-policy"
import { RESOURCE_PACK_UNIT_KIND_SECTION } from "./chunking-config"
import { RESOURCE_PACK_STATUS_READY } from "./contracts"
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

export type SpreadsheetParserWorkerInput = {
  sourcePath: string
  format: NativeSpreadsheetFormat
  outputDirectory: string
}

export type SpreadsheetParserWorkerChunk = {
  unitKind: typeof RESOURCE_PACK_UNIT_KIND_SECTION
  unitTitle: string
  unitIndex: number
  textStart: number
  textLength: number
}

export type SpreadsheetParserWorkerTextArtifact = {
  relativePath: string
}

export type SpreadsheetParserWorkerOutput = {
  status: typeof RESOURCE_PACK_STATUS_READY
  warnings: string[]
  extractor: typeof SPREADSHEET_PARSER_EXTRACTOR_NAME
  tocMarkdown: string
  title?: string
  chunkUnits: SpreadsheetParserWorkerChunk[]
  textArtifacts: SpreadsheetParserWorkerTextArtifact[]
}

export function spreadsheetParserStagedArtifactFilename(index: number): string {
  return `${String(index + 1).padStart(SPREADSHEET_PARSER_STAGED_ARTIFACT_INDEX_PAD, "0")}.csv`
}

export function isSpreadsheetParserWorkerInput(
  value: unknown,
): value is SpreadsheetParserWorkerInput {
  return (
    isRecord(value) &&
    typeof value.sourcePath === "string" &&
    value.sourcePath.length > 0 &&
    typeof value.format === "string" &&
    isNativeSpreadsheetFormat(value.format) &&
    typeof value.outputDirectory === "string" &&
    value.outputDirectory.length > 0
  )
}

export function isSpreadsheetParserWorkerOutput(
  value: unknown,
): value is SpreadsheetParserWorkerOutput {
  return (
    isRecord(value) &&
    value.status === RESOURCE_PACK_STATUS_READY &&
    isStringArray(value.warnings) &&
    value.extractor === SPREADSHEET_PARSER_EXTRACTOR_NAME &&
    typeof value.tocMarkdown === "string" &&
    (value.title === undefined || typeof value.title === "string") &&
    Array.isArray(value.chunkUnits) &&
    value.chunkUnits.every(isSpreadsheetParserWorkerChunk) &&
    Array.isArray(value.textArtifacts) &&
    value.textArtifacts.every(isSpreadsheetParserWorkerTextArtifact)
  )
}

function isSpreadsheetParserWorkerChunk(value: unknown): value is SpreadsheetParserWorkerChunk {
  return (
    isRecord(value) &&
    value.unitKind === RESOURCE_PACK_UNIT_KIND_SECTION &&
    typeof value.unitTitle === "string" &&
    typeof value.unitIndex === "number" &&
    Number.isInteger(value.unitIndex) &&
    value.unitIndex > 0 &&
    typeof value.textStart === "number" &&
    Number.isInteger(value.textStart) &&
    value.textStart >= 0 &&
    typeof value.textLength === "number" &&
    Number.isInteger(value.textLength) &&
    value.textLength >= 0
  )
}

function isSpreadsheetParserWorkerTextArtifact(
  value: unknown,
): value is SpreadsheetParserWorkerTextArtifact {
  return isRecord(value) && typeof value.relativePath === "string" && value.relativePath.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}
