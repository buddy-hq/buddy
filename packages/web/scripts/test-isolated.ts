import { readdir } from "node:fs/promises"
import path from "node:path"
import {
  createTestRunnerPlan,
  normalizeRequestedPackageTestPath,
  WEB_TEST_GROUPS,
  type TestRunnerPlanEntry,
} from "../../../script/test-runner-plan"
import {
  runSupervisedTestProcess,
  type SupervisedTestProcessResult,
} from "../../../script/test-process"

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..")
const TEST_ROOT = path.join(PACKAGE_ROOT, "test")
const TEST_FILE_PATTERN = /\.test\.(?:js|jsx|ts|tsx)$/
const BUN_EXECUTABLE = process.execPath
const MILLISECONDS_PER_SECOND = 1_000

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

async function runTestEntry(entry: TestRunnerPlanEntry): Promise<TestRunResult> {
  const startedAt = performance.now()
  const result = await runSupervisedTestProcess({
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
const plan = createTestRunnerPlan({
  discoveredFiles,
  groups: WEB_TEST_GROUPS,
  requestedFiles: process.argv
    .slice(2)
    .map((file) => normalizeRequestedPackageTestPath(PACKAGE_ROOT, file)),
})

const startedAt = performance.now()
const totalFileCount = plan.reduce((count, entry) => count + entry.files.length, 0)
const failedEntries: TestRunnerPlanEntry[] = []
let completedProcesses = 0
let interruptedExitCode: number | undefined
for (const entry of plan) {
  console.log(
    `\n[test:web:start] ${entry.id} (${entry.files.length} files): ${entry.files.join(", ")}`,
  )
  const result = await runTestEntry(entry)
  completedProcesses += 1
  if (result.exitCode !== 0) failedEntries.push(entry)
  if (result.signal !== undefined) {
    interruptedExitCode = result.exitCode
    break
  }
}
console.log(
  `[test:web] ${totalFileCount} files, ${completedProcesses}/${plan.length} processes completed in ${formatDuration(performance.now() - startedAt)}`,
)

if (interruptedExitCode !== undefined) {
  process.exitCode = interruptedExitCode
} else if (failedEntries.length > 0) {
  console.error(
    `Failed web test groups/files:\n${failedEntries
      .map((entry) => `${entry.id}: ${entry.files.join(", ")}`)
      .join("\n")}`,
  )
  process.exitCode = 1
}
