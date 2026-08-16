#!/usr/bin/env bun
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createBuddyClient } from "../src/index"
import { hasFunctionValue, isObjectValue } from "./parse-values"

const PDF_EXTRACTION_MODE_ENV = "BUDDY_PDF_EXTRACTION_MODE" as const
const PDF_EXTRACTION_MODES = [
  "liteparse-selective-ocr",
  "liteparse-ocr",
  "liteparse-no-ocr",
  "legacy",
] as const
const RESOURCE_POLL_INTERVAL_MS = 500
const RESOURCE_BENCHMARK_TIMEOUT_MS = 10 * 60 * 1_000
const RESOURCE_ENTRYPOINT_FILENAME = "00-resource.md" as const
const RESOURCE_EXTRACTOR_PATTERN = /^extractor:\s*(.+)$/m
const OUTPUT_OPTION = "--output" as const
const BENCHMARK_REPORT_VERSION = 1

type PdfExtractionMode = (typeof PDF_EXTRACTION_MODES)[number]

type ResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

type BenchmarkResult = {
  sourcePath: string
  sourceBytes: number
  mode: PdfExtractionMode
  durationMs: number
  status: ResourceStatus
  extractor: string
  characters?: number
  warnings: string[]
}

type ResourceRecord = {
  objectID: string
  status: ResourceStatus
  packPath?: string
  fullTextCharacters?: number
  warnings: string[]
}

type BackendApp = {
  fetch(request: Request): Response | Promise<Response>
}

type BenchmarkReport = {
  version: typeof BENCHMARK_REPORT_VERSION
  generatedAt: string
  environment: {
    platform: NodeJS.Platform
    architecture: string
    bunVersion: string
  }
  results: Array<Omit<BenchmarkResult, "sourcePath"> & { source: string }>
}

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(moduleDirectory, "../../..")
const generatedAt = new Date()
const cli = parseCliArguments(process.argv.slice(2), generatedAt)
const sourcePaths = cli.sourcePaths
if (sourcePaths.length === 0) {
  throw new Error(
    "Pass PDF paths: bun run benchmark:pdf-resources -- [--output report.json] /path/one.pdf /path/two.pdf",
  )
}

const backendModuleName: string = "@buddy/backend"
const backendModule = await import(backendModuleName)
const app = readBackendApp(backendModule)
const benchmarkRoot = await mkdtemp(path.join(os.tmpdir(), "buddy-pdf-resource-benchmark-"))
const results: BenchmarkResult[] = []

try {
  for (const mode of PDF_EXTRACTION_MODES) {
    process.env[PDF_EXTRACTION_MODE_ENV] = mode

    for (const sourcePath of sourcePaths) {
      const sourceStats = await stat(sourcePath)
      if (!sourceStats.isFile()) {
        throw new Error(`Benchmark source is not a file: ${sourcePath}`)
      }

      const workspace = await mkdtemp(path.join(benchmarkRoot, `${mode}-`))
      const client = createBuddyClient({
        baseUrl: "http://buddy.local/api",
        directory: workspace,
        fetch: async (request, init) => {
          const normalizedRequest =
            request instanceof Request ? new Request(request, init) : new Request(request, init)
          return await app.fetch(normalizedRequest)
        },
      })
      const startedAt = performance.now()
      const createdResponse = await client.objectResource.create(
        {
          sourcePath,
          alias: benchmarkAlias(sourcePath, mode),
        },
        {
          throwOnError: true,
        },
      )
      const completed = await waitForResource({
        client,
        objectID: createdResponse.data.objectID,
      })
      const durationMs = performance.now() - startedAt
      const extractor = await readExtractor(workspace, completed.packPath)
      const result = Object.assign(
        {
          sourcePath,
          sourceBytes: sourceStats.size,
          mode,
          durationMs,
          status: completed.status,
          extractor,
          warnings: completed.warnings,
        },
        completed.fullTextCharacters !== undefined
          ? { characters: completed.fullTextCharacters }
          : undefined,
      )
      results.push(result)
      printResult(result)
    }
  }
} finally {
  delete process.env[PDF_EXTRACTION_MODE_ENV]
  await rm(benchmarkRoot, { force: true, recursive: true })
}

printSummary(results)
await writeBenchmarkReport({
  generatedAt,
  outputPath: cli.outputPath,
  results,
})
console.log(`\nReport: ${cli.outputPath}`)

