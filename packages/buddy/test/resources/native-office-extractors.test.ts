import { describe, expect, test } from "bun:test"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  NATIVE_SPREADSHEET_FORMATS,
  type NativeSpreadsheetFormat,
} from "@buddy/workspace-file-policy"
import {
  BlobReader,
  BlobWriter,
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js"
import * as XLSX from "xlsx"
import XLSX_ZAHL_PAYLOAD from "xlsx/dist/xlsx.zahl"
import { tmpdir } from "../helpers/tmpdir"
import { extractResourcePack } from "../../src/resource-packs/extractors"
import { buildResourceChunkFiles } from "../../src/resource-packs/chunking"
import {
  classifyResourcePath,
  ensureResourcePackWithBuildInput,
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_FULL_TEXT_FILE_NAME,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_TOC_FILE_NAME,
} from "../../src/resource-packs"
import {
  addResource,
  resolveResourceReference,
} from "../../src/resources/resource-registry-service"

const RESOURCE_PREPARATION_WAIT_ATTEMPTS = 80
const RESOURCE_PREPARATION_WAIT_MS = 25

async function waitForPreparedResource(input: {
  directory: string
  alias: string
}): Promise<Extract<Awaited<ReturnType<typeof resolveResourceReference>>, { ok: true }>> {
  for (let attempt = 0; attempt < RESOURCE_PREPARATION_WAIT_ATTEMPTS; attempt += 1) {
    const result = await resolveResourceReference({
      directory: input.directory,
      key: input.alias,
    })
    if (result.ok) return result
    if (result.record?.status === "error" || result.record?.status === "unsupported") {
      throw new Error(
        `Resource preparation failed for ${input.alias}: ${result.record.warnings.join(" ")}`,
      )
    }
    await Bun.sleep(RESOURCE_PREPARATION_WAIT_MS)
  }

  throw new Error(`Timed out waiting for resource preparation: ${input.alias}`)
}

const PPTX_PRESENTATION = `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst>
</p:presentation>`
const PPTX_PRESENTATION_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="/ppt/slides/slide2.xml"/>
</Relationships>`
const PPTX_SLIDE_ONE = `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>First filename slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
const PPTX_SLIDE_TWO = `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:cNvPr id="4" name="Diagram" descr="Water cycle diagram"/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Ordered first</a:t></a:r></a:p><a:p><a:r><a:t>Evaporation lesson</a:t></a:r></a:p></p:txBody></p:sp>
<a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Stage</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Meaning</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Heat</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl>
</p:spTree></p:cSld></p:sld>`
const PPTX_SLIDE_TWO_RELS = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="notes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`
const PPTX_NOTES = `<p:notes xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Ask learners for an example.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`
const PPTX_OVERSIZED_BODY = "Detailed lesson explanation. ".repeat(2_000)
const PPTX_OVERSIZED_SLIDE = `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Long lesson</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:txBody><a:p><a:r><a:t>${PPTX_OVERSIZED_BODY}</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:sld>`
const SPREADSHEET_OVER_BUDGET_SHEET_COUNT = 257
const SPREADSHEET_OVER_BUDGET_ROW_NUMBER = 100_001
const SPREADSHEET_RESPONSIVENESS_ROW_COUNT = 5_000
const SPREADSHEET_RESPONSIVENESS_COLUMN_COUNT = 10
const SPREADSHEET_RESPONSIVENESS_TIMER_MS = 10
const OFFICE_BUDGET_TEST_TIMEOUT_MS = 20_000

async function createPptx(filepath: string, slideOne = PPTX_SLIDE_ONE): Promise<void> {
  const writer = new ZipWriter<Blob>(new BlobWriter())
  await writer.add("ppt/presentation.xml", new TextReader(PPTX_PRESENTATION))
  await writer.add("ppt/_rels/presentation.xml.rels", new TextReader(PPTX_PRESENTATION_RELS))
  await writer.add("ppt/slides/slide1.xml", new TextReader(slideOne))
  await writer.add("ppt/slides/slide2.xml", new TextReader(PPTX_SLIDE_TWO))
  await writer.add("ppt/slides/_rels/slide2.xml.rels", new TextReader(PPTX_SLIDE_TWO_RELS))
  await writer.add("ppt/notesSlides/notesSlide1.xml", new TextReader(PPTX_NOTES))
  const blob = await writer.close()
  await writeFile(filepath, new Uint8Array(await blob.arrayBuffer()))
}

type SpreadsheetFixtureCell = string | number | boolean | Date | XLSX.CellObject | undefined

async function writeSpreadsheetFixture(input: {
  filepath: string
  format: NativeSpreadsheetFormat
  workbook: XLSX.WorkBook
}): Promise<void> {
  const writeOptions = Object.assign(
    {
      type: "buffer" as const,
      bookType: input.format,
    },
    input.format === "numbers" ? { numbers: XLSX_ZAHL_PAYLOAD } : undefined,
  )
  const output: unknown = XLSX.write(input.workbook, writeOptions)
  if (!(output instanceof Uint8Array)) {
    throw new Error(`SheetJS did not produce bytes for ${input.format}.`)
  }
  await writeFile(input.filepath, output)
}

async function createSpreadsheet(
  filepath: string,
  format: NativeSpreadsheetFormat,
  includeHiddenSheet = true,
): Promise<void> {
  const workbook = XLSX.utils.book_new()
  workbook.Props = { Title: "Attendance workbook" }
  const visible = XLSX.utils.aoa_to_sheet<SpreadsheetFixtureCell>([
    ["Learner", "Score", "Comment"],
    ['Asha, "A"', 8, "Line one\nLine two"],
    ["José नमस्ते", 9, "Non-ASCII learner name"],
    [undefined, { t: "n", f: "SUM(B2,2)", v: 10 }, { t: "n", f: 'CONCAT("Ready","!")' }],
    [new Date("2026-07-22T00:00:00.000Z"), true, { t: "e", v: 42, w: "#N/A" }],
  ])
  XLSX.utils.sheet_add_aoa<SpreadsheetFixtureCell>(visible, [["Far column"]], {
    origin: "Z5",
  })
  XLSX.utils.book_append_sheet(workbook, visible, "Attendance")
  if (includeHiddenSheet) {
    const hidden = XLSX.utils.aoa_to_sheet([["Private rubric", "Check sources"]])
    XLSX.utils.book_append_sheet(workbook, hidden, "Teacher Notes")
    workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] }
  }
  await writeSpreadsheetFixture({ filepath, format, workbook })
}

