import { expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { watchBackendDevelopmentReloadSignal } from "../src/main/backend-development-reload"

const TEST_DIRECTORY_PREFIX = "buddy-backend-development-reload-"
const SIGNAL_FILENAME = "reload.signal"
const RELOAD_SETTLE_TIMEOUT_MS = 1_000
const DUPLICATE_EVENT_SETTLE_MS = 150

async function waitForReload(reloaded: Promise<void>): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      reloaded,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Backend development reload signal timed out"))
        }, RELOAD_SETTLE_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

test("reloads once for each new signal generation", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), TEST_DIRECTORY_PREFIX))

  try {
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
      await waitForReload(reloaded)

      writeFileSync(signalPath, "1\n")
      await Bun.sleep(DUPLICATE_EVENT_SETTLE_MS)

      expect(errors).toEqual([])
      expect(reloadCount).toBe(1)
      expect(generations).toEqual(["1\n"])

      const reloadedAgain = new Promise<void>((resolve) => {
        resolveReload = resolve
      })
      writeFileSync(signalPath, "2\n")
      await waitForReload(reloadedAgain)

      expect(errors).toEqual([])
      expect(reloadCount).toBe(2)
      expect(generations).toEqual(["1\n", "2\n"])
    } finally {
      stop()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("accepts another source reload after a failed restart", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), TEST_DIRECTORY_PREFIX))

  try {
    const signalPath = path.join(directory, SIGNAL_FILENAME)
    writeFileSync(signalPath, "0\n")

    let resolveFailure: (() => void) | undefined
    const failed = new Promise<void>((resolve) => {
      resolveFailure = resolve
    })
    let resolveReload: (() => void) | undefined
    const reloaded = new Promise<void>((resolve) => {
      resolveReload = resolve
    })
    const failure = new Error("Changed backend source failed to start")
    const errors: unknown[] = []
    const generations: string[] = []
    const stop = watchBackendDevelopmentReloadSignal({
      signalPath,
      onError: (error) => {
        errors.push(error)
        resolveFailure?.()
      },
      onReload: async (generation) => {
        generations.push(generation)
        if (generation === "1\n") throw failure
        resolveReload?.()
      },
    })

    try {
      writeFileSync(signalPath, "1\n")
      await waitForReload(failed)
      writeFileSync(signalPath, "2\n")
      await waitForReload(reloaded)

      expect(errors).toEqual([failure])
      expect(generations).toEqual(["1\n", "2\n"])
    } finally {
      stop()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
