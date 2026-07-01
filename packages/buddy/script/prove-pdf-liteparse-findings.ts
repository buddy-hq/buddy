#!/usr/bin/env bun

import { readdir, rm, stat, writeFile, mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { extractResourcePack } from "../src/resource-packs/extractors"
import type {
  ResourceClassification,
  ResourceExtractionResult,
} from "../src/resource-packs/contracts"

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(MODULE_DIR, "../../..")
const GENERATED_PDF_TEXT = "Buddy LiteParse outline proof"
const GENERATED_OUTLINE_TITLE = "Chapter One"
const GENERATED_OUTLINE_FILENAME = "buddy-liteparse-outline-proof.pdf" as const
const PDF_EXTRACTION_MODE_ENV = "BUDDY_PDF_EXTRACTION_MODE" as const
const LITEPARSE_NO_OCR_MODE = "liteparse-no-ocr" as const
const LITEPARSE_EXTRACTOR = "@llamaindex/liteparse" as const
const PDF_OUTLINE_WARNING_PREFIX = "PDF outline extraction failed:" as const
const CHAPTER_UNIT_KIND = "chapter" as const
const PDF_CLASSIFICATION = {
  kind: "pack",
  format: "pdf",
  mime: "application/pdf",
} satisfies ResourceClassification
const DOWNLOADS_MAX_SCAN_DEPTH = 3
const DOWNLOADS_MAX_CANDIDATES = 50
const DOWNLOADS_MAX_SOURCE_BYTES = 15_000_000
const PDFJS_OPERATION_TIMEOUT_MS = 5_000
const TARGETED_TEST_TIMEOUT_MS = 120_000
const TARGETED_TEST_COMMAND: string[] = [
  "bun",
  "test",
  "--preload",
  "./packages/buddy/test/preload.ts",
  "packages/buddy/test/resources/pdf-liteparse.test.ts",
]
const LOG_TAIL_LENGTH = 4_000

type ProofStep = {
  name: string
  run(): Promise<void>
}

const failures: string[] = []

await withTemporaryDirectory(async (temporaryDirectory) => {
  const generatedPdfPath = path.join(temporaryDirectory, GENERATED_OUTLINE_FILENAME)
  await writeFile(generatedPdfPath, createOutlinePdf(), "binary")

  const proofSteps: ProofStep[] = [
    {
      name: "generated outline PDF keeps LiteParse metadata",
      run: async () => {
        await assertLiteParseOutlineExtraction({
          label: "generated outline PDF",
          sourcePath: generatedPdfPath,
          expectedTitle: GENERATED_OUTLINE_TITLE,
        })
      },
    },
    {
      name: "Downloads outline PDF keeps LiteParse metadata",
      run: async () => {
        const downloadsPdf = await findDownloadsPdfWithOutline()
        if (!downloadsPdf) {
          console.log("SKIP Downloads outline PDF: no small outlined PDF found.")
          return
        }
        await assertLiteParseOutlineExtraction({
          label: "Downloads outline PDF",
          sourcePath: downloadsPdf,
        })
      },
    },
    {
      name: "pdf-liteparse test has sufficient timeout budget",
      run: assertTargetedPdfLiteParseTestPasses,
    },
  ]

  for (const proofStep of proofSteps) {
    await runProofStep(proofStep)
  }
})

if (failures.length > 0) {
  throw new Error(`PDF LiteParse proof failed:\n${failures.join("\n\n")}`)
}

console.log("PDF LiteParse findings proof passed.")

async function runProofStep(proofStep: ProofStep): Promise<void> {
  try {
    await proofStep.run()
    console.log(`PASS ${proofStep.name}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`FAIL ${proofStep.name}\n${message}`)
    console.error(`FAIL ${proofStep.name}`)
    console.error(message)
  }
}

async function assertLiteParseOutlineExtraction(input: {
  label: string
  sourcePath: string
  expectedTitle?: string
}): Promise<void> {
  const result = await withPdfExtractionMode(LITEPARSE_NO_OCR_MODE, async () => {
    return await extractResourcePack(input.sourcePath, PDF_CLASSIFICATION)
  })

  assertExtractionResultHasOutlineMetadata(result, input)
}

function assertExtractionResultHasOutlineMetadata(
  result: ResourceExtractionResult,
  input: {
    label: string
    expectedTitle?: string
  },
): void {
  if (result.extractor !== LITEPARSE_EXTRACTOR) {
    throw new Error(`${input.label} used ${result.extractor}, not ${LITEPARSE_EXTRACTOR}.`)
  }

  const metadataWarning = result.warnings.find((warning) =>
    warning.startsWith(PDF_OUTLINE_WARNING_PREFIX),
  )
  if (metadataWarning) {
    throw new Error(`${input.label} lost PDF outline metadata: ${metadataWarning}`)
  }

  if (!result.tocMarkdown) {
    throw new Error(`${input.label} did not produce table-of-contents markdown.`)
  }

  if (input.expectedTitle && !result.tocMarkdown.includes(input.expectedTitle)) {
    throw new Error(`${input.label} TOC did not include ${input.expectedTitle}.`)
  }

  const hasChapterUnit = result.chunkUnits?.some(
    (unit) => unit.unitKind === CHAPTER_UNIT_KIND,
  )
  if (!hasChapterUnit) {
    throw new Error(`${input.label} did not produce outline-backed chapter chunks.`)
  }
}

async function assertTargetedPdfLiteParseTestPasses(): Promise<void> {
  const child = Bun.spawn(TARGETED_TEST_COMMAND, {
    cwd: REPOSITORY_ROOT,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await withTimeout(
    Promise.all([child.exited, readStream(child.stdout), readStream(child.stderr)]),
    TARGETED_TEST_TIMEOUT_MS,
    () => child.kill(),
  )

  if (exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${TARGETED_TEST_COMMAND.join(" ")}`,
        tail(stdout),
        tail(stderr),
      ]
        .filter((part) => part.trim().length > 0)
        .join("\n"),
    )
  }
}

