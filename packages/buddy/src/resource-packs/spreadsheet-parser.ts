import { readFile, stat } from "node:fs/promises"
import type { NativeSpreadsheetFormat } from "@buddy/workspace-file-policy"
import * as XLSX from "xlsx"
import * as cptable from "xlsx/dist/cpexcel"
import { assertResourceArchiveBytesBudget } from "./archive"
import {
  assertResourceChunkUnitCount,
  assertResourceSourceSize,
  assertResourceTextCharacterCount,
  RESOURCE_MAX_ARCHIVE_ENTRY_COUNT,
  RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES,
  RESOURCE_MAX_TEXT_ARTIFACT_CHARACTERS,
  ResourceBudgetExceededError,
  type ResourceArchiveBudget,
} from "./budgets"
import {
  RESOURCE_PACK_STATUS_READY,
  type ResourceChunkUnitSeed,
  type ResourceExtractionResult,
  type ResourceTextArtifact,
} from "./contracts"
import { RESOURCE_PACK_UNIT_KIND_SECTION } from "./chunking-config"
import { renderTocMarkdown } from "./markdown"
import {
  SPREADSHEET_PARSER_EXTRACTOR_NAME,
  SPREADSHEET_PARSER_FULL_TEXT_SEPARATOR,
} from "./spreadsheet-parser-worker-protocol"

XLSX.set_cptable(cptable)

const SPREADSHEET_MAX_WORKSHEETS = 256
const SPREADSHEET_MAX_NON_EMPTY_CELLS = 1_000_000
const SPREADSHEET_MAX_MATERIALIZED_ROWS_PER_SHEET = 100_000
const SPREADSHEET_PARSE_ROW_LIMIT = SPREADSHEET_MAX_MATERIALIZED_ROWS_PER_SHEET + 1
const SPREADSHEET_MAX_MATERIALIZED_COLUMNS_PER_SHEET = 256
const SPREADSHEET_MAX_MATERIALIZED_GRID_CELLS = 2_000_000
const SPREADSHEET_ROW_WINDOW_SIZE = 50
const SPREADSHEET_SHEET_INDEX_PAD = 3
const SPREADSHEET_SHEET_SLUG_MAX_CHARACTERS = 60
const SPREADSHEET_TITLE_MAX_CHARACTERS = 512
const SPREADSHEET_LIMITATION_WARNING =
  "Spreadsheet extraction does not represent formatting, images, charts, pivots, macros, or workbook interactivity. Formulas are not calculated, macros are not extracted or executed, and external links are not followed."
const SPREADSHEET_SUMMARY_PARSE_FORMATS = new Set<NativeSpreadsheetFormat>([
  "xlsx",
  "xls",
  "xlsm",
  "xlsb",
])
const ARCHIVE_SPREADSHEET_FORMATS = new Set<NativeSpreadsheetFormat>([
  "xlsx",
  "xlsm",
  "xlsb",
  "ods",
  "numbers",
])
const SPREADSHEET_ARCHIVE_BUDGET: ResourceArchiveBudget = {
  maxEntryCount: RESOURCE_MAX_ARCHIVE_ENTRY_COUNT,
  maxEntryBytes: RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES,
  maxExpandedBytes: RESOURCE_MAX_ARCHIVE_EXPANDED_BYTES,
}
const LEGACY_XLS_COMPOUND_FILE_SIGNATURE = new Uint8Array([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
])
const LEGACY_XLS_BIFF_BOF_VERSIONS = new Set([0x00, 0x02, 0x04, 0x08])

type FormulaAnnotation = {
  address: string
  formula: string
  result: string
}

type SpreadsheetCell = {
  rawValue?: string | number | boolean | Date
  formattedText?: string
  formula?: string
}

type PreparedWorksheet = {
  name: string
  rows: unknown[][]
  visibility: "visible" | "hidden" | "very hidden"
  index: number
  csvPath: string
  rowCount: number
  columnCount: number
}

function sheetSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase()
    .slice(0, SPREADSHEET_SHEET_SLUG_MAX_CHARACTERS)
  return slug || "sheet"
}

function workbookTitle(workbook: XLSX.WorkBook): string | undefined {
  const title = workbook.Props?.Title?.trim()
  if (!title) return undefined
  return title.slice(0, SPREADSHEET_TITLE_MAX_CHARACTERS)
}

function csvField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function markdownCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/\r?\n/gu, "<br>")
}

