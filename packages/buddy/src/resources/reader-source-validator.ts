import { promises as fs } from "node:fs"
import { BlobReader, TextWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js"
import {
  inspectReaderSourceBytes,
  readerSourceFormatFromPath,
  type ReaderSourceFormat,
  type ReaderSourceValidity,
} from "@buddy/workspace-file-policy"
import {
  assertResourceArchiveBudget,
  assertResourceSourceSize,
  ResourceBudgetExceededError,
} from "../resource-packs/budgets"
import { validatePdfDocumentInWorker } from "./pdf-validation"

const READER_SOURCE_PREFIX_BYTES = 1024
const EPUB_MIMETYPE_ENTRY = "mimetype" as const
const EPUB_MIMETYPE = "application/epub+zip" as const
const EPUB_CONTAINER_ENTRY = "META-INF/container.xml" as const
const EPUB_ROOTFILE_PATTERN = /\bfull-path\s*=\s*["']([^"']+)["']/iu

export type ReaderSourceValidation = {
  format: ReaderSourceFormat | null
  sourceValidity: ReaderSourceValidity
  reason: string | null
}

type CachedReaderSourceValidation = {
  identity: string
  validation: ReaderSourceValidation
}

type PendingReaderSourceValidation = {
  identity: string
  task: Promise<ReaderSourceValidation>
}

const validationCache = new Map<string, CachedReaderSourceValidation>()
const pendingValidations = new Map<string, PendingReaderSourceValidation>()

const PDF_TAIL_PROBE_BYTES = 65_536
const PDF_XREF_PROBE_BYTES = 1_024
const PDF_EOF_MARKER = "%%EOF" as const
const PDF_STARTXREF_MARKER = "startxref" as const
const PDF_XREF_TABLE_MARKER = "xref" as const
const PDF_XREF_STREAM_PATTERN = /^\s*\d+\s+\d+\s+obj\b[\s\S]*?\/Type\s*\/XRef\b/u

function errorMessage<TError>(error: TError): string {
  return error instanceof Error ? error.message : String(error)
}

function isFileEntry(entry: Entry): entry is FileEntry {
  return !entry.directory && isFunctionValue(entry.getData)
}

const OBJECT_FUNCTION_TAG = "[object Function]"
const OBJECT_ASYNC_FUNCTION_TAG = "[object AsyncFunction]"

function isFunctionValue<TValue>(value: TValue): boolean {
  const tag = Object.prototype.toString.call(value)
  return tag === OBJECT_FUNCTION_TAG || tag === OBJECT_ASYNC_FUNCTION_TAG
}

async function readEntryText(entry: FileEntry): Promise<string> {
  return entry.getData(new TextWriter())
}

function decodeProbeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes)
}