async function createLargeLegacySpreadsheet(filepath: string): Promise<void> {
  const workbook = XLSX.utils.book_new()
  const rows = Array.from({ length: SPREADSHEET_RESPONSIVENESS_ROW_COUNT }, (_, rowIndex) =>
    Array.from(
      { length: SPREADSHEET_RESPONSIVENESS_COLUMN_COUNT },
      (_, columnIndex) => `row-${rowIndex + 1}-column-${columnIndex + 1}`,
    ),
  )
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Large sheet")
  await writeSpreadsheetFixture({ filepath, format: "xls", workbook })
}

async function createSparseRowSpreadsheet(filepath: string, format: "xlsx" | "xls"): Promise<void> {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([["Label"], [], ["After blank row"]])
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sparse rows")
  await writeSpreadsheetFixture({ filepath, format, workbook })
}

async function addUnknownWorkbookExtension(filepath: string): Promise<void> {
  const sourceBytes = await readFile(filepath)
  const reader = new ZipReader(new BlobReader(new Blob([new Uint8Array(sourceBytes)])))
  const writer = new ZipWriter<Blob>(new BlobWriter())
  try {
    const entries = await reader.getEntries()
    for (const entry of entries) {
      if (entry.directory) continue
      const bytes = await entry.getData(new Uint8ArrayWriter())
      const output =
        entry.filename === "xl/workbook.xml"
          ? new TextEncoder().encode(
              new TextDecoder()
                .decode(bytes)
                .replace("</workbook>", '<vendorExtension data-buddy-test="ignored"/></workbook>'),
            )
          : bytes
      await writer.add(entry.filename, new Uint8ArrayReader(output))
    }
    const blob = await writer.close()
    await writeFile(filepath, new Uint8Array(await blob.arrayBuffer()))
  } finally {
    await reader.close()
  }
}

async function createInvalidSpreadsheetArchive(filepath: string): Promise<void> {
  const writer = new ZipWriter<Blob>(new BlobWriter())
  await writer.add("not-a-workbook.txt", new TextReader("invalid workbook container"))
  const blob = await writer.close()
  await writeFile(filepath, new Uint8Array(await blob.arrayBuffer()))
}

