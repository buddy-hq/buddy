import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  CHEMFIG_CHILD_FILENAME,
  CHEMFIG_RUNTIME_DIRECTORY_NAME,
  CHEMFIG_TEX_ASSET_FILENAMES,
  CHEMFIG_TEX_DIRECTORY_NAME,
} from "@buddy/script/chemfig-runtime"
import { BUDDY_ENV } from "@buddy/script/storage-env"
import z from "zod"
import { BUDDY_DIRECTORY_NAME, isNodeErrorCode, readJsonFile } from "../objects"
import { writeJsonFileAtomic } from "../storage/atomic-file"
import { ChemistryRenderError } from "./errors"
import {
  CHEMFIG_CHILD_FAILURE_STAGES,
  CHEMFIG_RENDER_CONFIG_VERSION,
  CHEMFIG_MAX_SOURCE_BYTES,
  CHEMFIG_RENDERER_VERSION,
  CHEMISTRY_RENDERER_NAMES,
  ChemistrySourceHashSchema,
  ChemistrySourceSchema,
} from "./types"
import { sanitizeChemistrySvg } from "./svg-sanitize"

const CHEMFIG_MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const CHEMFIG_RENDER_TIMEOUT_MS = 30_000
const CHEMFIG_MAX_PENDING_RENDERS = 8
const CHEMFIG_CHILD_TERMINATION_TIMEOUT_MS = 5_000
const CHEMFIG_CACHE_WRITE_WAIT_MS = 250
const CHEMFIG_MAX_DIAGNOSTIC_CHARACTERS = 16_000
const CHEMFIG_RENDER_CACHE_RECORD_OVERHEAD_BYTES = 64 * 1024
const CHEMFIG_RENDER_CACHE_MAX_ENTRY_BYTES =
  CHEMFIG_MAX_OUTPUT_BYTES + CHEMFIG_RENDER_CACHE_RECORD_OVERHEAD_BYTES
const CHEMFIG_RENDER_CACHE_MAX_ENTRIES = 256
const CHEMFIG_RENDER_CACHE_MAX_BYTES = 64 * 1024 * 1024
const CHEMISTRY_CACHE_DIRECTORY_NAME = "cache"
const CHEMISTRY_CACHE_NAMESPACE = "chemistry"
const CHEMFIG_RENDER_CACHE_DIRECTORY_NAME = "chemfig-renders"
const ELECTRON_RUN_AS_NODE_ENV = "ELECTRON_RUN_AS_NODE"
const ELECTRON_RUN_AS_NODE_VALUE = "1"
const APP_ASAR_DIRECTORY_NAME = "app.asar"
const APP_ASAR_UNPACKED_DIRECTORY_NAME = "app.asar.unpacked"
const SOURCE_TIKZJAX_PACKAGE_MANIFEST_SPECIFIER = ["node-tikzjax", "package.json"].join("/")
const CHEMFIG_DOCUMENT_PREFIX = String.raw`\begin{document}
\begingroup
\centering
`
const CHEMFIG_DOCUMENT_SUFFIX = String.raw`
\par
\endgroup
\end{document}
`
const TEX_CHARACTER_EXPANSION_PATTERN = /\^\^/u
const TEX_CONTROL_WORD_CHARACTER_PATTERN = /[A-Za-z]/u
const CHEMFIG_CACHE_FILENAME_PATTERN = /^[a-f0-9]{64}\.json$/u
const FORBIDDEN_CHEMFIG_CONTROL_WORD_FRAGMENTS = [
  "document",
  "file",
  "include",
  "input",
  "lua",
  "package",
  "shell",
  "special",
]
const FORBIDDEN_CHEMFIG_CONTROL_WORDS = new Set([
  "afterassignment",
  "aftergroup",
  "begin",
  "catcode",
  "chardef",
  "closein",
  "closeout",
  "countdef",
  "csname",
  "def",
  "delcode",
  "dimendef",
  "directlua",
  "documentclass",
  "edef",
  "end",
  "endcsname",
  "endlinechar",
  "escapechar",
  "everydisplay",
  "everyhbox",
  "everyjob",
  "everymath",
  "everypar",
  "everyvbox",
  "errmessage",
  "expandafter",
  "explsyntaxon",
  "filecontents",
  "font",
  "futurelet",
  "gdef",
  "global",
  "immediate",
  "include",
  "includeonly",
  "input",
  "lccode",
  "let",
  "long",
  "loop",
  "lowercase",
  "luaexec",
  "makeatletter",
  "mathcode",
  "mathchardef",
  "message",
  "meaning",
  "muskipdef",
  "newcommand",
  "newbox",
  "newcount",
  "newdimen",
  "newenvironment",
  "newfam",
  "newhelp",
  "newif",
  "newinsert",
  "newlanguage",
  "newlength",
  "newmuskip",
  "newread",
  "newsavebox",
  "newskip",
  "newtoks",
  "newwrite",
  "noexpand",
  "number",
  "openin",
  "openout",
  "outer",
  "pdfcatalog",
  "pdfinfo",
  "pdfliteral",
  "pdfobj",
  "pdfrefobj",
  "pdfshellescape",
  "pdfximage",
  "pgfimage",
  "providecommand",
  "read",
  "readline",
  "renewcommand",
  "renewenvironment",
  "repeat",
  "requirepackage",
  "romannumeral",
  "scantokens",
  "sfcode",
  "shipout",
  "skipdef",
  "special",
  "string",
  "the",
  "toks",
  "toksdef",
  "uccode",
  "uppercase",
  "usepackage",
  "write",
  "xdef",
])
const ChemfigRenderRecordSchema = z
  .object({
    status: z.literal("rendered"),
    renderKey: ChemistrySourceHashSchema,
    sourceHash: ChemistrySourceHashSchema,
    rendererName: z.literal(CHEMISTRY_RENDERER_NAMES.chemfig),
    rendererVersion: z.literal(CHEMFIG_RENDERER_VERSION),
    renderConfigVersion: z.literal(CHEMFIG_RENDER_CONFIG_VERSION),
    svg: z.string().min(1),
    renderedAt: z.string().datetime(),
  })
  .strict()

