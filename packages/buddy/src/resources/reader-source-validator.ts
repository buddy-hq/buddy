import { promises as fs } from "node:fs"
import { BlobReader, TextWriter, ZipReader, type Entry, type FileEntry } from "@zip.js/zip.js"
import {
  inspectReaderSourceBytes,
  readerSourceFormatFromPath,
  type ReaderSourceFormat,
  type ReaderSourceValidity,
} from "@buddy/workspace-file-policy"

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

const validationCache = new Map<string, CachedReaderSourceValidation>()

const PDF_TAIL_PROBE_BYTES = 65_536
const PDF_XREF_PROBE_BYTES = 1_024
const PDF_EOF_MARKER = "%%EOF" as const
const PDF_STARTXREF_MARKER = "startxref" as const
const PDF_XREF_TABLE_MARKER = "xref" as const
const PDF_XREF_STREAM_PATTERN = /^\s*\d+\s+\d+\s+obj\b[\s\S]*?\/Type\s*\/XRef\b/u

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isFileEntry(entry: Entry): entry is FileEntry {
  return !entry.directory && typeof entry.getData === "function"
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

async function probePdf(input: {
  filepath: string
  size: number
}): Promise<ReaderSourceValidation> {
  const tailLength = Math.min(PDF_TAIL_PROBE_BYTES, input.size)
  const tailPosition = Math.max(0, input.size - tailLength)
  try {
    const tailText = decodeProbeText(
      await readFileSegment({
        filepath: input.filepath,
        position: tailPosition,
        length: tailLength,
      }),
    )
    const eofIndex = tailText.lastIndexOf(PDF_EOF_MARKER)
    if (eofIndex < 0) {
      return {
        format: "pdf",
        sourceValidity: "invalid",
        reason: "The PDF is missing its EOF marker.",
      }
    }

    const startXrefIndex = tailText.lastIndexOf(PDF_STARTXREF_MARKER, eofIndex)
    if (startXrefIndex < 0) {
      return {
        format: "pdf",
        sourceValidity: "invalid",
        reason: "The PDF is missing its startxref marker.",
      }
    }

    const xrefOffset = parsePdfStartXrefOffset({ tailText, startXrefIndex })
    if (xrefOffset === null || xrefOffset < 0 || xrefOffset >= input.size) {
      return {
        format: "pdf",
        sourceValidity: "invalid",
        reason: "The PDF startxref marker does not reference a valid byte offset.",
      }
    }

    const xrefProbe = await readFileSegment({
      filepath: input.filepath,
      position: xrefOffset,
      length: Math.min(PDF_XREF_PROBE_BYTES, input.size - xrefOffset),
    })
    if (!xrefProbeLooksValid(xrefProbe)) {
      return {
        format: "pdf",
        sourceValidity: "invalid",
        reason: "The PDF startxref marker does not reference an xref table or xref stream.",
      }
    }

    return { format: "pdf", sourceValidity: "valid", reason: null }
  } catch (error) {
    return {
      format: "pdf",
      sourceValidity: "invalid",
      reason: `PDF structural probe failed: ${errorMessage(error)}`,
    }
  }
}

async function probeEpub(bytes: Uint8Array): Promise<ReaderSourceValidation> {
  const reader = new ZipReader<Blob>(new BlobReader(new Blob([Uint8Array.from(bytes)])))
  try {
    const entries = await reader.getEntries()
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

  const handle = await fs.open(filepath, "r")
  let prefix: Uint8Array
  try {
    const buffer = new Uint8Array(Math.min(READER_SOURCE_PREFIX_BYTES, stat.size))
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0)
    prefix = buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
  const inspection = inspectReaderSourceBytes({ path: filepath, bytes: prefix })
  if (inspection.sourceValidity === "invalid") {
    validationCache.set(filepath, { identity, validation: inspection })
    return inspection
  }

  const validation =
    format === "pdf"
      ? await probePdf({ filepath, size: stat.size })
      : await probeEpub(new Uint8Array(await fs.readFile(filepath)))
  validationCache.set(filepath, { identity, validation })
  return validation
}

export function clearReaderSourceValidationCache(): void {
  validationCache.clear()
}