async function waitForResource(input: {
  client: ReturnType<typeof createBuddyClient>
  objectID: string
}): Promise<ResourceRecord> {
  const deadline = performance.now() + RESOURCE_BENCHMARK_TIMEOUT_MS

  while (performance.now() < deadline) {
    const response = await input.client.objectResource.list(undefined, {
      throwOnError: true,
    })
    const resource = response.data.resources.find(
      (candidate) => candidate.objectID === input.objectID,
    )
    if (resource && resource.status !== "preparing") {
      return resource
    }
    await sleep(RESOURCE_POLL_INTERVAL_MS)
  }

  throw new Error(`Timed out waiting for resource ${input.objectID}`)
}

function readBackendApp<TValue>(moduleValue: TValue): BackendApp {
  if (isObjectValue(moduleValue) && "app" in moduleValue && isBackendApp(moduleValue.app)) {
    return moduleValue.app
  }
  throw new Error("Unable to load the Buddy backend app.")
}

function isBackendApp<TValue>(value: TValue): value is TValue & BackendApp {
  return isObjectValue(value) && "fetch" in value && hasFunctionValue(value.fetch)
}

async function readExtractor(workspace: string, packPath: string | undefined): Promise<string> {
  if (!packPath) return "unknown"
  const entrypoint = await readFile(
    path.join(workspace, packPath, RESOURCE_ENTRYPOINT_FILENAME),
    "utf8",
  )
  const match = entrypoint.match(RESOURCE_EXTRACTOR_PATTERN)
  return match?.[1]?.replaceAll("'", "").trim() ?? "unknown"
}

function benchmarkAlias(sourcePath: string, mode: PdfExtractionMode): string {
  const basename = path.basename(sourcePath, path.extname(sourcePath))
  return `${basename}-${mode}`
}

function printResult(result: BenchmarkResult): void {
  console.log(
    [
      result.mode.padEnd(27),
      formatMilliseconds(result.durationMs).padStart(9),
      `${result.characters ?? 0} chars`.padStart(13),
      result.extractor.padEnd(24),
      path.basename(result.sourcePath),
    ].join(" | "),
  )
  for (const warning of result.warnings) {
    console.log(`  warning: ${warning}`)
  }
}

function printSummary(benchmarkResults: BenchmarkResult[]): void {
  console.log("\nSummary")
  for (const sourcePath of sourcePaths) {
    const fileResults = benchmarkResults.filter((result) => result.sourcePath === sourcePath)
    console.log(path.basename(sourcePath))
    for (const result of fileResults) {
      console.log(
        `  ${result.mode.padEnd(27)} ${formatMilliseconds(result.durationMs).padStart(9)} ${result.extractor}`,
      )
    }
  }
}

function parseCliArguments(
  args: string[],
  reportDate: Date,
) {
  const sourcePaths: string[] = []
  let outputPath = defaultOutputPath(reportDate)

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === OUTPUT_OPTION) {
      const configuredOutput = args[index + 1]
      if (!configuredOutput) {
        throw new Error(`${OUTPUT_OPTION} requires a file path.`)
      }
      outputPath = path.isAbsolute(configuredOutput)
        ? configuredOutput
        : path.resolve(repositoryRoot, configuredOutput)
      index += 1
      continue
    }
    if (argument) {
      sourcePaths.push(path.resolve(argument))
    }
  }

  return {
    sourcePaths,
    outputPath,
  }
}

async function writeBenchmarkReport(input: {
  generatedAt: Date
  outputPath: string
  results: BenchmarkResult[]
}): Promise<void> {
  const report: BenchmarkReport = {
    version: BENCHMARK_REPORT_VERSION,
    generatedAt: input.generatedAt.toISOString(),
    environment: {
      platform: process.platform,
      architecture: process.arch,
      bunVersion: process.versions.bun ?? "unknown",
    },
    results: input.results.map(({ sourcePath, durationMs, ...result }) => ({
      ...result,
      source: path.basename(sourcePath),
      durationMs: Math.round(durationMs),
    })),
  }
  await mkdir(path.dirname(input.outputPath), { recursive: true })
  await writeFile(input.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
}

function defaultOutputPath(reportDate: Date): string {
  const timestamp = reportDate.toISOString().replaceAll(":", "-").replaceAll(".", "-")
  return path.join(
    repositoryRoot,
    "docs",
    "artifacts",
    "benchmarks",
    `pdf-resource-preparation-${timestamp}.json`,
  )
}

function formatMilliseconds(value: number): string {
  if (value < 1_000) return `${value.toFixed(0)}ms`
  return `${(value / 1_000).toFixed(2)}s`
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}