function columnLabel(columnNumber: number): string {
  let current = columnNumber
  let label = ""
  while (current > 0) {
    const offset = (current - 1) % 26
    label = String.fromCharCode(65 + offset) + label
    current = Math.floor((current - 1) / 26)
  }
  return label
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function readSpreadsheetCell(value: unknown): SpreadsheetCell | undefined {
  if (!isRecord(value) || typeof value.t !== "string" || value.t === "z") return undefined
  const rawValue = value.v
  const normalizedRawValue =
    typeof rawValue === "string" ||
    typeof rawValue === "number" ||
    typeof rawValue === "boolean" ||
    rawValue instanceof Date
      ? rawValue
      : undefined
  const formattedText = typeof value.w === "string" ? value.w : undefined
  const formula = typeof value.f === "string" && value.f.trim() ? value.f.trim() : undefined
  if (normalizedRawValue === undefined && formattedText === undefined && formula === undefined) {
    return undefined
  }
  return {
    ...(normalizedRawValue !== undefined ? { rawValue: normalizedRawValue } : {}),
    ...(formattedText !== undefined ? { formattedText } : {}),
    ...(formula ? { formula } : {}),
  }
}

function startsWithBytes(bytes: Uint8Array, signature: Uint8Array): boolean {
  if (bytes.byteLength < signature.byteLength) return false
  return signature.every((value, index) => bytes[index] === value)
}

function assertLegacyXlsContainer(bytes: Uint8Array): void {
  const isCompoundFile = startsWithBytes(bytes, LEGACY_XLS_COMPOUND_FILE_SIGNATURE)
  const isRawBiffWorkbook =
    bytes[0] === 0x09 && bytes[1] !== undefined && LEGACY_XLS_BIFF_BOF_VERSIONS.has(bytes[1])
  if (isCompoundFile || isRawBiffWorkbook) return
  throw new Error("XLS input is not a legacy Excel compound file or BIFF workbook.")
}

function cellDisplayText(cell: SpreadsheetCell): string {
  if (cell.rawValue instanceof Date) return cell.rawValue.toISOString()
  if (cell.formattedText !== undefined) return cell.formattedText
  if (cell.rawValue !== undefined) return String(cell.rawValue)
  return ""
}

function displayCellValue(
  value: unknown,
  address: string,
) {
  const cell = readSpreadsheetCell(value)
  if (!cell) return { text: "" }
  const displayed = cellDisplayText(cell)
  if (!cell.formula) return { text: displayed }
  const hasCachedResult = cell.rawValue !== undefined
  return {
    text: hasCachedResult ? displayed : `=${cell.formula}`,
    annotation: {
      address,
      formula: cell.formula,
      result: hasCachedResult ? displayed || "(empty result)" : "(no cached result)",
    },
  }
}

function denseWorksheetRows(value: unknown, sheetName: string): unknown[][] {
  if (!isRecord(value)) throw new Error(`Spreadsheet is missing worksheet data for ${sheetName}.`)
  const data = value["!data"]
  if (!isUnknownArray(data)) return []
  return Array.from({ length: data.length }, (_, rowIndex) => {
    const row = data[rowIndex]
    if (row === undefined) return []
    if (!isUnknownArray(row)) {
      throw new Error(`Spreadsheet worksheet ${sheetName} contains malformed row data.`)
    }
    return row
  })
}

function worksheetVisibility(value: 0 | 1 | 2 | undefined): PreparedWorksheet["visibility"] {
  if (value === 1) return "hidden"
  if (value === 2) return "very hidden"
  return "visible"
}

function assertWorkbookSheetCount(sheetCount: number): void {
  if (sheetCount <= SPREADSHEET_MAX_WORKSHEETS) return
  throw new ResourceBudgetExceededError(
    `Workbook contains ${sheetCount} sheets; the maximum supported count is ${SPREADSHEET_MAX_WORKSHEETS}.`,
  )
}

function worksheetFullRowCount(value: unknown, sheetName: string): number | undefined {
  if (!isRecord(value)) return undefined
  const fullReference = value["!fullref"]
  if (fullReference === undefined) return undefined
  if (typeof fullReference !== "string") {
    throw new Error(`Spreadsheet worksheet ${sheetName} contains a malformed full range.`)
  }
  try {
    return XLSX.utils.decode_range(fullReference).e.r + 1
  } catch (error) {
    throw new Error(`Spreadsheet worksheet ${sheetName} contains an invalid full range.`, {
      cause: error,
    })
  }
}

function prepareWorksheets(workbook: XLSX.WorkBook): PreparedWorksheet[] {
  assertWorkbookSheetCount(workbook.SheetNames.length)
  const metadata = workbook.Workbook?.Sheets ?? []
  let nonEmptyCells = 0
  let materializedGridCells = 0

  return workbook.SheetNames.map((name, worksheetIndex) => {
    const worksheetValue: unknown = workbook.Sheets[name]
    const fullRowCount = worksheetFullRowCount(worksheetValue, name)
    if (fullRowCount !== undefined && fullRowCount > SPREADSHEET_MAX_MATERIALIZED_ROWS_PER_SHEET) {
      throw new ResourceBudgetExceededError(
        `Worksheet ${name} extends to row ${fullRowCount}; the maximum materialized row is ${SPREADSHEET_MAX_MATERIALIZED_ROWS_PER_SHEET}.`,
      )
    }
    const rows = denseWorksheetRows(worksheetValue, name)
    const rowCount = rows.length
    const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0)
    if (rowCount > SPREADSHEET_MAX_MATERIALIZED_ROWS_PER_SHEET) {
      throw new ResourceBudgetExceededError(
        `Worksheet ${name} extends to row ${rowCount}; the maximum materialized row is ${SPREADSHEET_MAX_MATERIALIZED_ROWS_PER_SHEET}.`,
      )
    }
    if (columnCount > SPREADSHEET_MAX_MATERIALIZED_COLUMNS_PER_SHEET) {
      throw new ResourceBudgetExceededError(
        `Worksheet ${name} contains ${columnCount} used columns; the maximum supported count is ${SPREADSHEET_MAX_MATERIALIZED_COLUMNS_PER_SHEET}.`,
      )
    }
    materializedGridCells += rowCount * columnCount
    if (materializedGridCells > SPREADSHEET_MAX_MATERIALIZED_GRID_CELLS) {
      throw new ResourceBudgetExceededError(
        `Workbook output grid exceeds ${SPREADSHEET_MAX_MATERIALIZED_GRID_CELLS} cells.`,
      )
    }
    for (const row of rows) {
      for (const cell of row) {
        if (!readSpreadsheetCell(cell)) continue
        nonEmptyCells += 1
        if (nonEmptyCells > SPREADSHEET_MAX_NON_EMPTY_CELLS) {
          throw new ResourceBudgetExceededError(
            `Workbook contains more than ${SPREADSHEET_MAX_NON_EMPTY_CELLS} non-empty cells.`,
          )
        }
      }
    }

    const index = worksheetIndex + 1
    return {
      name,
      rows,
      visibility: worksheetVisibility(metadata[worksheetIndex]?.Hidden),
      index,
      csvPath: `sheets/${String(index).padStart(SPREADSHEET_SHEET_INDEX_PAD, "0")}-${sheetSlug(name)}.csv`,
      rowCount,
      columnCount,
    }
  })
}

