import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { availableParallelism, tmpdir, totalmem } from "node:os"
import path from "node:path"
import { Worker } from "node:worker_threads"
import {
  isNativeSpreadsheetFormat,
  type NativeSpreadsheetFormat,
} from "@buddy/workspace-file-policy"
import type { ResourceExtractionResult, ResourceTextArtifact } from "./contracts"
import {
  isSpreadsheetParserWorkerOutput,
  spreadsheetParserStagedArtifactFilename,
  SPREADSHEET_PARSER_MAX_OLD_GENERATION_SIZE_MB,
  SPREADSHEET_PARSER_MAX_YOUNG_GENERATION_SIZE_MB,
  SPREADSHEET_PARSER_STAGED_ARTIFACTS_DIRECTORY,
  SPREADSHEET_PARSER_STAGED_DIRECTORY_PREFIX,
  SPREADSHEET_PARSER_STAGED_FULL_TEXT_FILENAME,
  SPREADSHEET_PARSER_TIMEOUT_MS,
  SPREADSHEET_PARSER_WORKER_BUNDLED_FILENAME,
  SPREADSHEET_PARSER_WORKER_NAME,
  SPREADSHEET_PARSER_WORKER_SOURCE_FILENAME,
  type SpreadsheetParserWorkerInput,
  type SpreadsheetParserWorkerOutput,
} from "./spreadsheet-parser-worker-protocol"

const TYPESCRIPT_MODULE_SUFFIX = ".ts"
const SPREADSHEET_PARSER_MIN_CONCURRENCY = 1
const SPREADSHEET_PARSER_MAX_CONCURRENCY = 2
const SPREADSHEET_PARSER_RESERVED_PARALLELISM = 1
const SPREADSHEET_PARSER_MAX_PENDING_WORKERS = 32
const SPREADSHEET_PARSER_STALE_DIRECTORY_MAX_AGE_MS = 24 * 60 * 60 * 1_000
const GIBIBYTE_BYTES = 1024 * 1024 * 1024
const SPREADSHEET_PARSER_DUAL_WORKER_MIN_MEMORY_BYTES = 8 * GIBIBYTE_BYTES
const spreadsheetParserMemoryConcurrency =
  totalmem() >= SPREADSHEET_PARSER_DUAL_WORKER_MIN_MEMORY_BYTES
    ? SPREADSHEET_PARSER_MAX_CONCURRENCY
    : SPREADSHEET_PARSER_MIN_CONCURRENCY
const SPREADSHEET_PARSER_CONCURRENCY = Math.max(
  SPREADSHEET_PARSER_MIN_CONCURRENCY,
  Math.min(
    SPREADSHEET_PARSER_MAX_CONCURRENCY,
    spreadsheetParserMemoryConcurrency,
    availableParallelism() - SPREADSHEET_PARSER_RESERVED_PARALLELISM,
  ),
)

const waitingWorkerSlots: Array<() => void> = []
let activeWorkerCount = 0
let staleDirectoryCleanupTask: Promise<void> | undefined

function spreadsheetParserWorkerUrl(): URL {
  const filename = import.meta.url.endsWith(TYPESCRIPT_MODULE_SUFFIX)
    ? SPREADSHEET_PARSER_WORKER_SOURCE_FILENAME
    : SPREADSHEET_PARSER_WORKER_BUNDLED_FILENAME
  return new URL(filename, import.meta.url)
}

function spreadsheetParserError(format: NativeSpreadsheetFormat, cause: Error): Error {
  return new Error(`Unable to parse ${format.toUpperCase()} spreadsheet: ${cause.message}`, {
    cause,
  })
}

function errorFromUnknown(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

async function acquireWorkerSlot(): Promise<void> {
  if (activeWorkerCount < SPREADSHEET_PARSER_CONCURRENCY) {
    activeWorkerCount += 1
    return
  }
  if (waitingWorkerSlots.length >= SPREADSHEET_PARSER_MAX_PENDING_WORKERS) {
    throw new Error(
      `Spreadsheet parser queue is full (${SPREADSHEET_PARSER_MAX_PENDING_WORKERS} waiting jobs).`,
    )
  }
  await new Promise<void>((resolve) => {
    waitingWorkerSlots.push(resolve)
  })
}

function releaseWorkerSlot(): void {
  const next = waitingWorkerSlots.shift()
  if (next) {
    next()
    return
  }
  activeWorkerCount -= 1
}

async function withWorkerSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireWorkerSlot()
  try {
    return await task()
  } finally {
    releaseWorkerSlot()
  }
}

function scheduleStaleDirectoryCleanup(): void {
  staleDirectoryCleanupTask ??= cleanupStaleSpreadsheetParserDirectories()
  void staleDirectoryCleanupTask
}