async function readFileSegment(input: {
  filepath: string
  position: number
  length: number
}): Promise<Uint8Array> {
  const handle = await fs.open(input.filepath, "r")
  try {
    const buffer = new Uint8Array(input.length)
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, input.position)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function parsePdfStartXrefOffset(input: {
  tailText: string
  startXrefIndex: number
}): number | null {
  const offsetText = input.tailText.slice(input.startXrefIndex + PDF_STARTXREF_MARKER.length)
  const match = /^\s*(\d+)/u.exec(offsetText)
  if (!match) return null

  const offset = Number(match[1])
  return Number.isSafeInteger(offset) ? offset : null
}

function xrefProbeLooksValid(bytes: Uint8Array): boolean {
  const text = decodeProbeText(bytes)
  const trimmed = text.trimStart()
  return trimmed.startsWith(PDF_XREF_TABLE_MARKER) || PDF_XREF_STREAM_PATTERN.test(text)
}

async function recoverPdfValidation(input: {
  filepath: string
  reason: string
}): Promise<ReaderSourceValidation> {
  const valid = await validatePdfDocumentInWorker(input.filepath)
  return valid
    ? { format: "pdf", sourceValidity: "valid", reason: null }
    : { format: "pdf", sourceValidity: "invalid", reason: input.reason }
}

async function probePdf(input: {
  filepath: string
  size: number
}): Promise<ReaderSourceValidation> {
  const tailLength = Math.min(PDF_TAIL_PROBE_BYTES, input.size)
  const tailPosition = Math.max(0, input.size - tailLength)
  const tailText = decodeProbeText(
    await readFileSegment({
      filepath: input.filepath,
      position: tailPosition,
      length: tailLength,
    }),
  )
  const eofIndex = tailText.lastIndexOf(PDF_EOF_MARKER)
  if (eofIndex < 0) {
    return await recoverPdfValidation({
      filepath: input.filepath,
      reason: "The PDF is missing its EOF marker.",
    })
  }

  const startXrefIndex = tailText.lastIndexOf(PDF_STARTXREF_MARKER, eofIndex)
  if (startXrefIndex < 0) {
    return await recoverPdfValidation({
      filepath: input.filepath,
      reason: "The PDF is missing its startxref marker.",
    })
  }

  const xrefOffset = parsePdfStartXrefOffset({ tailText, startXrefIndex })
  if (xrefOffset === null || xrefOffset < 0 || xrefOffset >= input.size) {
    return await recoverPdfValidation({
      filepath: input.filepath,
      reason: "The PDF startxref marker does not reference a valid byte offset.",
    })
  }

  const xrefProbe = await readFileSegment({
    filepath: input.filepath,
    position: xrefOffset,
    length: Math.min(PDF_XREF_PROBE_BYTES, input.size - xrefOffset),
  })
  if (!xrefProbeLooksValid(xrefProbe)) {
    return await recoverPdfValidation({
      filepath: input.filepath,
      reason: "The PDF startxref marker does not reference an xref table or xref stream.",
    })
  }

  return { format: "pdf", sourceValidity: "valid", reason: null }
}

async function probeEpub(bytes: Uint8Array): Promise<ReaderSourceValidation> {
  const reader = new ZipReader<Blob>(new BlobReader(new Blob([Uint8Array.from(bytes)])))
  try {
    const entries = await reader.getEntries()
    assertResourceArchiveBudget(entries)
    const files = new Map(
      entries.filter(isFileEntry).map((entry) => [entry.filename.replaceAll("\\", "/"), entry]),
    )
    const mimetype = files.get(EPUB_MIMETYPE_ENTRY)
    if (!mimetype || (await readEntryText(mimetype)).trim() !== EPUB_MIMETYPE) {
      return {
        format: "epub",
        sourceValidity: "invalid",
        reason: "The EPUB container is missing its required mimetype entry.",
      }
    }
    const container = files.get(EPUB_CONTAINER_ENTRY)
    if (!container) {
      return {
        format: "epub",
        sourceValidity: "invalid",
        reason: "The EPUB container is missing META-INF/container.xml.",
      }
    }
    const rootfile = EPUB_ROOTFILE_PATTERN.exec(await readEntryText(container))?.[1]
    if (!rootfile || !files.has(rootfile)) {
      return {
        format: "epub",
        sourceValidity: "invalid",
        reason: "The EPUB container does not reference an existing package document.",
      }
    }
    return { format: "epub", sourceValidity: "valid", reason: null }
  } catch (error) {
    return {
      format: "epub",
      sourceValidity: "invalid",
      reason: `EPUB parser probe failed: ${errorMessage(error)}`,
    }
  } finally {
    await reader.close().catch(() => undefined)
  }
}

export async function validateReaderSourcePath(filepath: string): Promise<ReaderSourceValidation> {
  const format = readerSourceFormatFromPath(filepath)
  if (!format) {
    return { format: null, sourceValidity: "unknown", reason: null }
  }

  const stat = await fs.stat(filepath).catch(() => undefined)
  if (!stat?.isFile()) {
    return {
      format,
      sourceValidity: "invalid",
      reason: "The reader source file does not exist.",
    }
  }
  const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
  const cached = validationCache.get(filepath)
  if (cached?.identity === identity) return cached.validation
  const pending = pendingValidations.get(filepath)
  if (pending?.identity === identity) return await pending.task

  const task = validateExistingReaderSource({ filepath, format, size: stat.size })
  pendingValidations.set(filepath, { identity, task })
  try {
    const validation = await task
    validationCache.set(filepath, { identity, validation })
    return validation
  } finally {
    if (pendingValidations.get(filepath)?.task === task) pendingValidations.delete(filepath)
  }
}

async function validateExistingReaderSource(input: {
  filepath: string
  format: ReaderSourceFormat
  size: number
}): Promise<ReaderSourceValidation> {
  try {
    assertResourceSourceSize(input.size)
  } catch (error) {
    if (!(error instanceof ResourceBudgetExceededError)) throw error
    return {
      format: input.format,
      sourceValidity: "invalid",
      reason: error.message,
    }
  }

  const handle = await fs.open(input.filepath, "r")
  let prefix: Uint8Array
  try {
    const buffer = new Uint8Array(Math.min(READER_SOURCE_PREFIX_BYTES, input.size))
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0)
    prefix = buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
  const inspection = inspectReaderSourceBytes({ path: input.filepath, bytes: prefix })
  if (inspection.sourceValidity === "invalid") return inspection

  return input.format === "pdf"
    ? await probePdf({ filepath: input.filepath, size: input.size })
    : await probeEpub(new Uint8Array(await fs.readFile(input.filepath)))
}

export function clearReaderSourceValidationCache(): void {
  validationCache.clear()
  pendingValidations.clear()
}
