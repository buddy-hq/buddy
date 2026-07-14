import { describe, expect, test } from "bun:test"
import {
  createReadyUpdateStore,
  createUpdateCheckCoordinator,
  isReadyUpdateCurrent,
} from "../src/main/update-check-coordinator"

const FIRST_UPDATE_VERSION = "0.0.50"
const REPLACEMENT_UPDATE_VERSION = "0.0.51"

describe("update check coordinator", () => {
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

  test("revalidates sequential checks after an update is already ready", async () => {
    const availableVersions = [FIRST_UPDATE_VERSION, REPLACEMENT_UPDATE_VERSION]
    let checks = 0
    const coordinator = createUpdateCheckCoordinator(async () => {
      const version = availableVersions[checks]
      checks += 1
      return version
    })

    await expect(coordinator.check("preview")).resolves.toBe(FIRST_UPDATE_VERSION)
    await expect(coordinator.check("preview")).resolves.toBe(REPLACEMENT_UPDATE_VERSION)
    expect(checks).toBe(2)
  })

  test("deduplicates concurrent checks for the same ring", async () => {
    let checks = 0
    let finishCheck: ((version: string) => void) | undefined
    const result = new Promise<string>((resolve) => {
      finishCheck = resolve
    })
    const coordinator = createUpdateCheckCoordinator(async () => {
      checks += 1
      return await result
    })

    const first = coordinator.check("preview")
    const second = coordinator.check("preview")
    finishCheck?.(FIRST_UPDATE_VERSION)

    await expect(first).resolves.toBe(FIRST_UPDATE_VERSION)
    await expect(second).resolves.toBe(FIRST_UPDATE_VERSION)
    expect(checks).toBe(1)
  })

  test("runs install work after an active update check settles", async () => {
    const events: string[] = []
    let finishCheck: (() => void) | undefined
    const checkGate = new Promise<void>((resolve) => {
      finishCheck = resolve
    })
    const coordinator = createUpdateCheckCoordinator(async () => {
      events.push("check-started")
      await checkGate
      events.push("check-finished")
      return FIRST_UPDATE_VERSION
    })

    const check = coordinator.check("preview")
    const install = coordinator.runExclusive(async () => {
      events.push("install-started")
    })
    await Promise.resolve()
    expect(events).toEqual(["check-started"])

    finishCheck?.()
    await Promise.all([check, install])
    expect(events).toEqual(["check-started", "check-finished", "install-started"])
  })
})