async function findDownloadsPdfWithOutline(): Promise<string | undefined> {
  const downloadsDirectory = path.join(os.homedir(), "Downloads")
  let scannedCandidates = 0
  for await (const sourcePath of walkPdfFiles(downloadsDirectory, DOWNLOADS_MAX_SCAN_DEPTH)) {
    const sourceStats = await stat(sourcePath).catch(() => undefined)
    if (!sourceStats || sourceStats.size > DOWNLOADS_MAX_SOURCE_BYTES) continue
    scannedCandidates += 1
    if (await pdfHasOutline(sourcePath)) return sourcePath
    if (scannedCandidates >= DOWNLOADS_MAX_CANDIDATES) return undefined
  }
  return undefined
}

async function* walkPdfFiles(
  directory: string,
  maxDepth: number,
  depth = 0,
): AsyncGenerator<string> {
  if (depth > maxDepth) return

  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      yield* walkPdfFiles(entryPath, maxDepth, depth + 1)
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) {
      yield entryPath
    }
  }
}

async function pdfHasOutline(sourcePath: string): Promise<boolean> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const bytes = new Uint8Array(await Bun.file(sourcePath).arrayBuffer())
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    const document = await withTimeout(loadingTask.promise, PDFJS_OPERATION_TIMEOUT_MS)
    const outline = await withTimeout(document.getOutline(), PDFJS_OPERATION_TIMEOUT_MS)
    return Array.isArray(outline) && outline.length > 0
  } catch {
    return false
  }
}

async function withPdfExtractionMode<T>(
  mode: string,
  run: () => Promise<T>,
): Promise<T> {
  const previousMode = process.env[PDF_EXTRACTION_MODE_ENV]
  process.env[PDF_EXTRACTION_MODE_ENV] = mode
  try {
    return await run()
  } finally {
    if (previousMode === undefined) {
      delete process.env[PDF_EXTRACTION_MODE_ENV]
    } else {
      process.env[PDF_EXTRACTION_MODE_ENV] = previousMode
    }
  }
}

async function withTemporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "buddy-pdf-liteparse-proof-"))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function createOutlinePdf(): string {
  const content = `BT\n/F1 24 Tf\n72 720 Td\n(${escapePdfText(GENERATED_PDF_TEXT)}) Tj\nET`
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R /PageMode /UseOutlines >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Outlines /First 7 0 R /Last 7 0 R /Count 1 >>",
    `<< /Title (${escapePdfText(GENERATED_OUTLINE_TITLE)}) /Parent 6 0 R /Dest [3 0 R /XYZ null null null] >>`,
  ])
}

function buildPdf(objects: string[]): string {
  let body = "%PDF-1.4\n"
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  const xref = offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")
  return `${body}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
}

function escapePdfText(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)")
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return ""
  return await new Response(stream).text()
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  onTimeout?: () => void,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutTask = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      onTimeout?.()
      reject(new Error(`Timed out after ${milliseconds}ms.`))
    }, milliseconds)
  })

  try {
    return await Promise.race([promise, timeoutTask])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function tail(text: string): string {
  if (text.length <= LOG_TAIL_LENGTH) return text
  return text.slice(text.length - LOG_TAIL_LENGTH)
}
