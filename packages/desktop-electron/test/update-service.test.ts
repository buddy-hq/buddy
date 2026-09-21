import { describe, expect, test } from "bun:test"
import type { UpdateReleaseNote, UpdateRing, UpdateState } from "@buddy/update-contract"
import { createSerialRunner } from "../src/main/serial-runner"
import {
  createUpdateService,
  type UpdateCheckOutcome,
  type UpdateDownloadOutcome,
  type UpdateInstallOutcome,
} from "../src/main/update-service"

const CHECKED_AT = new Date("2026-09-21T10:00:00.000Z")
const RELEASE_NOTE: UpdateReleaseNote = {
  version: "1.1.0",
  url: "https://example.com/releases/v1.1.0",
  items: ["Faster Bench"],
  totalItems: 1,
}

function createHarness(input: {
  check?: UpdateCheckOutcome
  checks?: readonly UpdateCheckOutcome[]
  download?: UpdateDownloadOutcome
  install?: UpdateInstallOutcome
  beforeCheck?: (call: number) => Promise<void>
  reject?: "check" | "download" | "install"
  supported?: boolean
}) {
  const transfers: string[] = []
  const installs: string[] = []
  const persistedRings: UpdateRing[] = []
  const published: UpdateState[] = []
  const unexpectedErrors: string[] = []
  const scheduledOnce: Array<() => Promise<void>> = []
  const scheduledRecurring: Array<() => Promise<void>> = []
  let checkCalls = 0
  let discardedReadyUpdates = 0

  const service = createUpdateService({
    currentVersion: "1.0.0",
    ring: "stable",
    supported: input.supported ?? true,
    mechanics: {
      checkLatest: async () => {
        const call = checkCalls
        const outcome = input.checks?.[call] ?? input.check ?? { kind: "up-to-date" }
        checkCalls += 1
        await input.beforeCheck?.(call)
        if (input.reject === "check") throw new Error("check rejected")
        return outcome
      },
      download: async ({ version, onProgress }) => {
        transfers.push(version)
        if (input.reject === "download") throw new Error("download rejected")
        onProgress({ percent: 50, transferredBytes: 512, totalBytes: 1024 })
        return input.download ?? { kind: "downloaded", version }
      },
      install: async ({ version }) => {
        installs.push(version)
        if (input.reject === "install") throw new Error("install rejected")
        return input.install ?? { kind: "started" }
      },
    },
    dependencies: {
      runExclusive: createSerialRunner().runExclusive,
      now: () => CHECKED_AT,
      persistRing: (ring) => persistedRings.push(ring),
      discardReadyUpdate: () => {
        discardedReadyUpdates += 1
      },
      reportUnexpectedError: ({ operation }) => unexpectedErrors.push(operation),
      scheduleOnce: (run) => {
        scheduledOnce.push(run)
        return () => undefined
      },
      scheduleRecurring: (run) => {
        scheduledRecurring.push(run)
        return () => undefined
      },
      readReleaseNotes: async () => [RELEASE_NOTE],
    },
  })
  service.subscribe((state) => published.push(state))

  return {
    service,
    transfers,
    installs,
    persistedRings,
    published,
    unexpectedErrors,
    scheduledOnce,
    scheduledRecurring,
    getCheckCalls: () => checkCalls,
    getDiscardedReadyUpdates: () => discardedReadyUpdates,
  }
}

