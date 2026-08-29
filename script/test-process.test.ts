import { expect, test } from "bun:test"
import { runSupervisedTestProcess, testProcessFailed } from "./test-process"

const ABORT_EXIT_CODE = 143

test("terminates the supervised process when its abort signal fires", async () => {
  const abortController = new AbortController()
  const resultPromise = runSupervisedTestProcess({
    abortSignal: abortController.signal,
    command: [process.execPath, "-e", "setInterval(() => {}, 1_000)"],
  })

  queueMicrotask(() => abortController.abort())

  expect(await resultPromise).toEqual({
    exitCode: ABORT_EXIT_CODE,
    signal: "SIGTERM",
  })
})

test("treats every nonzero process exit as a fail-fast result", () => {
  expect(testProcessFailed({ exitCode: 0 })).toBe(false)
  expect(testProcessFailed({ exitCode: 1 })).toBe(true)
  expect(testProcessFailed({ exitCode: ABORT_EXIT_CODE })).toBe(true)
})
