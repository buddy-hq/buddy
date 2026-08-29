#!/usr/bin/env bun

import path from "node:path"
import { TEST_OWNERS, type OwnedTestFile, verifyTestTopology } from "./test-topology"
import { runSupervisedTestProcess, type TestProcessSignal } from "./test-process"

const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..")
const TEST_COMMAND_RUNNER = path.join(REPOSITORY_ROOT, "script", "run-test-command.ts")
const PER_FILE_FLAG = "--per-file"
const MILLISECONDS_PER_SECOND = 1_000

type TestRun = {
  id: string
  command: readonly string[]
  workingDirectory: string
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
  const result = await runSupervisedTestProcess({
    command: run.command,
    cwd: path.resolve(REPOSITORY_ROOT, run.workingDirectory),
  })
  const durationMilliseconds = performance.now() - startedAt
  console.log(
    `[test:finish] ${run.id}: ${result.exitCode === 0 ? "passed" : `failed (${result.exitCode})`} in ${formatDuration(durationMilliseconds)}`,
  )
  return { durationMilliseconds, exitCode: result.exitCode, id: run.id, signal: result.signal }
}

function packageRuns(): readonly TestRun[] {
  return TEST_OWNERS.map((owner) => ({
    id: owner.id,
    command: owner.runCommand,
    workingDirectory: owner.workingDirectory,
  }))
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

  return [process.execPath, TEST_COMMAND_RUNNER, "--", ...command]
}

function fileRuns(testFiles: readonly OwnedTestFile[]): readonly TestRun[] {
  return testFiles.map((testFile) => ({
    id: `${testFile.owner.id}:${testFile.path}`,
    command: testFileCommand(testFile),
    workingDirectory: testFile.owner.workingDirectory,
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
  const runs = hasPerFileFlag(Bun.argv.slice(2)) ? fileRuns(testFiles) : packageRuns()
  const results: TestRunResult[] = []

  for (const run of runs) {
    const result = await runTest(run)
    results.push(result)
    if (result.signal !== undefined) break
  }

  const totalDurationMilliseconds = performance.now() - startedAt
  summarize(results, totalDurationMilliseconds)

  const failed = results.filter((result) => result.exitCode !== 0)
  if (failed.length > 0) {
    process.exitCode = 1
    console.error(`[test:failed] ${failed.map((result) => result.id).join(", ")}`)
  }
}

await runAllTests()