describe("native office resource extractors", () => {
  test("resolves PPTX relationship order and extracts slides, tables, notes, and alt text", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "lesson.pptx")
    await createPptx(sourcePath)

    const extraction = await extractResourcePack(sourcePath, classifyResourcePath(sourcePath))
    expect(extraction.status).toBe("ready")
    expect(extraction.chunkUnits?.map((unit) => unit.unitTitle)).toEqual([
      "Slide 1: Ordered first Evaporation lesson",
      "Slide 2: First filename slide",
    ])
    expect(extraction.fullText).toContain("| Stage | Meaning |")
    expect(extraction.fullText).toContain("Ask learners for an example.")
    expect(extraction.fullText).toContain("Water cycle diagram")
    expect(extraction.warnings.join(" ")).toContain("visual composition")
  })

  test("creates XLSX sheet windows, formula annotations, hidden-sheet metadata, and real CSVs", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "attendance.xlsx")
    await createSpreadsheet(sourcePath, "xlsx")

    const extraction = await extractResourcePack(sourcePath, classifyResourcePath(sourcePath))
    expect(extraction.status).toBe("ready")
    expect(extraction.tocMarkdown).toContain("Teacher Notes (hidden")
    expect(extraction.fullText).toContain("`=SUM(B2,2)` → 10")
    expect(extraction.fullText).toContain('`=CONCAT("Ready","!")` → (no cached result)')
    const attendanceCsv = extraction.textArtifacts?.find((artifact) =>
      artifact.relativePath.endsWith("attendance.csv"),
    )
    expect(attendanceCsv?.content).toContain('"Asha, ""A"""')
    expect(attendanceCsv?.content).toContain('"Line one\nLine two"')
    expect(attendanceCsv?.content.split("\r\n")[4]?.split(",")[25]).toBe("Far column")
    expect(extraction.textArtifacts?.map((artifact) => artifact.relativePath)).toEqual([
      "sheets/001-attendance.csv",
      "sheets/002-teacher-notes.csv",
    ])
    expect(extraction.extractor).toBe("sheetjs")
  })

  test("extracts every admitted spreadsheet format through one SheetJS pipeline", async () => {
    await using project = await tmpdir({ git: true })

    for (const format of NATIVE_SPREADSHEET_FORMATS) {
      const sourcePath = path.join(project.path, `attendance.${format}`)
      await createSpreadsheet(sourcePath, format, false)
      const extraction = await extractResourcePack(sourcePath, classifyResourcePath(sourcePath))
      expect(extraction.status).toBe("ready")
      expect(extraction.extractor).toBe("sheetjs")
      expect(extraction.fullText).toContain("Asha")
      expect(extraction.fullText).toContain("José नमस्ते")
      expect(extraction.textArtifacts?.[0]?.relativePath).toBe("sheets/001-attendance.csv")
      expect(extraction.warnings.join(" ")).toContain("macros are not extracted or executed")
    }
  })

  test("preserves empty rows in dense XLSX and XLS worksheets", async () => {
    await using project = await tmpdir({ git: true })

    for (const format of ["xlsx", "xls"] as const) {
      const sourcePath = path.join(project.path, `sparse-rows.${format}`)
      await createSparseRowSpreadsheet(sourcePath, format)

      const extraction = await extractResourcePack(sourcePath, classifyResourcePath(sourcePath))
      expect(extraction.status).toBe("ready")
      expect(extraction.textArtifacts?.[0]?.content).toBe("Label\r\n\r\nAfter blank row\r\n")
    }
  })

  test(
    "keeps the backend event loop responsive while SheetJS parses and materializes a workbook",
    async () => {
      await using project = await tmpdir({ git: true })
      const sourcePath = path.join(project.path, "large-attendance.xls")
      await createLargeLegacySpreadsheet(sourcePath)

      const extractionPromise = extractResourcePack(sourcePath, classifyResourcePath(sourcePath))
      const firstCompletion = await Promise.race([
        extractionPromise.then(() => "extraction" as const),
        new Promise<"timer">((resolve) => {
          setTimeout(() => resolve("timer"), SPREADSHEET_RESPONSIVENESS_TIMER_MS)
        }),
      ])
      const extraction = await extractionPromise

      expect(firstCompletion).toBe("timer")
      expect(extraction.status).toBe("ready")
      expect(extraction.fullText).toContain("row-5000-column-10")
    },
    OFFICE_BUDGET_TEST_TIMEOUT_MS,
  )

  test("ignores unknown workbook extensions while extracting readable sheet data", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "vendor-extension.xlsx")
    await createSpreadsheet(sourcePath, "xlsx", false)
    await addUnknownWorkbookExtension(sourcePath)

    const extraction = await extractResourcePack(sourcePath, classifyResourcePath(sourcePath))
    expect(extraction.status).toBe("ready")
    expect(extraction.fullText).toContain("Asha")
  })

  test("retains the worker parser error as the extraction failure cause", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "invalid-package.xlsx")
    await createInvalidSpreadsheetArchive(sourcePath)

    try {
      await extractResourcePack(sourcePath, classifyResourcePath(sourcePath))
      throw new Error("Expected invalid workbook extraction to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      if (!(error instanceof Error)) throw error
      expect(error.message).toContain("Unable to parse XLSX spreadsheet")
      expect(error.cause).toBeInstanceOf(Error)
    }
  })

  test("splits an oversized PPTX slide through the shared resource chunker", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "long-lesson.pptx")
    await createPptx(sourcePath, PPTX_OVERSIZED_SLIDE)
    const extraction = await extractResourcePack(sourcePath, classifyResourcePath(sourcePath))
    if (!extraction.chunkUnits) throw new Error("Expected structured PPTX chunk units")

    const chunkFiles = await buildResourceChunkFiles({
      resourceAlias: "long-lesson",
      sourceRelpath: "long-lesson.pptx",
      format: "pptx",
      fullText: extraction.fullText,
      chunkUnits: extraction.chunkUnits,
    })
    expect(chunkFiles.length).toBeGreaterThan(extraction.chunkUnits.length)
  })

  test(
    "rejects XLSX workbooks that exceed the worksheet budget",
    async () => {
      await using project = await tmpdir({ git: true })
      const sourcePath = path.join(project.path, "too-many-sheets.xlsx")
      const workbook = XLSX.utils.book_new()
      for (let index = 0; index < SPREADSHEET_OVER_BUDGET_SHEET_COUNT; index += 1) {
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet([[index + 1]]),
          `Sheet ${index + 1}`,
        )
      }
      await writeSpreadsheetFixture({ filepath: sourcePath, format: "xlsx", workbook })

      await expect(
        extractResourcePack(sourcePath, classifyResourcePath(sourcePath)),
      ).rejects.toThrow("maximum supported count is 256")
    },
    OFFICE_BUDGET_TEST_TIMEOUT_MS,
  )

  test("rejects a far XLSX cell before SheetJS materializes the full row range", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "far-row.xlsx")
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([["header"]])
    XLSX.utils.sheet_add_aoa(worksheet, [["too far"]], {
      origin: `A${SPREADSHEET_OVER_BUDGET_ROW_NUMBER}`,
    })
    XLSX.utils.book_append_sheet(workbook, worksheet, "Far row")
    await writeSpreadsheetFixture({ filepath: sourcePath, format: "xlsx", workbook })

    await expect(extractResourcePack(sourcePath, classifyResourcePath(sourcePath))).rejects.toThrow(
      "maximum materialized row is 100000",
    )
  })

  test("writes XLSX CSV artifacts, lists them, and removes stale sheets on rebuild", async () => {
    await using project = await tmpdir({ git: true })
    const sourcePath = path.join(project.path, "attendance.xlsx")
    const packRoot = path.join(project.path, "pack")
    await createSpreadsheet(sourcePath, "xlsx")
    await mkdir(packRoot, { recursive: true })
    const sourceStats = await stat(sourcePath)
    await ensureResourcePackWithBuildInput(
      {
        directory: project.path,
        sourcePath,
        sourceRelpath: "attendance.xlsx",
        sourceStat: sourceStats,
        classification: classifyResourcePath(sourcePath),
        packPaths: {
          rootPath: packRoot,
          metadataPath: path.join(packRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
          entrypointPath: path.join(packRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
          fullPath: path.join(packRoot, RESOURCE_PACK_FULL_TEXT_FILE_NAME),
          tocPath: path.join(packRoot, RESOURCE_PACK_TOC_FILE_NAME),
          chunksDirPath: path.join(packRoot, RESOURCE_PACK_CHUNKS_DIR_NAME),
          pagesDirPath: path.join(packRoot, RESOURCE_PACK_PAGES_DIR_NAME),
        },
      },
      { waitForCompletion: true },
    )

    const entrypoint = await readFile(
      path.join(packRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
      "utf8",
    )
    expect(entrypoint).toContain("sheets/001-attendance.csv")
    expect(await readFile(path.join(packRoot, "sheets/001-attendance.csv"), "utf8")).toContain(
      "Learner,Score,Comment",
    )

    await createSpreadsheet(sourcePath, "xlsx", false)
    const rebuiltSourceStats = await stat(sourcePath)
    await ensureResourcePackWithBuildInput(
      {
        directory: project.path,
        sourcePath,
        sourceRelpath: "attendance.xlsx",
        sourceStat: rebuiltSourceStats,
        classification: classifyResourcePath(sourcePath),
        packPaths: {
          rootPath: packRoot,
          metadataPath: path.join(packRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
          entrypointPath: path.join(packRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
          fullPath: path.join(packRoot, RESOURCE_PACK_FULL_TEXT_FILE_NAME),
          tocPath: path.join(packRoot, RESOURCE_PACK_TOC_FILE_NAME),
          chunksDirPath: path.join(packRoot, RESOURCE_PACK_CHUNKS_DIR_NAME),
          pagesDirPath: path.join(packRoot, RESOURCE_PACK_PAGES_DIR_NAME),
        },
      },
      { waitForCompletion: true },
    )
    await expect(stat(path.join(packRoot, "sheets/002-teacher-notes.csv"))).rejects.toThrow()
  })

  test("prepares PPTX and every spreadsheet format through the prepare_resource registry", async () => {
    await using project = await tmpdir({ git: true })
    const pptxSourcePath = path.join(project.path, "lesson.pptx")
    await createPptx(pptxSourcePath)
    const spreadsheetSources = await Promise.all(
      NATIVE_SPREADSHEET_FORMATS.map(async (format) => {
        const sourcePath = path.join(project.path, `attendance.${format}`)
        await createSpreadsheet(sourcePath, format, false)
        return { format, sourcePath }
      }),
    )

    await addResource({
      directory: project.path,
      sourcePath: pptxSourcePath,
      alias: "lesson-slides",
    })
    await Promise.all(
      spreadsheetSources.map(({ format, sourcePath }) =>
        addResource({
          directory: project.path,
          sourcePath,
          alias: `attendance-${format}`,
        }),
      ),
    )

    const [pptxResource, ...spreadsheetResources] = await Promise.all([
      waitForPreparedResource({ directory: project.path, alias: "lesson-slides" }),
      ...NATIVE_SPREADSHEET_FORMATS.map((format) =>
        waitForPreparedResource({ directory: project.path, alias: `attendance-${format}` }),
      ),
    ])
    expect(pptxResource.record.format).toBe("pptx")
    if (!pptxResource.tocPath) throw new Error("Prepared PPTX did not produce a TOC.")
    if (!pptxResource.record.fullTextPath) {
      throw new Error("Prepared PPTX did not expose full text.")
    }
    expect(await readFile(pptxResource.tocPath, "utf8")).toContain("Slide 1")
    expect(
      await readFile(path.resolve(project.path, pptxResource.record.fullTextPath), "utf8"),
    ).toContain("Evaporation lesson")
    for (const [index, resource] of spreadsheetResources.entries()) {
      expect(resource.record.format).toBe(NATIVE_SPREADSHEET_FORMATS[index])
      if (!resource.record.fullTextPath) {
        throw new Error(`Prepared ${NATIVE_SPREADSHEET_FORMATS[index]} did not expose full text.`)
      }
      expect(await readFile(resource.entrypointPath, "utf8")).toContain("sheets/001-attendance.csv")
      expect(
        await readFile(path.resolve(project.path, resource.record.fullTextPath), "utf8"),
      ).toContain("Asha")
    }
  })

  test("rejects malformed PPTX and every admitted spreadsheet container", async () => {
    await using project = await tmpdir({ git: true })
    const brokenPptx = path.join(project.path, "broken.pptx")
    const brokenSpreadsheets = NATIVE_SPREADSHEET_FORMATS.map((format) =>
      path.join(project.path, `broken.${format}`),
    )
    await writeFile(brokenPptx, "not a zip", "utf8")
    await Promise.all(
      brokenSpreadsheets.map((sourcePath) => writeFile(sourcePath, "not a spreadsheet", "utf8")),
    )

    await expect(
      extractResourcePack(brokenPptx, classifyResourcePath(brokenPptx)),
    ).rejects.toThrow()
    for (const sourcePath of brokenSpreadsheets) {
      await expect(
        extractResourcePack(sourcePath, classifyResourcePath(sourcePath)),
      ).rejects.toThrow()
    }
  })
})
