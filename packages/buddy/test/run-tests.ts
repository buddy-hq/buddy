#!/usr/bin/env bun

import { readdir } from "node:fs/promises"
import path from "node:path"
import {
  runSupervisedTestProcess,
  type SupervisedTestProcessResult,
} from "../../../script/test-process"

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..")
const TEST_ROOT = path.join(PACKAGE_ROOT, "test")
const TEST_FILE_PATTERN = /\.test\.(?:js|jsx|ts|tsx)$/
const TEST_FILES_PER_PROCESS = 1
const MILLISECONDS_PER_SECOND = 1_000
const BUN_EXECUTABLE = process.execPath

function formatDuration(durationMilliseconds: number): string {
  return `${(durationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(2)}s`
}

function normalizeRequestedTestFile(value: string): string {
  const resolved = path.resolve(PACKAGE_ROOT, value)
  const relative = path.relative(PACKAGE_ROOT, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative) || !TEST_FILE_PATTERN.test(relative)) {
    throw new Error(`Invalid backend test file: ${value}`)
  }
  return relative.split(path.sep).join(path.posix.sep)
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

function chunkTestFiles(testFiles: readonly string[]): readonly (readonly string[])[] {
  const chunks: string[][] = []
  for (let index = 0; index < testFiles.length; index += TEST_FILES_PER_PROCESS) {
    chunks.push(testFiles.slice(index, index + TEST_FILES_PER_PROCESS))
  }
  return chunks
}

async function runTestChunk(
  files: readonly string[],
  index: number,
  total: number,
): Promise<SupervisedTestProcessResult> {
  const startedAt = performance.now()
  console.log(`\n[test:backend:start] chunk ${index}/${total} (${files.length} files)`)
  const result = await runSupervisedTestProcess({
    command: [
      BUN_EXECUTABLE,
      "test",
      "--preload",
      "./test/preload.ts",
      ...files.map((file) => `./${file}`),
    ],
    cwd: PACKAGE_ROOT,
  })
  console.log(
    `[test:backend:finish] chunk ${index}/${total}: ${result.exitCode === 0 ? "passed" : `failed (${result.exitCode})`} in ${formatDuration(performance.now() - startedAt)}`,
  )
  return result
}

const requestedFiles = Bun.argv.slice(2).map(normalizeRequestedTestFile)
const testFiles = requestedFiles.length > 0 ? requestedFiles : await discoverTestFiles()
if (testFiles.length === 0) throw new Error("No backend test files found")

const startedAt = performance.now()
const chunks = chunkTestFiles(testFiles)
const failedChunks: number[] = []
let completedChunks = 0
let interruptedExitCode: number | undefined
for (const [index, files] of chunks.entries()) {
  const chunkNumber = index + 1
  const result = await runTestChunk(files, chunkNumber, chunks.length)
  completedChunks += 1
  if (result.exitCode !== 0) failedChunks.push(chunkNumber)
  if (result.signal !== undefined) {
    interruptedExitCode = result.exitCode
    break
  }
}

console.log(
  `[test:backend] ${testFiles.length} files, ${completedChunks}/${chunks.length} processes completed in ${formatDuration(performance.now() - startedAt)}`,
)
if (interruptedExitCode !== undefined) {
  process.exitCode = interruptedExitCode
} else if (failedChunks.length > 0) {
  console.error(`[test:backend:failed] chunks ${failedChunks.join(", ")}`)
  process.exitCode = 1
}
