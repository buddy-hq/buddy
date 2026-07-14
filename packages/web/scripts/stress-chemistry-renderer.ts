import createIndigoRuntime from "indigo-ketcher"
import type { ChemistryFormat } from "../src/components/media/renderers/chemistry/formats"
import {
  IndigoWorkerClient,
  INDIGO_MAX_PENDING_RENDERS,
} from "../src/components/media/renderers/chemistry/indigo-worker-client"
import { prepareChemistrySvg } from "../src/components/media/renderers/chemistry/svg"
import {
  indigoFormatForChemistry,
  validateChemistrySource,
} from "../src/components/media/renderers/chemistry/validation"

type BrowserChemistryFormat = Exclude<ChemistryFormat, "chemfig">
type StressExpectation =
  | { outcome: "rendered" }
  | { messageIncludes: string; outcome: "rejected" }
type StressCase = {
  expectation: StressExpectation
  format: BrowserChemistryFormat
  name: string
  source: string
}
type StressResult = {
  durationMs: number
  error?: string
  format: BrowserChemistryFormat
  name: string
  passed: boolean
  svg?: string
}
type StressConfiguration = {
  concurrency: number
  iterations: number
  warmup: number
}

const DEFAULT_CONCURRENCY = 32
const DEFAULT_ITERATIONS = 100
const DEFAULT_WARMUP = 16
const ARGUMENT_PREFIXES = {
  concurrency: "--concurrency=",
  iterations: "--iterations=",
  warmup: "--warmup=",
} as const