const ChemfigChildFailureSchema = z
  .object({
    stage: z.enum(CHEMFIG_CHILD_FAILURE_STAGES),
    message: z.string(),
    stack: z.string().optional(),
  })
  .strict()

type ChemfigRenderRecord = z.infer<typeof ChemfigRenderRecordSchema>
type ChemfigChildFailure = z.infer<typeof ChemfigChildFailureSchema>
type ChemfigChildRuntime = {
  childPath: string
  texDirectory: string
}

type ChemfigInFlightRender = {
  controller: AbortController
  promise: Promise<ChemfigRenderRecord>
  subscriberCount: number
  settled: boolean
}

type ChemfigCacheEntry = {
  filename: string
  filePath: string
  mtimeMs: number
  size: number
}

type ChemfigCacheLimits = {
  maxEntries: number
  maxBytes: number
}

const sourceRequire = createRequire(import.meta.url)
const inFlightRenders = new Map<string, ChemfigInFlightRender>()
let renderQueueTail: Promise<void> = Promise.resolve()
let pendingRenderCount = 0

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function buildChemfigRenderKey(sourceHash: string): string {
  return sha256Text(
    [
      "chemfig-render",
      sourceHash,
      CHEMISTRY_RENDERER_NAMES.chemfig,
      CHEMFIG_RENDERER_VERSION,
      String(CHEMFIG_RENDER_CONFIG_VERSION),
    ].join(":"),
  )
}

function chemfigRenderCacheDirectory(directory: string): string {
  return path.join(
    directory,
    BUDDY_DIRECTORY_NAME,
    CHEMISTRY_CACHE_DIRECTORY_NAME,
    CHEMISTRY_CACHE_NAMESPACE,
    CHEMFIG_RENDER_CACHE_DIRECTORY_NAME,
  )
}

function chemfigRenderCacheFile(directory: string, renderKey: string): string {
  const sanitizedRenderKey = ChemistrySourceHashSchema.parse(renderKey)
  return path.join(chemfigRenderCacheDirectory(directory), `${sanitizedRenderKey}.json`)
}