async function cleanupStaleSpreadsheetParserDirectories(): Promise<void> {
  const temporaryDirectory = tmpdir()
  const entries = await readdir(temporaryDirectory, { withFileTypes: true }).catch(() => [])
  const staleBefore = Date.now() - SPREADSHEET_PARSER_STALE_DIRECTORY_MAX_AGE_MS
  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() && entry.name.startsWith(SPREADSHEET_PARSER_STAGED_DIRECTORY_PREFIX),
      )
      .map(async (entry) => {
        const directory = path.join(temporaryDirectory, entry.name)
        const directoryStats = await stat(directory).catch(() => undefined)
        if (!directoryStats || directoryStats.mtimeMs >= staleBefore) return
        await rm(directory, { recursive: true, force: true }).catch(() => undefined)
      }),
  )
}

function runSpreadsheetParserWorker(
  input: SpreadsheetParserWorkerInput,
): Promise<SpreadsheetParserWorkerOutput> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(spreadsheetParserWorkerUrl(), {
        name: SPREADSHEET_PARSER_WORKER_NAME,
        workerData: input,
        resourceLimits: {
          maxOldGenerationSizeMb: SPREADSHEET_PARSER_MAX_OLD_GENERATION_SIZE_MB,
          maxYoungGenerationSizeMb: SPREADSHEET_PARSER_MAX_YOUNG_GENERATION_SIZE_MB,
        },
      })
    } catch (error) {
      reject(errorFromUnknown(error))
      return
    }

    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      void worker.terminate()
      reject(
        new Error(`Spreadsheet parser worker timed out after ${SPREADSHEET_PARSER_TIMEOUT_MS} ms.`),
      )
    }, SPREADSHEET_PARSER_TIMEOUT_MS)

    worker.once("message", (value: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (!isSpreadsheetParserWorkerOutput(value)) {
        void worker.terminate()
        reject(new Error("Spreadsheet parser worker returned invalid output metadata."))
        return
      }
      void worker.terminate()
      resolve(value)
    })
    worker.once("error", (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    worker.once("exit", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`Spreadsheet parser worker exited before returning output (code ${code}).`))
    })
  })
}

async function readStagedSpreadsheetExtraction(
  outputDirectory: string,
  output: SpreadsheetParserWorkerOutput,
): Promise<ResourceExtractionResult> {
  const fullText = await readFile(
    path.join(outputDirectory, SPREADSHEET_PARSER_STAGED_FULL_TEXT_FILENAME),
    "utf8",
  )
  const chunkUnits = output.chunkUnits.map((unit) => {
    const textEnd = unit.textStart + unit.textLength
    if (textEnd > fullText.length) {
      throw new Error("Spreadsheet parser worker returned an invalid chunk text range.")
    }
    return {
      unitKind: unit.unitKind,
      unitTitle: unit.unitTitle,
      unitIndex: unit.unitIndex,
      text: fullText.slice(unit.textStart, textEnd),
    }
  })
  const textArtifacts: ResourceTextArtifact[] = []
  for (const [index, artifact] of output.textArtifacts.entries()) {
    const content = await readFile(
      path.join(
        outputDirectory,
        SPREADSHEET_PARSER_STAGED_ARTIFACTS_DIRECTORY,
        spreadsheetParserStagedArtifactFilename(index),
      ),
      "utf8",
    )
    textArtifacts.push({ relativePath: artifact.relativePath, content })
  }
  return {
    status: output.status,
    warnings: output.warnings,
    extractor: output.extractor,
    fullText,
    chunkUnits,
    tocMarkdown: output.tocMarkdown,
    textArtifacts,
    ...(output.title ? { title: output.title } : {}),
  }
}

async function parseSpreadsheetInWorker(
  sourcePath: string,
  format: NativeSpreadsheetFormat,
): Promise<ResourceExtractionResult> {
  try {
    return await withWorkerSlot(async () => {
      scheduleStaleDirectoryCleanup()
      const outputDirectory = await mkdtemp(
        path.join(tmpdir(), SPREADSHEET_PARSER_STAGED_DIRECTORY_PREFIX),
      )
      try {
        const output = await runSpreadsheetParserWorker({ sourcePath, format, outputDirectory })
        return await readStagedSpreadsheetExtraction(outputDirectory, output)
      } finally {
        await rm(outputDirectory, { recursive: true, force: true }).catch(() => undefined)
      }
    })
  } catch (error) {
    throw spreadsheetParserError(format, errorFromUnknown(error))
  }
}

export async function extractSpreadsheetResource(
  sourcePath: string,
  format: NativeSpreadsheetFormat,
): Promise<ResourceExtractionResult> {
  if (!isNativeSpreadsheetFormat(format)) {
    throw new Error(`Unsupported spreadsheet format: ${format}`)
  }
  return parseSpreadsheetInWorker(sourcePath, format)
}