function worksheetRows(input: PreparedWorksheet) {
  const rows: string[][] = []
  const formulasByRow = new Map<number, FormulaAnnotation[]>()
  for (let rowNumber = 1; rowNumber <= input.rowCount; rowNumber += 1) {
    const row: string[] = []
    const annotations: FormulaAnnotation[] = []
    for (let columnNumber = 1; columnNumber <= input.columnCount; columnNumber += 1) {
      const address = `${columnLabel(columnNumber)}${rowNumber}`
      const value = displayCellValue(input.rows[rowNumber - 1]?.[columnNumber - 1], address)
      row.push(value.text)
      if (value.annotation) annotations.push(value.annotation)
    }
    rows.push(row)
    if (annotations.length > 0) formulasByRow.set(rowNumber, annotations)
  }
  return { rows, formulasByRow }
}

function renderRowWindow(input: {
  sheet: PreparedWorksheet
  rows: string[][]
  formulasByRow: Map<number, FormulaAnnotation[]>
  startRow: number
  endRow: number
}): string {
  const columnHeaders = Array.from({ length: input.sheet.columnCount }, (_, index) =>
    columnLabel(index + 1),
  )
  const header = ["Row", ...columnHeaders]
  const lines = [
    `# ${input.sheet.name}: rows ${input.startRow}-${input.endRow}`,
    "",
    `CSV artifact: [${input.sheet.csvPath.split("/").at(-1)}](../${input.sheet.csvPath})`,
    "",
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
  ]
  for (let rowNumber = input.startRow; rowNumber <= input.endRow; rowNumber += 1) {
    const row = input.rows[rowNumber - 1] ?? []
    lines.push(`| ${[String(rowNumber), ...row.map(markdownCell)].join(" | ")} |`)
  }
  const formulas = Array.from(
    { length: input.endRow - input.startRow + 1 },
    (_, index) => input.formulasByRow.get(input.startRow + index) ?? [],
  ).flat()
  if (formulas.length > 0) {
    lines.push("", "## Formula annotations", "")
    lines.push(
      ...formulas.map(
        (formula) =>
          `- ${formula.address}: \`=${formula.formula}\` → ${formula.result || "(empty result)"}`,
      ),
    )
  }
  return lines.join("\n")
}

