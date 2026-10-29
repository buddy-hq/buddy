#!/usr/bin/env bun

import path from "node:path"
import {
  selectTestOwners,
  TEST_OWNERS,
  TEST_OWNERS_ENVIRONMENT_KEY,
  type OwnedTestFile,
  type TestOwner,
  verifyTestTopology,
} from "./test-topology"
import {
  runSupervisedTestProcess,
  testProcessFailed,
  type SupervisedTestProcessInput,
  type SupervisedTestProcessResult,
  type TestProcessSignal,
} from "./test-process"
import { runSandboxedTestProcess } from "./sandboxed-test-process"

const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..")
const PER_FILE_FLAG = "--per-file"
const MILLISECONDS_PER_SECOND = 1_000
const DEFAULT_FILE_TIMEOUT_SECONDS = 8 * 60
const MAX_TIMER_MILLISECONDS = 2_147_483_647

export function testFileTimeoutMilliseconds(configuredValue: string | undefined): number {
  const seconds = Number(configuredValue ?? DEFAULT_FILE_TIMEOUT_SECONDS)
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds * 1_000 > MAX_TIMER_MILLISECONDS) {
    throw new Error("BUDDY_TEST_FILE_TIMEOUT_SECONDS must be a positive finite timer duration")
  }
  return seconds * MILLISECONDS_PER_SECOND
}

export async function runTestFile(
  input: SupervisedTestProcessInput & {
    readonly owner: string
    readonly files: readonly string[]
    readonly timeoutMilliseconds?: number
  },
): Promise<SupervisedTestProcessResult> {
  const timeoutMilliseconds =
    input.timeoutMilliseconds ??
    testFileTimeoutMilliseconds(process.env.BUDDY_TEST_FILE_TIMEOUT_SECONDS)
  const deadline = new AbortController()
  const timer = setTimeout(() => {
    for (const file of input.files) {
      console.error(
        `[test:${input.owner}:timeout] ${file} after ${timeoutMilliseconds / MILLISECONDS_PER_SECOND}s`,
      )
    }
    deadline.abort()
  }, timeoutMilliseconds)
  try {
    const result = await runSandboxedTestProcess({
      ...input,
      abortSignal:
        input.abortSignal === undefined
          ? deadline.signal
          : AbortSignal.any([deadline.signal, input.abortSignal]),
    })
    return deadline.signal.aborted ? { exitCode: 1, signal: undefined } : result
  } finally {
    clearTimeout(timer)
  }
}

type TestRun = {
  id: string
  command: readonly string[]
  workingDirectory: string
  file?: OwnedTestFile
}

type TestRunResult = {
  durationMilliseconds: number
  exitCode: number
  id: string
  signal: TestProcessSignal | undefined
}

function formatDuration(durationMilliseconds: number): string {
  return `${(durationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(2)}s`
}

async function runTest(run: TestRun): Promise<TestRunResult> {
  const startedAt = performance.now()
  console.log(`\n[test:start] ${run.id}`)
  const input = {
    command: run.command,
    cwd: path.resolve(REPOSITORY_ROOT, run.workingDirectory),
  }
  const result =
    run.file === undefined
      ? await runSupervisedTestProcess(input)
      : await runTestFile({ ...input, owner: run.file.owner.id, files: [run.file.path] })
  const durationMilliseconds = performance.now() - startedAt
  console.log(
    `[test:finish] ${run.id}: ${result.exitCode === 0 ? "passed" : `failed (${result.exitCode})`} in ${formatDuration(durationMilliseconds)}`,
  )
  return { durationMilliseconds, exitCode: result.exitCode, id: run.id, signal: result.signal }
}

function packageRuns(
  owners: readonly TestOwner[],
  testFiles: readonly OwnedTestFile[],
): readonly TestRun[] {
  return owners.flatMap((owner) =>
    owner.id === "backend" || owner.id === "web"
      ? [{ id: owner.id, command: owner.runCommand, workingDirectory: owner.workingDirectory }]
      : fileRuns(testFiles.filter((file) => file.owner.id === owner.id)),
  )
}

function relativeTestPath(testFile: OwnedTestFile): string {
  return path.posix.relative(testFile.owner.workingDirectory, testFile.path)
}

function testFileCommand(testFile: OwnedTestFile): readonly string[] {
  const relativePath = relativeTestPath(testFile)

  if (testFile.owner.id === "backend") {
    return [process.execPath, "./test/run-tests.ts", relativePath]
  }
  if (testFile.owner.id === "web") {
    return [process.execPath, "./scripts/test-isolated.ts", relativePath]
  }

  let command: readonly string[]
  if (
    testFile.owner.id === "desktop-electron" ||
    testFile.owner.id === "opencode-adapter" ||
    testFile.owner.id === "shared-script"
  ) {
    command = ["bun", "test", "--preload", "../../script/test-preload.ts", relativePath]
  } else if (testFile.owner.id === "root-script") {
    command = ["bun", "test", "--preload", "./script/test-preload.ts", relativePath]
  } else {
    command = ["bun", "test", "--preload", "../../script/test-preload.ts", relativePath]
  }

  return command
}

function fileRuns(testFiles: readonly OwnedTestFile[]): readonly TestRun[] {
  return testFiles.map((testFile) => ({
    id: `${testFile.owner.id}:${testFile.path}`,
    command: testFileCommand(testFile),
    workingDirectory: testFile.owner.workingDirectory,
    file: testFile,
  }))
}

function summarize(results: readonly TestRunResult[], totalDurationMilliseconds: number): void {
  console.log("\n[test:timings]")
  for (const result of results) {
    console.log(`  ${result.id}: ${formatDuration(result.durationMilliseconds)}`)
  }
  console.log(`  total: ${formatDuration(totalDurationMilliseconds)}`)
}

function hasPerFileFlag(args: readonly string[]): boolean {
  const unsupportedArguments = args.filter((argument) => argument !== PER_FILE_FLAG)
  if (unsupportedArguments.length > 0) {
    throw new Error(`Unsupported test runner arguments: ${unsupportedArguments.join(" ")}`)
  }
  return args.includes(PER_FILE_FLAG)
}

async function runAllTests(): Promise<void> {
  const startedAt = performance.now()
  const testFiles = await verifyTestTopology()
  const selectedOwners = selectTestOwners(TEST_OWNERS, process.env[TEST_OWNERS_ENVIRONMENT_KEY])
  const selectedOwnerIds = new Set(selectedOwners.map((owner) => owner.id))
  const selectedTestFiles = testFiles.filter((testFile) => selectedOwnerIds.has(testFile.owner.id))
  const runs = hasPerFileFlag(Bun.argv.slice(2))
    ? fileRuns(selectedTestFiles)
    : packageRuns(selectedOwners, selectedTestFiles)
  const results: TestRunResult[] = []

  for (const run of runs) {
    const result = await runTest(run)
    results.push(result)
    if (testProcessFailed(result)) break
  }

  const totalDurationMilliseconds = performance.now() - startedAt
  summarize(results, totalDurationMilliseconds)

  const failed = results.filter((result) => result.exitCode !== 0)
  if (failed.length > 0) {
    process.exitCode = 1
    console.error(`[test:failed] ${failed.map((result) => result.id).join(", ")}`)
  }
}

if (import.meta.main) await runAllTests()
