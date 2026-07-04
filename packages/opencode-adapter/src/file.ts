import fs from "node:fs/promises"
import path from "node:path"
import { Ripgrep } from "@opencode-ai/core/filesystem/ripgrep"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import { Effect, Schema, Stream } from "effect"
import { makeRuntime } from "opencode/effect/run-service"
import { Instance } from "./instance"

const FileInfo = Schema.Struct({
  path: Schema.String,
  added: NonNegativeInt,
  removed: NonNegativeInt,
  status: Schema.Literals(["added", "deleted", "modified"]),
}).annotate({ identifier: "File" })

const FileNode = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  absolute: Schema.String,
  type: Schema.Literals(["file", "directory"]),
  ignored: Schema.Boolean,
}).annotate({ identifier: "FileNode" })

const Hunk = Schema.Struct({
  oldStart: NonNegativeInt,
  oldLines: NonNegativeInt,
  newStart: NonNegativeInt,
  newLines: NonNegativeInt,
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
  ".o",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".so",
  ".tar",
  ".wasm",
  ".webp",
  ".xls",
  ".xlsx",
  ".zip",
])

const NOTEBOOK_FILE_SEARCH_SCAN_LIMIT = 25_000
const NOTEBOOK_FILE_SEARCH_DEFAULT_LIMIT = 20
const NOTEBOOK_FILE_SEARCH_MAX_LIMIT = 50
const NOTEBOOK_FILE_SEARCH_EXCLUDED_GLOBS = [
  "!**/.buddy/**",
  "!**/node_modules/**",
  "!**/vendor/**",
  "!**/dist/**",
  "!**/build/**",
  "!**/out/**",
  "!**/.turbo/**",
  "!**/coverage/**",
] as const
const ripgrepRuntime = makeRuntime(Ripgrep.Service, Ripgrep.defaultLayer)

type RankedFileSearchPath = {
  path: string
  score: number
}

export type NotebookFileSearchInput = {
  query: string
  limit?: number
  scanLimit?: number
  signal?: AbortSignal
}

export type NotebookFileSearchResult = {
  matches: string[]
  partial: boolean
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code
}

function toRelativePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\/+/, "")
}

async function realpathIfExists(filePath: string): Promise<string | undefined> {
  return fs.realpath(filePath).catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) return undefined
    throw error
  })
}

async function resolveContainedPath(filePath: string): Promise<string> {
  const target = path.resolve(Instance.directory, toRelativePath(filePath))
  if (!Instance.containsPath(target)) {
    throw new Error("Access denied: path escapes project directory")
  }

  const realTarget = await realpathIfExists(target)
  if (!realTarget) return target
  if (!Instance.containsPath(realTarget)) {
    throw new Error("Access denied: path escapes project directory")
  }
  return realTarget
}

