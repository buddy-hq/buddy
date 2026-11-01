import { expect, test } from "bun:test"
import { compiledWorkerPath } from "../src/compiled-backend"

test("Windows compiled workers use a decoded forward-slash path", () => {
  expect(compiledWorkerPath("worker.js", "file:///B:/%7EBUN/root/chunk-abc.js")).toBe(
    "B:/~BUN/root/worker.js",
  )
})

test("POSIX compiled workers keep their absolute path", () => {
  expect(compiledWorkerPath("worker.js", "file:///$bunfs/root/chunk-abc.js")).toBe(
    "/$bunfs/root/worker.js",
  )
})