function readSpreadsheetWorkbook(
  bytes: Uint8Array,
  format: NativeSpreadsheetFormat,
): XLSX.WorkBook {
  if (format === "xls") assertLegacyXlsContainer(bytes)

  if (SPREADSHEET_SUMMARY_PARSE_FORMATS.has(format)) {
    const summary = XLSX.read(bytes, {
      type: "buffer",
      bookProps: true,
      bookSheets: true,
      bookVBA: false,
      WTF: false,
    })
    assertWorkbookSheetCount(summary.SheetNames.length)
  }

  const workbook = XLSX.read(bytes, {
    type: "buffer",
    dense: true,
    nodim: true,
    cellDates: true,
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    cellText: true,
    bookDeps: false,
    bookFiles: false,
    bookVBA: false,
    PRN: false,
    UTC: true,
    WTF: false,
    sheetRows: SPREADSHEET_PARSE_ROW_LIMIT,
  })
  assertWorkbookSheetCount(workbook.SheetNames.length)
  return workbook
}

export async function extractSpreadsheetResourceInWorker(
  sourcePath: string,
  format: NativeSpreadsheetFormat,
): Promise<ResourceExtractionResult> {
  const sourceStats = await stat(sourcePath)
  assertResourceSourceSize(Number(sourceStats.size))
  const bytes = await readFile(sourcePath)
  assertResourceSourceSize(bytes.byteLength)
  if (ARCHIVE_SPREADSHEET_FORMATS.has(format)) {
    await assertResourceArchiveBytesBudget(bytes, SPREADSHEET_ARCHIVE_BUDGET)
  }
  const workbook = readSpreadsheetWorkbook(bytes, format)
  const sheets = prepareWorksheets(workbook)
  const chunkUnits: ResourceChunkUnitSeed[] = []
  const textArtifacts: ResourceTextArtifact[] = []
  const tocLines: string[] = []
  const indexLines = ["# Workbook", "", "## Sheets", ""]
  let artifactCharacters = 0
  let extractedCharacters = indexLines.join("\n").length

  for (const sheet of sheets) {
    const dimensions = `${sheet.rowCount} rows × ${sheet.columnCount} columns`
    tocLines.push(`- ${sheet.name} (${sheet.visibility}; ${dimensions})`)
    indexLines.push(
      `- **${sheet.name}** — ${sheet.visibility}; ${dimensions}; CSV: \`${sheet.csvPath}\``,
    )
    const prepared = worksheetRows(sheet)
    const csvBody = prepared.rows.map((row) => row.map(csvField).join(",")).join("\r\n")
    const csv = csvBody.length > 0 ? `${csvBody}\r\n` : ""
    artifactCharacters += csv.length
    if (artifactCharacters > RESOURCE_MAX_TEXT_ARTIFACT_CHARACTERS) {
      throw new ResourceBudgetExceededError(
        `Workbook CSV artifacts exceed the ${RESOURCE_MAX_TEXT_ARTIFACT_CHARACTERS} character limit.`,
      )
    }
    textArtifacts.push({ relativePath: sheet.csvPath, content: csv })

    for (let startRow = 1; startRow <= sheet.rowCount; startRow += SPREADSHEET_ROW_WINDOW_SIZE) {
      const endRow = Math.min(sheet.rowCount, startRow + SPREADSHEET_ROW_WINDOW_SIZE - 1)
      const markdown = renderRowWindow({
        sheet,
        rows: prepared.rows,
        formulasByRow: prepared.formulasByRow,
        startRow,
        endRow,
      })
      extractedCharacters += markdown.length + 2
      assertResourceTextCharacterCount(extractedCharacters)
      chunkUnits.push({
        unitKind: RESOURCE_PACK_UNIT_KIND_SECTION,
        unitTitle: `${sheet.name}: rows ${startRow}-${endRow}`,
        unitIndex: chunkUnits.length + 1,
        text: markdown,
      })
    }
  }
  assertResourceChunkUnitCount(chunkUnits.length)

  const workbookIndex = indexLines.join("\n")
  const fullText = [workbookIndex, ...chunkUnits.map((unit) => unit.text)].join(
    SPREADSHEET_PARSER_FULL_TEXT_SEPARATOR,
  )
  assertResourceTextCharacterCount(fullText.length)
  return {
    status: RESOURCE_PACK_STATUS_READY,
    warnings: [SPREADSHEET_LIMITATION_WARNING],
    extractor: SPREADSHEET_PARSER_EXTRACTOR_NAME,
    fullText,
    chunkUnits,
    tocMarkdown: renderTocMarkdown(tocLines),
    textArtifacts,
    title: workbookTitle(workbook),
  }
}
