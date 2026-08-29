import { readdir } from "node:fs/promises"
import path from "node:path"
import {
  createTestRunnerPlan,
  normalizeRequestedPackageTestPath,
  TEST_FILE_PATTERN,
  WEB_TEST_GROUPS,
  type TestRunnerPlanEntry,
} from "../../../script/test-runner-plan"
import { runSandboxedTestProcess } from "../../../script/sandboxed-test-process"
import {
  runWithConcurrency,
  selectTestShardItems,
  testConcurrency,
  testShard,
  testShardForExplicitSelection,
} from "../../../script/test-concurrency"
import { testProcessFailed, type SupervisedTestProcessResult } from "../../../script/test-process"

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..")
const TEST_ROOT = path.join(PACKAGE_ROOT, "test")
const BUN_EXECUTABLE = process.execPath
const MILLISECONDS_PER_SECOND = 1_000
const TEST_CONCURRENCY = testConcurrency()
const TEST_SHARD = testShard()

type TestRunResult = SupervisedTestProcessResult & {
  readonly durationMilliseconds: number
  readonly entry: TestRunnerPlanEntry
}

function formatDuration(durationMilliseconds: number): string {
  return `${(durationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(2)}s`
}

async function discoverTestFiles(directory = TEST_ROOT): Promise<readonly string[]> {
  const files: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await discoverTestFiles(absolutePath)))
      continue
    }
    if (!entry.isFile() || !TEST_FILE_PATTERN.test(entry.name)) continue
    files.push(path.relative(PACKAGE_ROOT, absolutePath).split(path.sep).join(path.posix.sep))
  }
  return files.toSorted()
}

async function runTestEntry(
  entry: TestRunnerPlanEntry,
  abortSignal: AbortSignal,
): Promise<TestRunResult> {
  const startedAt = performance.now()
  const result = await runSandboxedTestProcess({
    abortSignal,
    command: [
      BUN_EXECUTABLE,
      "test",
      "--preload",
      "./happydom.ts",
      "--only-failures",
      ...entry.files.map((file) => `./${file}`),
    ],
    cwd: PACKAGE_ROOT,
  })
  const durationMilliseconds = performance.now() - startedAt
  console.log(
    `[test:web:finish] ${entry.id}: ${result.exitCode === 0 ? "passed" : `failed (${result.exitCode})`} in ${formatDuration(durationMilliseconds)}`,
  )
  return { ...result, durationMilliseconds, entry }
}

const discoveredFiles = await discoverTestFiles()
const requestedFiles = process.argv
  .slice(2)
  .map((file) => normalizeRequestedPackageTestPath(PACKAGE_ROOT, file))
const completePlan = createTestRunnerPlan({
  discoveredFiles,
  groups: WEB_TEST_GROUPS,
  requestedFiles,
})
const effectiveTestShard = testShardForExplicitSelection(TEST_SHARD, requestedFiles.length > 0)
const plan = selectTestShardItems(completePlan, effectiveTestShard)

const startedAt = performance.now()
const totalFileCount = plan.reduce((count, entry) => count + entry.files.length, 0)
const failedEntries: TestRunnerPlanEntry[] = []
const results = await runWithConcurrency({
  concurrency: TEST_CONCURRENCY,
  items: plan,
  run: async (entry, _index, abortSignal) => {
    console.log(
      `\n[test:web:start] ${entry.id} (${entry.files.length} files): ${entry.files.join(", ")}`,
    )
    return runTestEntry(entry, abortSignal)
  },
  shouldStop: testProcessFailed,
})

for (const result of results) {
  if (testProcessFailed(result) && result.signal === undefined) failedEntries.push(result.entry)
}
const interruptedResult = results.find((result) => result.signal !== undefined)
console.log(
  `[test:web] shard ${effectiveTestShard.index + 1}/${effectiveTestShard.count}: ${totalFileCount} files, ${results.length}/${plan.length} processes completed with concurrency ${TEST_CONCURRENCY} in ${formatDuration(performance.now() - startedAt)}`,
)

if (failedEntries.length > 0) {
  console.error(
    `Failed web test groups/files:\n${failedEntries
      .map((entry) => `${entry.id}: ${entry.files.join(", ")}`)
      .join("\n")}`,
  )
  process.exitCode = 1
} else if (interruptedResult !== undefined) {
  process.exitCode = interruptedResult.exitCode
}
