import fs from "node:fs"

const FILE_NOT_FOUND_ERROR = "File not found"
const DEFAULT_BINARY_MIME_TYPE = "application/octet-stream"
const BYTE_RANGE_UNIT = "bytes"
const HTTP_PARTIAL_CONTENT_STATUS = 206
const HTTP_RANGE_NOT_SATISFIABLE_STATUS = 416
const FILE_RANGE_STREAM_CHUNK_BYTES = 64 * 1024
const CONTENT_LENGTH_HEADER = "content-length"
const CONTENT_TYPE_HEADER = "content-type"
const INLINE_CONTENT_DISPOSITION_PREFIX = "inline; filename*=UTF-8''"
const BYTE_RANGE_DECIMAL_TOKEN_PATTERN = /^\d+$/u

type RawFileRecord =
  | {
      ok: true
      filepath: string
      size: number
    }
  | {
      ok: false
      response: Response
    }

type RawFileByteRange = {
  start: number
  end: number
}

type RawFileByteRangeResolution =
  | { kind: "full" }
  | { kind: "partial"; range: RawFileByteRange }
  | { kind: "unsatisfiable" }

function buildInlineContentDisposition(filename: string): string {
  return `${INLINE_CONTENT_DISPOSITION_PREFIX}${encodeURIComponent(filename)}`
}

function readRawFileRecord(filepath: string): RawFileRecord {
  try {
    const realpath = fs.realpathSync.native(filepath)
    const stats = fs.statSync(realpath)
    if (!stats.isFile()) {
      return {
        ok: false,
        response: Response.json({ error: FILE_NOT_FOUND_ERROR }, { status: 404 }),
      }
    }
    return {
      ok: true,
      filepath: realpath,
      size: stats.size,
    }
  } catch {
    return {
      ok: false,
      response: Response.json({ error: FILE_NOT_FOUND_ERROR }, { status: 404 }),
    }
  }
}

function readRawFileMimeType(filepath: string): string {
  return Bun.file(filepath).type || DEFAULT_BINARY_MIME_TYPE
}

function buildRawFileHeaders(input: {
  downloadName: string
  filepath: string
  size: number
}): Record<string, string> {
  return {
    "content-disposition": buildInlineContentDisposition(input.downloadName),
    [CONTENT_LENGTH_HEADER]: String(input.size),
    [CONTENT_TYPE_HEADER]: readRawFileMimeType(input.filepath),
  }
}

function resolveRawFileByteRange(
  rangeHeader: string | undefined,
  size: number,
): RawFileByteRangeResolution {
  if (!rangeHeader) return { kind: "full" }

  const [unit, value, extra] = rangeHeader.trim().split("=")
  if (unit?.toLowerCase() !== BYTE_RANGE_UNIT || !value || extra !== undefined) {
    return { kind: "unsatisfiable" }
  }
  if (value.includes(",")) {
    return { kind: "unsatisfiable" }
  }

  const separatorIndex = value.indexOf("-")
  if (separatorIndex < 0 || value.indexOf("-", separatorIndex + 1) >= 0) {
    return { kind: "unsatisfiable" }
  }

  const startValue = value.slice(0, separatorIndex).trim()
  const endValue = value.slice(separatorIndex + 1).trim()
  if (!startValue && !endValue) {
    return { kind: "unsatisfiable" }
  }

  if (!startValue) {
    if (!BYTE_RANGE_DECIMAL_TOKEN_PATTERN.test(endValue)) {
      return { kind: "unsatisfiable" }
    }
    const suffixLength = Number.parseInt(endValue, 10)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size <= 0) {
      return { kind: "unsatisfiable" }
    }
    return {
      kind: "partial",
      range: {
        start: Math.max(size - suffixLength, 0),
        end: size - 1,
      },
    }
  }

  if (!BYTE_RANGE_DECIMAL_TOKEN_PATTERN.test(startValue)) {
    return { kind: "unsatisfiable" }
  }
  const start = Number.parseInt(startValue, 10)
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) {
    return { kind: "unsatisfiable" }
  }

  if (!endValue) {
    return {
      kind: "partial",
      range: {
        start,
        end: size - 1,
      },
    }
  }

  if (!BYTE_RANGE_DECIMAL_TOKEN_PATTERN.test(endValue)) {
    return { kind: "unsatisfiable" }
  }
  const requestedEnd = Number.parseInt(endValue, 10)
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return { kind: "unsatisfiable" }
  }

  return {
    kind: "partial",
    range: {
      start,
      end: Math.min(requestedEnd, size - 1),
    },
  }
}

function createRawFileRangeStream(
  filepath: string,
  range: RawFileByteRange,
): ReadableStream<Uint8Array> {
  let fileHandle: fs.promises.FileHandle | undefined
  let offset = range.start

  const closeFile = async () => {
    const handle = fileHandle
    fileHandle = undefined
    await handle?.close()
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset > range.end) {
        await closeFile()
        controller.close()
        return
      }

      try {
        fileHandle ??= await fs.promises.open(filepath, "r")
        const byteLength = Math.min(FILE_RANGE_STREAM_CHUNK_BYTES, range.end - offset + 1)
        const buffer = new Uint8Array(byteLength)
        const { bytesRead } = await fileHandle.read(buffer, 0, byteLength, offset)
        if (bytesRead === 0) {
          await closeFile()
          controller.close()
          return
        }

        offset += bytesRead
        controller.enqueue(bytesRead === byteLength ? buffer : buffer.subarray(0, bytesRead))
      } catch (error) {
        await closeFile().catch(() => undefined)
        controller.error(error)
      }
    },
    async cancel() {
      await closeFile().catch(() => undefined)
    },
  })
}

function readRawFileResponse(input: {
  absolutePath: string
  downloadName: string
  includeBody: boolean
  rangeHeader: string | undefined
}): Response {
  const fileRecord = readRawFileRecord(input.absolutePath)
  if (!fileRecord.ok) return fileRecord.response

  const rangeResolution = resolveRawFileByteRange(input.rangeHeader, fileRecord.size)
  const baseHeaders = {
    ...buildRawFileHeaders({
      downloadName: input.downloadName,
      filepath: fileRecord.filepath,
      size: fileRecord.size,
    }),
    "accept-ranges": BYTE_RANGE_UNIT,
  }

  if (rangeResolution.kind === "unsatisfiable") {
    return new Response(null, {
      status: HTTP_RANGE_NOT_SATISFIABLE_STATUS,
      headers: {
        ...baseHeaders,
        "content-length": "0",
        "content-range": `${BYTE_RANGE_UNIT} */${fileRecord.size}`,
      },
    })
  }

  if (rangeResolution.kind === "full") {
    return new Response(input.includeBody ? Bun.file(fileRecord.filepath) : null, {
      headers: baseHeaders,
    })
  }

  const { start, end } = rangeResolution.range
  const contentLength = end - start + 1
  return new Response(
    input.includeBody ? createRawFileRangeStream(fileRecord.filepath, rangeResolution.range) : null,
    {
      status: HTTP_PARTIAL_CONTENT_STATUS,
      headers: {
        ...baseHeaders,
        "content-length": String(contentLength),
        "content-range": `${BYTE_RANGE_UNIT} ${start}-${end}/${fileRecord.size}`,
      },
    },
  )
}

export { buildRawFileHeaders, readRawFileRecord, readRawFileResponse }