function containsForbiddenChemfigControlWord(source: string): boolean {
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (character === "%") {
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") {
        index += 1
      }
      continue
    }
    if (character !== "\\") continue

    const controlWordStart = index + 1
    let controlWordEnd = controlWordStart
    while (
      controlWordEnd < source.length &&
      TEX_CONTROL_WORD_CHARACTER_PATTERN.test(source[controlWordEnd] ?? "")
    ) {
      controlWordEnd += 1
    }
    if (controlWordEnd === controlWordStart) {
      index = controlWordStart
      continue
    }

    const controlWord = source.slice(controlWordStart, controlWordEnd).toLowerCase()
    if (
      FORBIDDEN_CHEMFIG_CONTROL_WORDS.has(controlWord) ||
      FORBIDDEN_CHEMFIG_CONTROL_WORD_FRAGMENTS.some((fragment) => controlWord.includes(fragment)) ||
      controlWord.startsWith("pdf")
    ) {
      return true
    }
    index = controlWordEnd - 1
  }
  return false
}

function validateChemfigSource(source: string): void {
  const parsed = ChemistrySourceSchema.safeParse(source)
  if (!parsed.success) {
    throw new ChemistryRenderError({
      code: "invalid_source",
      httpStatus: 400,
      message: "chemfig source must contain at least one non-whitespace character.",
      cause: parsed.error,
    })
  }
  if (Buffer.byteLength(source, "utf8") > CHEMFIG_MAX_SOURCE_BYTES) {
    throw new ChemistryRenderError({
      code: "source_too_large",
      httpStatus: 413,
      message: `chemfig source exceeds the ${CHEMFIG_MAX_SOURCE_BYTES}-byte limit.`,
    })
  }
  if (containsForbiddenChemfigControlWord(source) || TEX_CHARACTER_EXPANSION_PATTERN.test(source)) {
    throw new ChemistryRenderError({
      code: "unsafe_source",
      httpStatus: 400,
      message:
        "chemfig source contains a document, package, file, or macro control sequence that is not allowed.",
    })
  }
}

function fixedChemfigDocument(source: string): string {
  return `${CHEMFIG_DOCUMENT_PREFIX}${source}${CHEMFIG_DOCUMENT_SUFFIX}`
}

async function readCachedChemfigRender(input: {
  directory: string
  renderKey: string
  sourceHash: string
}): Promise<ChemfigRenderRecord | undefined> {
  const cacheFile = chemfigRenderCacheFile(input.directory, input.renderKey)
  try {
    const cacheStats = await fs.stat(cacheFile)
    if (cacheStats.size > CHEMFIG_RENDER_CACHE_MAX_ENTRY_BYTES) {
      throw new Error("Chemfig cache entry exceeds the per-entry limit.")
    }
    const record = await readJsonFile(cacheFile, ChemfigRenderRecordSchema)
    if (record.renderKey !== input.renderKey || record.sourceHash !== input.sourceHash) {
      throw new Error("Chemfig cache identity mismatch.")
    }
    const sanitizedSvg = sanitizeChemistrySvg(record.svg)
    if (sanitizedSvg !== record.svg) throw new Error("Chemfig cache SVG is not canonical.")
    const now = new Date()
    await fs.utimes(cacheFile, now, now).catch(() => undefined)
    return record
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return undefined
    await fs.rm(cacheFile, { force: true }).catch(() => undefined)
    return undefined
  }
}

function compareCacheEntries(left: ChemfigCacheEntry, right: ChemfigCacheEntry): number {
  if (left.mtimeMs !== right.mtimeMs) return left.mtimeMs - right.mtimeMs
  if (left.filename < right.filename) return -1
  if (left.filename > right.filename) return 1
  return 0
}

async function enforceChemfigCacheLimits(
  directory: string,
  limits: ChemfigCacheLimits = {
    maxEntries: CHEMFIG_RENDER_CACHE_MAX_ENTRIES,
    maxBytes: CHEMFIG_RENDER_CACHE_MAX_BYTES,
  },
): Promise<void> {
  const cacheDirectory = chemfigRenderCacheDirectory(directory)
  const directoryEntries = await fs
    .readdir(cacheDirectory, { withFileTypes: true })
    .catch((error) => {
      if (isNodeErrorCode(error, "ENOENT")) return []
      throw error
    })

  const cacheEntries: ChemfigCacheEntry[] = []
  for (const directoryEntry of directoryEntries) {
    if (!directoryEntry.isFile() || !CHEMFIG_CACHE_FILENAME_PATTERN.test(directoryEntry.name)) {
      continue
    }
    const filePath = path.join(cacheDirectory, directoryEntry.name)
    try {
      const stats = await fs.stat(filePath)
      cacheEntries.push({
        filename: directoryEntry.name,
        filePath,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      })
    } catch (error) {
      if (!isNodeErrorCode(error, "ENOENT")) throw error
    }
  }

  cacheEntries.sort(compareCacheEntries)
  let entryCount = cacheEntries.length
  let totalBytes = cacheEntries.reduce((sum, entry) => sum + entry.size, 0)
  for (const entry of cacheEntries) {
    if (entryCount <= limits.maxEntries && totalBytes <= limits.maxBytes) break
    await fs.rm(entry.filePath, { force: true })
    entryCount -= 1
    totalBytes -= entry.size
  }
}