async function readFileBytes(filePath: string): Promise<Uint8Array | undefined> {
  return fs.readFile(filePath).catch((error: unknown) => {
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

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function scoreNotebookFileSearchPath(query: string, filePath: string): number | undefined {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return undefined

  const normalizedPath = normalizeSearchValue(normalizePathForClient(filePath))
  const basename = normalizedPath.split("/").at(-1) ?? normalizedPath
  if (basename === normalizedQuery) return 0
  if (basename.startsWith(normalizedQuery)) return 10 + basename.length - normalizedQuery.length

  const basenameIndex = basename.indexOf(normalizedQuery)
  if (basenameIndex >= 0) return 30 + basenameIndex

  const pathIndex = normalizedPath.indexOf(normalizedQuery)
  if (pathIndex >= 0) return 60 + pathIndex

  const tokens = normalizedQuery.split(/\s+/u).filter(Boolean)
  let tokenScore = 100
  for (const token of tokens) {
    const tokenIndex = normalizedPath.indexOf(token)
    if (tokenIndex < 0) return undefined
    tokenScore += tokenIndex
  }
  return tokenScore
}

function compareRankedFileSearchPaths(
  left: RankedFileSearchPath,
  right: RankedFileSearchPath,
): number {
  if (left.score !== right.score) return left.score - right.score
  return left.path.localeCompare(right.path)
}

function retainRankedFileSearchPath(input: {
  ranked: RankedFileSearchPath[]
  query: string
  filePath: string
  limit: number
}): RankedFileSearchPath[] {
  const normalizedPath = normalizePathForClient(input.filePath)
  const score = scoreNotebookFileSearchPath(input.query, normalizedPath)
  if (score === undefined) return input.ranked

  const next = [...input.ranked, { path: normalizedPath, score }]
    .toSorted(compareRankedFileSearchPaths)
    .slice(0, input.limit)
  return next
}

export function rankNotebookFileSearchPaths(input: {
  query: string
  paths: readonly string[]
  limit?: number
}): string[] {
  const limit = Math.min(
    NOTEBOOK_FILE_SEARCH_MAX_LIMIT,
    Math.max(1, input.limit ?? NOTEBOOK_FILE_SEARCH_DEFAULT_LIMIT),
  )
  let ranked: RankedFileSearchPath[] = []
  for (const filePath of input.paths) {
    ranked = retainRankedFileSearchPath({
      ranked,
      query: input.query,
      filePath,
      limit,
    })
  }
  return ranked.map((match) => match.path)
}

export namespace File {
  export const Info = FileInfo
  export type Info = Schema.Schema.Type<typeof FileInfo>

  export const Node = FileNode
  export type Node = Schema.Schema.Type<typeof FileNode>

  export const Content = FileContent
  export type Content = Schema.Schema.Type<typeof FileContent>

  export async function init() {
    return undefined
  }

  export async function status(): Promise<Info[]> {
    return []
  }

  export async function searchPaths(
    input: NotebookFileSearchInput,
  ): Promise<NotebookFileSearchResult> {
    const query = input.query.trim()
    if (!query) return { matches: [], partial: false }

    const limit = Math.min(
      NOTEBOOK_FILE_SEARCH_MAX_LIMIT,
      Math.max(1, input.limit ?? NOTEBOOK_FILE_SEARCH_DEFAULT_LIMIT),
    )
    const scanLimit = Math.min(
      NOTEBOOK_FILE_SEARCH_SCAN_LIMIT,
      Math.max(1, input.scanLimit ?? NOTEBOOK_FILE_SEARCH_SCAN_LIMIT),
    )
    const initial = {
      scanned: 0,
      ranked: [] as RankedFileSearchPath[],
    }
    const result = await ripgrepRuntime.runPromise((ripgrep) =>
      ripgrep
        .files({
          cwd: Instance.directory,
          glob: [...NOTEBOOK_FILE_SEARCH_EXCLUDED_GLOBS],
          hidden: false,
          signal: input.signal,
        })
        .pipe(
          Stream.take(scanLimit + 1),
          Stream.runFold(
            () => initial,
            (state, filePath) => {
              if (state.scanned >= scanLimit) {
                return {
                  scanned: state.scanned + 1,
                  ranked: state.ranked,
                }
              }
              return {
                scanned: state.scanned + 1,
                ranked: retainRankedFileSearchPath({
                  ranked: state.ranked,
                  query,
                  filePath,
                  limit,
                }),
              }
            },
          ),
          Effect.scoped,
        ),
    )

    return {
      matches: result.ranked.map((match) => match.path),
      partial: result.scanned > scanLimit,
    }
  }

  export async function read(filePath: string): Promise<Content> {
    const target = await resolveContainedPath(filePath)
    const bytes = await readFileBytes(target)
    if (!bytes) return { type: "text", content: "" }
    if (hasKnownBinaryExtension(target)) return { type: "binary", content: "" }

    const content = decodeUtf8(bytes)
    if (content === undefined) return { type: "binary", content: "" }

    return { type: "text", content: content.trim() }
  }

  export async function list(input?: string): Promise<Node[]> {
    const directory = await resolveContainedPath(input ?? ".")
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((entry) => entry.name !== ".git" && entry.name !== ".DS_Store")
      .map((entry) => {
        const absolute = path.join(directory, entry.name)
        const relative = normalizePathForClient(path.relative(Instance.directory, absolute))
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