function readPositiveIntegerArgument(
  prefix: string,
  fallback: number,
  name: string,
): number {
  const argument = Bun.argv.find((value) => value.startsWith(prefix))
  if (!argument) return fallback
  const parsed = Number.parseInt(argument.slice(prefix.length), 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return parsed
}

function readConfiguration(): StressConfiguration {
  const concurrency = readPositiveIntegerArgument(
    ARGUMENT_PREFIXES.concurrency,
    DEFAULT_CONCURRENCY,
    "--concurrency",
  )
  if (concurrency > INDIGO_MAX_PENDING_RENDERS) {
    throw new Error(
      `--concurrency cannot exceed the production worker queue limit of ${INDIGO_MAX_PENDING_RENDERS}.`,
    )
  }
  return {
    concurrency,
    iterations: readPositiveIntegerArgument(
      ARGUMENT_PREFIXES.iterations,
      DEFAULT_ITERATIONS,
      "--iterations",
    ),
    warmup: readPositiveIntegerArgument(
      ARGUMENT_PREFIXES.warmup,
      DEFAULT_WARMUP,
      "--warmup",
    ),
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = values.toSorted((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  return sorted[index] ?? 0
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

async function createStressCases(): Promise<StressCase[]> {
  const runtime = await createIndigoRuntime()
  const defaultOptions = new runtime.MapStringString()
  try {
    return [
      {
        expectation: { outcome: "rendered" },
        format: "smiles",
        name: "simple SMILES",
        source: "CCO",
      },
      {
        expectation: { outcome: "rendered" },
        format: "smiles",
        name: "stereo and charge SMILES",
        source: "N[C@@H](C)C(=O)[O-]",
      },
      {
        expectation: { outcome: "rendered" },
        format: "smiles",
        name: "large linear SMILES",
        source: "C".repeat(160),
      },
      {
        expectation: { outcome: "rendered" },
        format: "smiles",
        name: "aromatic multi-fragment SMILES",
        source: "c1ccccc1.CC(=O)[O-].[Na+]",
      },
      {
        expectation: { outcome: "rendered" },
        format: "cxsmiles",
        name: "CXSMILES coordinates",
        source: "CCO |(0,0,;1.5,0,;3,0,)|",
      },
      {
        expectation: { outcome: "rendered" },
        format: "cxsmiles",
        name: "CXSMILES supported SRU S-group",
        source: "CCCC |Sg:n:0,1,2::ht|",
      },
      {
        expectation: {
          messageIncludes: 'CXSMILES S-group type "SRU" is not supported',
          outcome: "rejected",
        },
        format: "cxsmiles",
        name: "CXSMILES unsupported S-group spelling",
        source: "CCCC |Sg:SRU:0,1,2::ht|",
      },
      {
        expectation: { outcome: "rendered" },
        format: "reaction-smiles",
        name: "reaction SMILES",
        source: "CCO>>CC=O",
      },
      {
        expectation: { outcome: "rendered" },
        format: "ket",
        name: "Indigo KET document",
        source: runtime.convert("CCO", "ket", defaultOptions),
      },
      {
        expectation: {
          messageIncludes: 'KET source must contain a "root.nodes" array',
          outcome: "rejected",
        },
        format: "ket",
        name: "JSON object that is not KET",
        source: '{"version":1}',
      },
    ]
  } finally {
    defaultOptions.delete()
  }
}

async function runCase(
  client: IndigoWorkerClient,
  testCase: StressCase,
  operationID: number,
): Promise<StressResult> {
  const startedAt = performance.now()
  try {
    const validated = validateChemistrySource({
      format: testCase.format,
      source: testCase.source,
    })
    const rendered = await client.render({
      source: validated.source,
      format: indigoFormatForChemistry(validated.format),
    })
    if (testCase.expectation.outcome === "rejected") {
      return {
        durationMs: performance.now() - startedAt,
        error: "Expected rejection, but the renderer returned SVG.",
        format: testCase.format,
        name: testCase.name,
        passed: false,
      }
    }
    const svg = prepareChemistrySvg(rendered.svg)
    const validSvg = svg.startsWith("<svg") && !svg.includes("<?xml")
    return {
      durationMs: performance.now() - startedAt,
      ...(validSvg ? {} : { error: "Renderer returned an invalid SVG document." }),
      format: testCase.format,
      name: testCase.name,
      passed: validSvg,
      svg,
    }
  } catch (error) {
    const message = errorMessage(error)
    const passed =
      testCase.expectation.outcome === "rejected" &&
      message.includes(testCase.expectation.messageIncludes)
    return {
      durationMs: performance.now() - startedAt,
      ...(passed ? {} : { error: `operation ${operationID}: ${message}` }),
      format: testCase.format,
      name: testCase.name,
      passed,
    }
  }
}

async function runBurst(
  client: IndigoWorkerClient,
  workload: StressCase[],
  concurrency: number,
  expectedSvg?: Map<string, string>,
): Promise<StressResult[]> {
  const results: StressResult[] = []
  for (let offset = 0; offset < workload.length; offset += concurrency) {
    const burst = workload.slice(offset, offset + concurrency)
    const burstResults = await Promise.all(
      burst.map((testCase, index) => runCase(client, testCase, offset + index)),
    )
    for (const result of burstResults) {
      if (result.svg && expectedSvg) {
        const previous = expectedSvg.get(result.name)
        if (previous === undefined) {
          expectedSvg.set(result.name, result.svg)
        } else if (previous !== result.svg) {
          result.passed = false
          result.error = "The same input produced non-deterministic SVG output."
        }
      }
      result.svg = undefined
      results.push(result)
    }
  }
  return results
}

const configuration = readConfiguration()
const cases = await createStressCases()
const renderedCases = cases.filter((testCase) => testCase.expectation.outcome === "rendered")
const client = new IndigoWorkerClient()
try {
  const warmupWorkload = Array.from(
    { length: configuration.warmup },
    (_, index) => renderedCases[index % renderedCases.length],
  ).filter((testCase) => testCase !== undefined)
  const warmupResults = await runBurst(client, warmupWorkload, configuration.concurrency)
  const warmupFailure = warmupResults.find((result) => !result.passed)
  if (warmupFailure) {
    throw new Error(`Warm-up failed: ${warmupFailure.error ?? warmupFailure.name}`)
  }

  const workload = Array.from(
    { length: configuration.iterations * cases.length },
    (_, index) => cases[(index * 7) % cases.length],
  ).filter((testCase) => testCase !== undefined)
  const memoryBefore = process.memoryUsage()
  const startedAt = performance.now()
  const expectedSvg = new Map<string, string>()
  const results = await runBurst(
    client,
    workload,
    configuration.concurrency,
    expectedSvg,
  )
  const elapsedMs = performance.now() - startedAt
  Bun.gc(true)
  const memoryAfter = process.memoryUsage()

  const summaries = cases.map((testCase) => {
    const matching = results.filter((result) => result.name === testCase.name)
    const durations = matching.map((result) => result.durationMs)
    return {
      averageMs: (
        durations.reduce((sum, duration) => sum + duration, 0) / durations.length
      ).toFixed(1),
      case: testCase.name,
      format: testCase.format,
      p95Ms: percentile(durations, 0.95).toFixed(1),
      p99Ms: percentile(durations, 0.99).toFixed(1),
      passed: `${matching.filter((result) => result.passed).length}/${matching.length}`,
    }
  })
  console.table(summaries)
  console.table({
    configuration: {
      concurrency: configuration.concurrency,
      elapsedSeconds: (elapsedMs / 1000).toFixed(2),
      operations: results.length,
      operationsPerSecond: (results.length / (elapsedMs / 1000)).toFixed(1),
      rssBefore: formatBytes(memoryBefore.rss),
      rssAfter: formatBytes(memoryAfter.rss),
      rssGrowth: formatBytes(memoryAfter.rss - memoryBefore.rss),
      warmupOperations: warmupResults.length,
    },
  })

  const failures = results.filter((result) => !result.passed)
  if (failures.length > 0) {
    for (const failure of failures.slice(0, 20)) {
      console.error(
        `[FAIL] ${failure.format} / ${failure.name}: ${failure.error ?? "unknown failure"}`,
      )
    }
    if (failures.length > 20) {
      console.error(`...and ${failures.length - 20} more failures.`)
    }
    process.exitCode = 1
  } else {
    console.log(`Chemistry renderer stress test passed: ${results.length} operations.`)
  }
} finally {
  client.destroy()
}