async function writeCachedChemfigRenderBestEffort(
  directory: string,
  record: ChemfigRenderRecord,
): Promise<void> {
  try {
    await writeJsonFileAtomic(chemfigRenderCacheFile(directory, record.renderKey), record)
    await enforceChemfigCacheLimits(directory)
  } catch {
    // Rendering remains usable when the local cache is unavailable or full.
  }
}

async function waitForBestEffortCacheWrite(
  directory: string,
  record: ChemfigRenderRecord,
  deadlineAt: number,
): Promise<void> {
  const remainingTime = Math.max(0, deadlineAt - Date.now())
  const waitTime = Math.min(CHEMFIG_CACHE_WRITE_WAIT_MS, remainingTime)
  if (waitTime === 0) {
    void writeCachedChemfigRenderBestEffort(directory, record)
    return
  }

  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, waitTime)
  })
  await Promise.race([writeCachedChemfigRenderBestEffort(directory, record), timeoutPromise])
  if (timeout) clearTimeout(timeout)
}

function renderDeadlineExceeded(): ChemistryRenderError {
  return new ChemistryRenderError({
    code: "chemfig_render_timeout",
    httpStatus: 504,
    message: `chemfig rendering exceeded the ${CHEMFIG_RENDER_TIMEOUT_MS}-millisecond enqueue-to-completion limit.`,
  })
}

function renderCancelled(): ChemistryRenderError {
  return new ChemistryRenderError({
    code: "chemfig_render_failed",
    httpStatus: 422,
    message: "chemfig rendering was cancelled before completion.",
  })
}

function throwIfRenderCannotContinue(signal: AbortSignal, deadlineAt: number): void {
  if (signal.aborted) throw renderCancelled()
  if (Date.now() >= deadlineAt) throw renderDeadlineExceeded()
}

function runInSerializedRenderQueue<T>(input: {
  deadlineAt: number
  signal: AbortSignal
  operation: () => Promise<T>
}): Promise<T> {
  if (pendingRenderCount >= CHEMFIG_MAX_PENDING_RENDERS) {
    throw new ChemistryRenderError({
      code: "renderer_busy",
      httpStatus: 503,
      message: "The chemfig renderer is busy. Try again after the pending renders complete.",
    })
  }
  pendingRenderCount += 1
  const current = renderQueueTail
    .catch(() => undefined)
    .then(async () => {
      throwIfRenderCannotContinue(input.signal, input.deadlineAt)
      const result = await input.operation()
      throwIfRenderCannotContinue(input.signal, input.deadlineAt)
      return result
    })
  renderQueueTail = current.then(
    () => undefined,
    () => undefined,
  )
  return current.finally(() => {
    pendingRenderCount -= 1
  })
}

function runtimeAt(runtimeDirectory: string): ChemfigChildRuntime | undefined {
  const childPath = path.join(runtimeDirectory, CHEMFIG_CHILD_FILENAME)
  const texDirectory = path.join(runtimeDirectory, CHEMFIG_TEX_DIRECTORY_NAME)
  if (!existsSync(childPath)) return undefined
  if (!hasChemfigTexAssets(texDirectory)) return undefined
  return { childPath, texDirectory }
}

function hasChemfigTexAssets(texDirectory: string): boolean {
  return CHEMFIG_TEX_ASSET_FILENAMES.every((assetFilename) =>
    existsSync(path.join(texDirectory, assetFilename)),
  )
}

function asarUnpackedDirectory(directory: string): string | undefined {
  const asarSegment = `${path.sep}${APP_ASAR_DIRECTORY_NAME}${path.sep}`
  if (!directory.includes(asarSegment)) return undefined
  return directory.replace(asarSegment, `${path.sep}${APP_ASAR_UNPACKED_DIRECTORY_NAME}${path.sep}`)
}

