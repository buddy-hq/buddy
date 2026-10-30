import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runTestFile, testFileTimeoutMilliseconds } from "./run-tests"

async function processExits(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
    await Bun.sleep(10)
  }
  return false
}

test("uses an eight minute file deadline and rejects invalid timeout configuration", () => {
  expect(testFileTimeoutMilliseconds(undefined)).toBe(480_000)
  expect(testFileTimeoutMilliseconds("0.25")).toBe(250)
  for (const value of ["", "0", "-1", "NaN", "Infinity", "2147484"]) {
    expect(() => testFileTimeoutMilliseconds(value)).toThrow("BUDDY_TEST_FILE_TIMEOUT_SECONDS")
  }
})

test("a file deadline terminates the test and its descendant and reports failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "buddy-test-deadline-"))
  const marker = path.join(root, "descendant.pid")
  const abort = new AbortController()
  const safetyTimer = setTimeout(() => abort.abort(), 3_000)
  try {
    const result = await runTestFile({
      owner: "root-script",
      files: ["hung.test.ts"],
      timeoutMilliseconds: 500,
      abortSignal: abort.signal,
      command: [
        process.execPath,
        "-e",
        `const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], { stdout: "ignore", stderr: "ignore" }); await Bun.write(${JSON.stringify(marker)}, String(child.pid)); setInterval(() => {}, 1000)`,
      ],
    })
    expect(result).toEqual({ exitCode: 1, signal: undefined })
    const pid = Number(await readFile(marker, "utf8"))
    expect(Number.isSafeInteger(pid)).toBe(true)
    expect(await processExits(pid)).toBe(true)
  } finally {
    clearTimeout(safetyTimer)
    await rm(root, { recursive: true, force: true })
  }
})

test("a passing file clears its deadline and preserves its exit status", async () => {
  expect(
    await runTestFile({
      owner: "root-script",
      files: ["passing.test.ts"],
      timeoutMilliseconds: 3_000,
      command: [process.execPath, "-e", "process.exit(0)"],
    }),
  ).toEqual({ exitCode: 0, signal: undefined })
})

test("external cancellation remains an interruption rather than a file timeout", async () => {
  const abort = new AbortController()
  abort.abort()
  expect(
    await runTestFile({
      owner: "root-script",
      files: ["cancelled.test.ts"],
      timeoutMilliseconds: 3_000,
      abortSignal: abort.signal,
      command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
    }),
  ).toEqual({ exitCode: 143, signal: "SIGTERM" })
})
