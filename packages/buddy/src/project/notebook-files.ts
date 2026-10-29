import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import { isPathInsideDirectory } from "../storage/path-containment"
import { parseErrorCode } from "@buddy/transcript-contract/parse-external"
import { scanNotebookFilesWithDeadline } from "./notebook-file-scan"

const FileNode = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  absolute: Schema.String,
  type: Schema.Literals(["file", "directory"]),
  ignored: Schema.Boolean,
}).annotate({ identifier: "FileNode" })

const Hunk = Schema.Struct({
  oldStart: Schema.Number,
  oldLines: Schema.Number,
  newStart: Schema.Number,
  newLines: Schema.Number,
  lines: Schema.Array(Schema.String),
})

const Patch = Schema.Struct({
  oldFileName: Schema.String,
  newFileName: Schema.String,
  oldHeader: Schema.optional(Schema.String),
  newHeader: Schema.optional(Schema.String),
  hunks: Schema.Array(Hunk),
  index: Schema.optional(Schema.String),
})

const FileContent = Schema.Struct({
  type: Schema.Literals(["text", "binary"]),
  content: Schema.String,
  diff: Schema.optional(Schema.String),
  patch: Schema.optional(Patch),
  encoding: Schema.optional(Schema.Literal("base64")),
  mimeType: Schema.optional(Schema.String),
}).annotate({ identifier: "FileContent" })

const KNOWN_BINARY_FILE_EXTENSIONS = new Set([
  ".7z",
  ".avif",
  ".bmp",
  ".class",
  ".dll",
  ".dmg",
  ".doc",
  ".docx",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".numbers",
  ".o",
  ".ods",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".so",
  ".tar",
  ".wasm",
  ".webp",
  ".xls",
  ".xlsb",
  ".xlsm",
  ".xlsx",
  ".zip",
])

const NOTEBOOK_FILE_INDEX_SCAN_LIMIT = 25_000

export type NotebookFileIndexInput = {
  scanLimit?: number
  signal?: AbortSignal
}

export type NotebookFileIndex = {
  paths: string[]
  partial: boolean
}

function hasErrorCode<TError>(error: TError, code: string): boolean {
  return parseErrorCode(error) === code
}

function toRelativePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\/+/, "")
}

async function realpathIfExists(filePath: string): Promise<string | undefined> {
  return fs.realpath(filePath).catch((error) => {
    if (hasErrorCode(error, "ENOENT")) return undefined
    throw error
  })
}

async function resolveContainedPath(directory: string, filePath: string): Promise<string> {
  const target = path.resolve(directory, toRelativePath(filePath))
  if (!isPathInsideDirectory(directory, target)) {
    throw new Error("Access denied: path escapes project directory")
  }

  const realTarget = await realpathIfExists(target)
  if (!realTarget) return target
  if (!isPathInsideDirectory(await fs.realpath(directory), realTarget)) {
    throw new Error("Access denied: path escapes project directory")
  }
  return realTarget
}

async function readFileBytes(filePath: string): Promise<Uint8Array | undefined> {
  return fs.readFile(filePath).catch((error) => {
    if (hasErrorCode(error, "ENOENT")) return undefined
    throw error
  })
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  if (bytes.includes(0)) return undefined
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

function normalizePathForClient(filePath: string): string {
  return filePath.split(path.sep).join("/")
}

function hasKnownBinaryExtension(filePath: string): boolean {
  return KNOWN_BINARY_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

export namespace File {
  export const Node = FileNode
  export type Node = Schema.Schema.Type<typeof FileNode>

  export const Content = FileContent
  export type Content = Schema.Schema.Type<typeof FileContent>

  export async function listSearchPaths(
    directory: string,
    input: NotebookFileIndexInput = {},
  ): Promise<NotebookFileIndex> {
    const scanLimit = Math.min(
      NOTEBOOK_FILE_INDEX_SCAN_LIMIT,
      Math.max(1, input.scanLimit ?? NOTEBOOK_FILE_INDEX_SCAN_LIMIT),
    )
    input.signal?.throwIfAborted()
    const scan = await scanNotebookFilesWithDeadline({
      directory,
      limit: scanLimit,
      signal: input.signal,
    })
    input.signal?.throwIfAborted()
    return { paths: scan.paths.toSorted(), partial: scan.partial }
  }

  export async function read(directory: string, filePath: string): Promise<Content> {
    const target = await resolveContainedPath(directory, filePath)
    const bytes = await readFileBytes(target)
    if (!bytes) return { type: "text", content: "" }
    if (hasKnownBinaryExtension(target)) return { type: "binary", content: "" }

    const content = decodeUtf8(bytes)
    if (content === undefined) return { type: "binary", content: "" }

    return { type: "text", content: content.trim() }
  }

  export async function list(directory: string, input?: string): Promise<Node[]> {
    const target = await resolveContainedPath(directory, input ?? ".")
    const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((entry) => entry.name !== ".git" && entry.name !== ".DS_Store")
      .map((entry) => {
        const absolute = path.join(target, entry.name)
        const relative = normalizePathForClient(path.relative(directory, absolute))
        const type: Node["type"] = entry.isDirectory() ? "directory" : "file"
        return {
          name: entry.name,
          path: relative,
          absolute,
          type,
          ignored: false,
        }
      })
      .toSorted((left, right) => {
        if (left.type !== right.type) return left.type === "directory" ? -1 : 1
        return left.name.localeCompare(right.name)
      })
  }
}