function sourceChildRuntime(): ChemfigChildRuntime | undefined {
  if (!("bun" in process.versions)) return undefined
  const childPath = fileURLToPath(new URL("./chemfig-child.ts", import.meta.url))
  if (!existsSync(childPath)) return undefined
  try {
    const packageManifestPath = sourceRequire.resolve(SOURCE_TIKZJAX_PACKAGE_MANIFEST_SPECIFIER)
    const texDirectory = path.join(path.dirname(packageManifestPath), CHEMFIG_TEX_DIRECTORY_NAME)
    return hasChemfigTexAssets(texDirectory) ? { childPath, texDirectory } : undefined
  } catch {
    return undefined
  }
}

function resolveChemfigChildRuntime(): ChemfigChildRuntime {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  const unpackedModuleDirectory = asarUnpackedDirectory(moduleDirectory)
  if (unpackedModuleDirectory) {
    const unpackedRuntime = runtimeAt(
      path.join(unpackedModuleDirectory, CHEMFIG_RUNTIME_DIRECTORY_NAME),
    )
    if (unpackedRuntime) return unpackedRuntime
  }

  const adjacentRuntime = runtimeAt(path.join(moduleDirectory, CHEMFIG_RUNTIME_DIRECTORY_NAME))
  if (adjacentRuntime) return adjacentRuntime

  const sourceRuntime = sourceChildRuntime()
  if (sourceRuntime) return sourceRuntime

  throw chemistryRuntimeUnavailable()
}

function chemistryRuntimeUnavailable(): ChemistryRenderError {
  return new ChemistryRenderError({
    code: "chemfig_runtime_unavailable",
    httpStatus: 503,
    message: "The chemfig rendering runtime is unavailable.",
  })
}

