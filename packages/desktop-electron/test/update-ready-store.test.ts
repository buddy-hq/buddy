import { describe, expect, test } from "bun:test"
import { createReadyUpdateStore, isReadyUpdateCurrent } from "../src/main/update-ready-store"
import { createSerialRunner } from "../src/main/serial-runner"

const FIRST_UPDATE_VERSION = "0.0.50"
const REPLACEMENT_UPDATE_VERSION = "0.0.51"

describe("ready update store", () => {
  test("can clear readiness regardless of the selected ring", () => {
    const store = createReadyUpdateStore()
    store.set({ ring: "preview", version: FIRST_UPDATE_VERSION })

    expect(store.take("stable")).toBeUndefined()
    expect(store.get()).toEqual({ ring: "preview", version: FIRST_UPDATE_VERSION })
    expect(store.clear()).toEqual({ ring: "preview", version: FIRST_UPDATE_VERSION })
    expect(store.get()).toBeUndefined()
  })

  test("does not reuse an older downloaded version for a newer signed manifest", () => {
    expect(
      isReadyUpdateCurrent(
        { ring: "preview", version: FIRST_UPDATE_VERSION },
        "preview",
        REPLACEMENT_UPDATE_VERSION,
      ),
    ).toBe(false)
    expect(
      isReadyUpdateCurrent(
        { ring: "preview", version: REPLACEMENT_UPDATE_VERSION },
        "preview",
        REPLACEMENT_UPDATE_VERSION,
      ),
    ).toBe(true)
  })
})

describe("serial runner", () => {
  test("runs install work only after an active check settles", async () => {
    const runner = createSerialRunner()
    const events: string[] = []
    let finishCheck: (() => void) | undefined
    const checkGate = new Promise<void>((resolve) => {
      finishCheck = resolve
    })

    const check = runner.runExclusive(async () => {
      events.push("check-started")
      await checkGate
      events.push("check-finished")
    })
    const install = runner.runExclusive(async () => {
      events.push("install-started")
    })
    await Promise.resolve()
    expect(events).toEqual(["check-started"])

    finishCheck?.()
    await Promise.all([check, install])
    expect(events).toEqual(["check-started", "check-finished", "install-started"])
  })

  test("keeps running queued work after a task fails", async () => {
    const runner = createSerialRunner()

    const failed = runner.runExclusive(async () => {
      throw new Error("check failed")
    })
    const next = runner.runExclusive(async () => "installed")

    await expect(failed).rejects.toThrow("check failed")
    await expect(next).resolves.toBe("installed")
  })
})
