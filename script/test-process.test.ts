import { expect, test } from "bun:test"
import { runSupervisedTestProcess } from "./test-process"

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