function parseChemfigChildFailure(stderr: string): ChemfigChildFailure | undefined {
  try {
    const parsed: unknown = JSON.parse(stderr)
    const result = ChemfigChildFailureSchema.safeParse(parsed)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function chemistryChildFailureError(input: {
  detail: string
  sourceHash: string
}): ChemistryRenderError {
  const failure = parseChemfigChildFailure(input.detail)
  if (!failure) {
    console.error("Chemfig renderer child failed without a structured diagnostic", {
      sourceHash: input.sourceHash,
      detail: input.detail.slice(0, CHEMFIG_MAX_DIAGNOSTIC_CHARACTERS),
    })
    return new ChemistryRenderError({
      code: "chemfig_render_failed",
      httpStatus: 422,
      message: "The chemfig backend renderer process failed.",
    })
  }

  console.error("Chemfig renderer child failed", {
    sourceHash: input.sourceHash,
    stage: failure.stage,
    message: failure.message.slice(0, CHEMFIG_MAX_DIAGNOSTIC_CHARACTERS),
    stack: failure.stack?.slice(0, CHEMFIG_MAX_DIAGNOSTIC_CHARACTERS),
  })
  switch (failure.stage) {
    case CHEMFIG_CHILD_FAILURE_STAGES.runtimeInitialization:
      return new ChemistryRenderError({
        code: "chemfig_runtime_unavailable",
        httpStatus: 503,
        message: "The chemfig backend runtime failed to initialize.",
      })
    case CHEMFIG_CHILD_FAILURE_STAGES.texCompilation:
      return new ChemistryRenderError({
        code: "chemfig_tex_compile_failed",
        httpStatus: 422,
        message: "The chemfig source could not be compiled by the TeX renderer.",
      })
    case CHEMFIG_CHILD_FAILURE_STAGES.dviConversion:
      return new ChemistryRenderError({
        code: "chemfig_dvi_conversion_failed",
        httpStatus: 422,
        message: "The chemfig backend could not convert the compiled TeX output to SVG.",
      })
  }
}

async function compileChemfigDocument(input: {
  documentSource: string
  deadlineAt: number
  sourceHash: string
  signal: AbortSignal
}): Promise<string> {
  throwIfRenderCannotContinue(input.signal, input.deadlineAt)
  const runtime = resolveChemfigChildRuntime()
  return new Promise<string>((resolve, reject) => {
    const childEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      [ELECTRON_RUN_AS_NODE_ENV]: ELECTRON_RUN_AS_NODE_VALUE,
    }
    childEnvironment[BUDDY_ENV.CHEMFIG_TEX_DIR] = runtime.texDirectory

    const child = spawn(process.execPath, [runtime.childPath], {
      env: childEnvironment,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let completed = false
    let terminalError: ChemistryRenderError | undefined
    let terminationTimeout: ReturnType<typeof setTimeout> | undefined

    const cleanup = (): void => {
      clearTimeout(deadlineTimeout)
      if (terminationTimeout) clearTimeout(terminationTimeout)
      input.signal.removeEventListener("abort", onAbort)
    }

    const settleReject = (error: ChemistryRenderError): void => {
      if (completed) return
      completed = true
      cleanup()
      reject(error)
    }
    const settleResolve = (svg: string): void => {
      if (completed) return
      completed = true
      cleanup()
      resolve(svg)
    }
    const terminateChild = (error: ChemistryRenderError): void => {
      if (completed || terminalError) return
      terminalError = error
      child.kill("SIGKILL")
      terminationTimeout = setTimeout(() => {
        child.stdin.destroy()
        child.stdout.destroy()
        child.stderr.destroy()
        settleReject(error)
      }, CHEMFIG_CHILD_TERMINATION_TIMEOUT_MS)
    }
    const onAbort = (): void => {
      terminateChild(renderCancelled())
    }
    const remainingTime = Math.max(0, input.deadlineAt - Date.now())
    const deadlineTimeout = setTimeout(() => {
      terminateChild(renderDeadlineExceeded())
    }, remainingTime)
    input.signal.addEventListener("abort", onAbort, { once: true })

    child.stdout.on("data", (chunk: Buffer) => {
      if (terminalError) return
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > CHEMFIG_MAX_OUTPUT_BYTES) {
        terminateChild(
          new ChemistryRenderError({
            code: "chemfig_output_too_large",
            httpStatus: 413,
            message: `chemfig SVG output exceeds the ${CHEMFIG_MAX_OUTPUT_BYTES}-byte limit.`,
          }),
        )
        return
      }
      stdoutChunks.push(chunk)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      const remainingBytes = CHEMFIG_MAX_OUTPUT_BYTES - stderrBytes
      if (remainingBytes <= 0) return
      const retained = chunk.subarray(0, remainingBytes)
      stderrBytes += retained.byteLength
      stderrChunks.push(retained)
    })
    child.once("error", (error) => {
      if (terminalError) return
      settleReject(
        new ChemistryRenderError({
          code: "chemfig_runtime_unavailable",
          httpStatus: 503,
          message: "The chemfig rendering runtime could not be started.",
          cause: error,
        }),
      )
    })
    child.once("close", (exitCode) => {
      if (completed) return
      if (terminalError) {
        settleReject(terminalError)
        return
      }
      if (exitCode !== 0) {
        const detail = Buffer.concat(stderrChunks).toString("utf8").trim()
        settleReject(chemistryChildFailureError({ detail, sourceHash: input.sourceHash }))
        return
      }
      settleResolve(Buffer.concat(stdoutChunks).toString("utf8"))
    })
    child.stdin.once("error", (error) => {
      terminateChild(
        new ChemistryRenderError({
          code: "chemfig_render_failed",
          httpStatus: 422,
          message: "chemfig source could not be sent to the rendering runtime.",
          cause: error,
        }),
      )
    })
    if (input.signal.aborted) {
      onAbort()
    } else {
      child.stdin.end(input.documentSource, "utf8")
    }
  })
}

async function renderAndCacheChemfig(input: {
  directory: string
  source: string
  sourceHash: string
  renderKey: string
  deadlineAt: number
  signal: AbortSignal
}): Promise<ChemfigRenderRecord> {
  throwIfRenderCannotContinue(input.signal, input.deadlineAt)
  const cached = await readCachedChemfigRender(input)
  if (cached) return cached

  const record = await runInSerializedRenderQueue({
    deadlineAt: input.deadlineAt,
    signal: input.signal,
    operation: async () => {
      const queuedCache = await readCachedChemfigRender(input)
      if (queuedCache) return queuedCache

      const rawSvg = await compileChemfigDocument({
        documentSource: fixedChemfigDocument(input.source),
        deadlineAt: input.deadlineAt,
        sourceHash: input.sourceHash,
        signal: input.signal,
      })
      const svg = sanitizeChemistrySvg(rawSvg)
      if (Buffer.byteLength(svg, "utf8") > CHEMFIG_MAX_OUTPUT_BYTES) {
        throw new ChemistryRenderError({
          code: "chemfig_output_too_large",
          httpStatus: 413,
          message: `Sanitized chemfig SVG exceeds the ${CHEMFIG_MAX_OUTPUT_BYTES}-byte limit.`,
        })
      }
      const record = ChemfigRenderRecordSchema.parse({
        status: "rendered",
        renderKey: input.renderKey,
        sourceHash: input.sourceHash,
        rendererName: CHEMISTRY_RENDERER_NAMES.chemfig,
        rendererVersion: CHEMFIG_RENDERER_VERSION,
        renderConfigVersion: CHEMFIG_RENDER_CONFIG_VERSION,
        svg,
        renderedAt: new Date().toISOString(),
      })
      return record
    },
  })
  await waitForBestEffortCacheWrite(input.directory, record, input.deadlineAt)
  return record
}

function awaitInFlightChemfigRender(
  render: ChemfigInFlightRender,
  signal: AbortSignal | undefined,
): Promise<ChemfigRenderRecord> {
  render.subscriberCount += 1
  return new Promise<ChemfigRenderRecord>((resolve, reject) => {
    let completed = false
    const cleanup = (): void => {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", onAbort)
      render.subscriberCount -= 1
      if (render.subscriberCount === 0 && !render.settled) render.controller.abort()
    }
    const settleResolve = (record: ChemfigRenderRecord): void => {
      if (completed) return
      completed = true
      cleanup()
      resolve(record)
    }
    const settleReject = <TError>(error: TError): void => {
      if (completed) return
      completed = true
      cleanup()
      reject(error)
    }
    const onAbort = (): void => {
      settleReject(renderCancelled())
    }
    const timeout = setTimeout(() => {
      settleReject(renderDeadlineExceeded())
    }, CHEMFIG_RENDER_TIMEOUT_MS)

    signal?.addEventListener("abort", onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
      return
    }
    void render.promise.then(settleResolve, settleReject)
  })
}

async function renderChemfig(input: {
  directory: string
  source: string
  signal?: AbortSignal
}): Promise<ChemfigRenderRecord> {
  validateChemfigSource(input.source)
  if (input.signal?.aborted) throw renderCancelled()
  const sourceHash = sha256Text(input.source)
  const renderKey = buildChemfigRenderKey(sourceHash)
  const inFlightKey = `${input.directory}\u0000${renderKey}`
  const existing = inFlightRenders.get(inFlightKey)
  if (existing && !existing.controller.signal.aborted) {
    return awaitInFlightChemfigRender(existing, input.signal)
  }
  if (existing) inFlightRenders.delete(inFlightKey)

  const controller = new AbortController()
  const promise = renderAndCacheChemfig({
    directory: input.directory,
    source: input.source,
    sourceHash,
    renderKey,
    deadlineAt: Date.now() + CHEMFIG_RENDER_TIMEOUT_MS,
    signal: controller.signal,
  })
  const render: ChemfigInFlightRender = {
    controller,
    promise,
    subscriberCount: 0,
    settled: false,
  }
  inFlightRenders.set(inFlightKey, render)
  void promise.then(
    () => {
      render.settled = true
      if (inFlightRenders.get(inFlightKey) === render) {
        inFlightRenders.delete(inFlightKey)
      }
    },
    () => {
      render.settled = true
      if (inFlightRenders.get(inFlightKey) === render) {
        inFlightRenders.delete(inFlightKey)
      }
    },
  )
  return awaitInFlightChemfigRender(render, input.signal)
}

export {
  buildChemfigRenderKey,
  CHEMFIG_CACHE_WRITE_WAIT_MS,
  CHEMFIG_CHILD_TERMINATION_TIMEOUT_MS,
  CHEMFIG_MAX_OUTPUT_BYTES,
  CHEMFIG_MAX_PENDING_RENDERS,
  CHEMFIG_MAX_SOURCE_BYTES,
  CHEMFIG_RENDER_CACHE_MAX_BYTES,
  CHEMFIG_RENDER_CACHE_MAX_ENTRY_BYTES,
  CHEMFIG_RENDER_CACHE_MAX_ENTRIES,
  CHEMFIG_RENDER_TIMEOUT_MS,
  ChemfigRenderRecordSchema,
  chemistryChildFailureError,
  chemfigRenderCacheDirectory,
  chemfigRenderCacheFile,
  enforceChemfigCacheLimits,
  renderChemfig,
  runInSerializedRenderQueue,
  validateChemfigSource,
}
export type { ChemfigRenderRecord }
