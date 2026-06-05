import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { fileLockIsActiveSync, withFileLock } from "../../src/storage/file-lock"
import { tmpdir } from "../helpers/tmpdir"

const LOCK_STALE_MS = 80
const LOCK_HEARTBEAT_MS = 20
const LOCK_RETRY_MS = 10
const LOCK_TIMEOUT_MS = 500
const LONG_TASK_MS = 160
const CONTENDER_TASK_MS = 40
const MISSING_PROCESS_ID = 999_999_999
const LONG_STALE_MS = 600_000

describe("file locks", () => {
  test("treats locks from dead processes as inactive before the stale timeout", async () => {
    await using workspace = await tmpdir()
    const lockPath = path.join(workspace.path, "dead-process.lock")

    await fs.writeFile(
      lockPath,
      `${JSON.stringify({
        token: "dead-process-token",
        pid: MISSING_PROCESS_ID,
        createdAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    )

    expect(fileLockIsActiveSync(lockPath, { staleMs: LONG_STALE_MS })).toBe(false)
  })

  test("refreshes async lock mtimes while a long task is active", async () => {
    await using workspace = await tmpdir()
    const lockPath = path.join(workspace.path, "runtime.lock")

    await withFileLock(
      lockPath,
      async () => {
        const initialStats = await fs.stat(lockPath)

        await Bun.sleep(LONG_TASK_MS)

        const refreshedStats = await fs.stat(lockPath)
        expect(refreshedStats.mtimeMs).toBeGreaterThan(initialStats.mtimeMs)
        expect(fileLockIsActiveSync(lockPath, { staleMs: LOCK_STALE_MS })).toBe(true)
      },
      {
        staleMs: LOCK_STALE_MS,
        heartbeatMs: LOCK_HEARTBEAT_MS,
        retryMs: LOCK_RETRY_MS,
        timeoutMs: LOCK_TIMEOUT_MS,
      },
    )

    expect(fileLockIsActiveSync(lockPath, { staleMs: LOCK_STALE_MS })).toBe(false)
  })

  test("serializes contenders after clearing a stale lock", async () => {
    await using workspace = await tmpdir()
    const lockPath = path.join(workspace.path, "stale-contenders.lock")
    await fs.writeFile(
      lockPath,
      `${JSON.stringify({
        token: "stale-token",
        pid: MISSING_PROCESS_ID,
        createdAt: new Date().toISOString(),
      })}\n`,
      "utf8",
    )

    let activeTaskCount = 0
    let maxActiveTaskCount = 0
    const runTask = (label: string) =>
      withFileLock(
        lockPath,
        async () => {
          activeTaskCount += 1
          maxActiveTaskCount = Math.max(maxActiveTaskCount, activeTaskCount)
          await Bun.sleep(CONTENDER_TASK_MS)
          activeTaskCount -= 1
          return label
        },
        {
          staleMs: LONG_STALE_MS,
          heartbeatMs: LOCK_HEARTBEAT_MS,
          retryMs: LOCK_RETRY_MS,
          timeoutMs: LOCK_TIMEOUT_MS,
        },
      )

    const results = await Promise.all([runTask("first"), runTask("second")])

    expect(results.toSorted()).toEqual(["first", "second"])
    expect(maxActiveTaskCount).toBe(1)
    expect(fileLockIsActiveSync(lockPath, { staleMs: LOCK_STALE_MS })).toBe(false)
  })
})
