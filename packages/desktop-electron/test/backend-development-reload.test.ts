import { expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { watchBackendDevelopmentReloadSignal } from "../src/main/backend-development-reload"

const TEST_DIRECTORY_PREFIX = "buddy-backend-development-reload-"
const SIGNAL_FILENAME = "reload.signal"
const RELOAD_SETTLE_TIMEOUT_MS = 1_000
const DUPLICATE_EVENT_SETTLE_MS = 150

test("reloads once for each new signal generation", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), TEST_DIRECTORY_PREFIX))
  const signalPath = path.join(directory, SIGNAL_FILENAME)
  writeFileSync(signalPath, "0\n")

  let reloadCount = 0
  const generations: string[] = []
  let resolveReload: (() => void) | undefined
  const reloaded = new Promise<void>((resolve) => {
    resolveReload = resolve
  })
  const errors: unknown[] = []
  const stop = watchBackendDevelopmentReloadSignal({
    signalPath,
    onError: (error) => errors.push(error),
    onReload: async (generation) => {
      reloadCount += 1
      generations.push(generation)
      resolveReload?.()
    },
  })

  try {
    writeFileSync(signalPath, "1\n")
    await Promise.race([
      reloaded,
      Bun.sleep(RELOAD_SETTLE_TIMEOUT_MS).then(() => {
        throw new Error("Backend development reload signal timed out")
      }),
    ])

    writeFileSync(signalPath, "1\n")
    await Bun.sleep(DUPLICATE_EVENT_SETTLE_MS)

    expect(errors).toEqual([])
    expect(reloadCount).toBe(1)
    expect(generations).toEqual(["1\n"])
  } finally {
    stop()
    rmSync(directory, { recursive: true, force: true })
  }
})
