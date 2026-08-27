import { readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runSupervisedTestProcess } from "../../../script/test-process.ts"

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const TEST_ROOT = path.join(PACKAGE_ROOT, "test")
const TEST_FILE_PATTERN = /\.test\.(?:js|jsx|ts|tsx)$/
const BUN_EXECUTABLE = process.execPath
const MILLISECONDS_PER_SECOND = 1_000

function formatDuration(durationMilliseconds) {
  return `${(durationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(2)}s`
}

function normalizeRequestedTestFile(value) {
  const resolved = path.resolve(PACKAGE_ROOT, value)
  const relative = path.relative(PACKAGE_ROOT, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative) || !TEST_FILE_PATTERN.test(relative)) {
    throw new Error(`Invalid web test file: ${value}`)
  }
  return relative.split(path.sep).join(path.posix.sep)
}

async function discoverTestFiles(directory = TEST_ROOT) {
  const files = []
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

async function runTestFile(file) {
  const startedAt = performance.now()
  const result = await runSupervisedTestProcess({
    command: [
      BUN_EXECUTABLE,
      "test",
      "--preload",
      "./happydom.ts",
      "--only-failures",
      `./${file}`,
    ],
    cwd: PACKAGE_ROOT,
  })
  const durationMilliseconds = performance.now() - startedAt
  console.log(
    `[test:file] ${file}: ${result.exitCode === 0 ? "passed" : `failed (${result.exitCode})`} in ${formatDuration(durationMilliseconds)}`,
  )
  return { ...result, durationMilliseconds }
}

const requestedFiles = process.argv.slice(2).map(normalizeRequestedTestFile)
const testFiles = requestedFiles.length > 0 ? requestedFiles : await discoverTestFiles()
if (testFiles.length === 0) {
  throw new Error("No web test files found")
}

const failedFiles = []
const startedAt = performance.now()
let completedFiles = 0
let interruptedExitCode
for (const file of testFiles) {
  const result = await runTestFile(file)
  completedFiles += 1
  if (result.exitCode !== 0) failedFiles.push(file)
  if (result.signal !== undefined) {
    interruptedExitCode = result.exitCode
    break
  }
}
console.log(
  `[test:web] ${completedFiles}/${testFiles.length} files completed in ${formatDuration(performance.now() - startedAt)}`,
)

if (interruptedExitCode !== undefined) {
  process.exitCode = interruptedExitCode
} else if (failedFiles.length > 0) {
  console.error(`Failed web test files:\n${failedFiles.join("\n")}`)
  process.exitCode = 1
}