describe("checking never transfers a build", () => {
  test("a found update is offered, not downloaded", async () => {
    const { service, transfers } = createHarness({ check: { kind: "available", version: "1.1.0" } })

    const state = await service.check()

    expect(state.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(state.checkedAt).toBe(CHECKED_AT.toISOString())
    expect(state.releaseNotes).toEqual([RELEASE_NOTE])
    expect(transfers).toEqual([])
  })

  test("a failed check is reported with when it was attempted", async () => {
    const { service } = createHarness({ check: { kind: "failed" } })

    const state = await service.check()

    expect(state.activity).toEqual({ status: "idle" })
    expect(state.failure).toEqual({ stage: "check" })
    expect(state.checkedAt).toBe(CHECKED_AT.toISOString())
  })

  test("a failed re-check preserves an update that was already offered", async () => {
    const { service } = createHarness({
      checks: [{ kind: "available", version: "1.1.0" }, { kind: "failed" }],
    })
    await service.check()

    const state = await service.check()

    expect(state.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(state.failure).toEqual({ stage: "check" })
    expect(state.releaseNotes).toEqual([RELEASE_NOTE])
  })
})

describe("downloading only after the user asks", () => {
  test("downloads the offered build and publishes progress on the way", async () => {
    const { service, transfers, published } = createHarness({
      check: { kind: "available", version: "1.1.0" },
    })
    await service.check()

    const state = await service.download()

    expect(transfers).toEqual(["1.1.0"])
    expect(state.activity).toEqual({ status: "downloaded", version: "1.1.0" })
    expect(published.map((next) => next.activity)).toContainEqual({
      status: "downloading",
      version: "1.1.0",
      progress: { percent: 50, transferredBytes: 512, totalBytes: 1024 },
    })
  })

  test("does nothing when no build is offered", async () => {
    const { service, transfers } = createHarness({})

    const state = await service.download()

    expect(state.activity).toEqual({ status: "idle" })
    expect(transfers).toEqual([])
  })

  test("a failed download offers the same build again", async () => {
    const { service } = createHarness({
      check: { kind: "available", version: "1.1.0" },
      download: { kind: "failed" },
    })
    await service.check()

    const state = await service.download()

    expect(state.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(state.failure).toEqual({ stage: "download" })
  })

  test("rejects a downloaded build that differs from the accepted version", async () => {
    const { service } = createHarness({
      check: { kind: "available", version: "1.1.0" },
      download: { kind: "downloaded", version: "1.2.0" },
    })
    await service.check()

    const state = await service.download()

    expect(state.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(state.failure).toEqual({ stage: "download" })
  })

  test("does not replace the build behind an already queued download click", async () => {
    const recheckStarted = Promise.withResolvers<void>()
    const finishRecheck = Promise.withResolvers<void>()
    const { service, transfers } = createHarness({
      checks: [
        { kind: "available", version: "1.1.0" },
        { kind: "available", version: "1.2.0" },
      ],
      beforeCheck: async (call) => {
        if (call !== 1) return
        recheckStarted.resolve()
        await finishRecheck.promise
      },
    })
    await service.check()

    const recheck = service.check()
    await recheckStarted.promise
    const download = service.download()
    finishRecheck.resolve()
    await recheck
    const state = await download

    expect(transfers).toEqual([])
    expect(state.activity).toEqual({ status: "available", version: "1.2.0" })
  })
})

describe("published state ordering", () => {
  test("increments the revision for every published transition", async () => {
    const { service, published } = createHarness({
      check: { kind: "available", version: "1.1.0" },
    })

    await service.check()
    await service.download()

    expect(published.length).toBeGreaterThan(1)
    for (const [index, state] of published.entries()) {
      expect(state.revision).toBe((published[index - 1]?.revision ?? 0) + 1)
    }
  })
})

describe("installing", () => {
  test("installs only a downloaded build", async () => {
    const { service, installs } = createHarness({ check: { kind: "available", version: "1.1.0" } })
    await service.check()

    await service.install()
    expect(installs).toEqual([])

    await service.download()
    const state = await service.install()

    expect(installs).toEqual(["1.1.0"])
    expect(state.activity).toEqual({ status: "installing", version: "1.1.0" })
  })

  test("a failed install keeps the downloaded build ready to retry", async () => {
    const { service } = createHarness({
      check: { kind: "available", version: "1.1.0" },
      install: { kind: "failed" },
    })
    await service.check()
    await service.download()

    const state = await service.install()

    expect(state.activity).toEqual({ status: "downloaded", version: "1.1.0" })
    expect(state.failure).toEqual({ stage: "install" })
  })
})

describe("release ring", () => {
  test("persists the new ring, discards the old download, and checks the new ring", async () => {
    const { service, persistedRings, getCheckCalls, getDiscardedReadyUpdates } = createHarness({
      checks: [
        { kind: "available", version: "1.1.0" },
        { kind: "available", version: "1.2.0" },
      ],
    })
    await service.check()

    const state = await service.setRing("preview")

    expect(persistedRings).toEqual(["preview"])
    expect(getDiscardedReadyUpdates()).toBe(1)
    expect(getCheckCalls()).toBe(2)
    expect(state.ring).toBe("preview")
    expect(state.activity).toEqual({ status: "available", version: "1.2.0" })
    expect(state.releaseNotes).toEqual([RELEASE_NOTE])
  })
})

describe("background polling", () => {
  test("keeps looking after an update is offered or downloaded", async () => {
    const { service, scheduledRecurring, getCheckCalls } = createHarness({
      checks: [
        { kind: "available", version: "1.1.0" },
        { kind: "available", version: "1.2.0" },
        { kind: "available", version: "1.3.0" },
      ],
    })
    await service.check()
    service.startPolling()
    const poll = scheduledRecurring[0]
    expect(poll).toBeDefined()

    await poll?.()
    expect(service.getState().activity).toEqual({ status: "available", version: "1.2.0" })

    await service.download()
    expect(service.getState().activity).toEqual({ status: "downloaded", version: "1.2.0" })

    await poll?.()
    expect(service.getState().activity).toEqual({ status: "available", version: "1.3.0" })
    expect(getCheckCalls()).toBe(3)
  })
})

describe("unexpected dependency rejection", () => {
  test("turns rejected mechanics into retryable failed states", async () => {
    const checking = createHarness({ reject: "check" })
    expect((await checking.service.check()).failure).toEqual({ stage: "check" })
    expect(checking.unexpectedErrors).toEqual(["check"])

    const downloading = createHarness({
      check: { kind: "available", version: "1.1.0" },
      reject: "download",
    })
    await downloading.service.check()
    const downloadState = await downloading.service.download()
    expect(downloadState.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(downloadState.failure).toEqual({ stage: "download" })
    expect(downloading.unexpectedErrors).toEqual(["download"])

    const installing = createHarness({
      check: { kind: "available", version: "1.1.0" },
      reject: "install",
    })
    await installing.service.check()
    await installing.service.download()
    const installState = await installing.service.install()
    expect(installState.activity).toEqual({ status: "downloaded", version: "1.1.0" })
    expect(installState.failure).toEqual({ stage: "install" })
    expect(installing.unexpectedErrors).toEqual(["install"])
  })
})

describe("builds that cannot update themselves", () => {
  test("stay unsupported whatever is asked", async () => {
    const { service, transfers } = createHarness({
      supported: false,
      check: { kind: "available", version: "1.1.0" },
    })

    await service.check()
    const state = await service.download()

    expect(state.activity).toEqual({ status: "unsupported" })
    expect(transfers).toEqual([])
  })
})
