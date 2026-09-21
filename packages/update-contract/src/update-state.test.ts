import { describe, expect, test } from "bun:test"
import {
  beginCheck,
  beginDownload,
  completeCheckAvailable,
  completeCheckUpToDate,
  completeDownload,
  createUpdateState,
  failCheck,
  failDownload,
  failInstall,
  isUpdateBusy,
  pendingUpdateVersion,
  reportDownloadProgress,
  resolveUpdateAction,
  selectRing,
  supersedesUpdateState,
  type UpdateState,
} from "./update-state"

const CHECKED_AT = "2026-09-21T10:00:00.000Z"
const LATER = "2026-09-21T11:00:00.000Z"

function idleState(): UpdateState {
  return createUpdateState({ currentVersion: "1.0.0", ring: "stable", supported: true })
}

function downloadedState(): UpdateState {
  const available = completeCheckAvailable(idleState(), {
    version: "1.1.0",
    checkedAt: CHECKED_AT,
  })
  return completeDownload(beginDownload(available, { version: "1.1.0" }), { version: "1.1.0" })
}

describe("a downloaded update remains usable until an authoritative check replaces it", () => {
  test("a failed check keeps the install offered", () => {
    const state = failCheck(downloadedState(), { checkedAt: LATER })

    expect(state.activity).toEqual({ status: "downloaded", version: "1.1.0" })
    expect(state.failure).toEqual({ stage: "check" })
    expect(resolveUpdateAction(state)).toBe("install")
  })

  test("a check reporting no newer build withdraws the install offer", () => {
    const state = completeCheckUpToDate(downloadedState(), { checkedAt: LATER })

    expect(state.activity).toEqual({ status: "up-to-date" })
    expect(resolveUpdateAction(state)).toBe("check")
  })

  test("starting a check does not replace the install offer with a spinner", () => {
    const state = beginCheck(downloadedState())

    expect(state.activity).toEqual({ status: "downloaded", version: "1.1.0" })
    expect(isUpdateBusy(state)).toBe(false)
  })

  test("a failed install leaves the downloaded build ready to retry", () => {
    const state = failInstall(downloadedState())

    expect(state.activity).toEqual({ status: "downloaded", version: "1.1.0" })
    expect(state.failure).toEqual({ stage: "install" })
    expect(resolveUpdateAction(state)).toBe("install")
  })
})

describe("an offered update remains usable when a re-check fails", () => {
  test("keeps the download offer and its release notes", () => {
    const releaseNotes = [
      {
        version: "1.1.0",
        url: "https://example.com/releases/v1.1.0",
        items: ["Faster updates"],
        totalItems: 1,
      },
    ]
    const available = completeCheckAvailable(idleState(), {
      version: "1.1.0",
      checkedAt: CHECKED_AT,
      releaseNotes,
    })

    const checking = beginCheck(available)
    const failed = failCheck(checking, { checkedAt: LATER })

    expect(checking.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(failed.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(failed.releaseNotes).toEqual(releaseNotes)
    expect(failed.failure).toEqual({ stage: "check" })
    expect(resolveUpdateAction(failed)).toBe("download")
  })
})

describe("the control offers one action per state", () => {
  test("an idle installation checks", () => {
    expect(resolveUpdateAction(idleState())).toBe("check")
  })

  test("an offered update downloads rather than downloading itself", () => {
    const state = completeCheckAvailable(idleState(), { version: "1.1.0", checkedAt: CHECKED_AT })

    expect(state.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(resolveUpdateAction(state)).toBe("download")
  })

  test("a failed download offers the same download again", () => {
    const available = completeCheckAvailable(idleState(), {
      version: "1.1.0",
      checkedAt: CHECKED_AT,
    })
    const state = failDownload(beginDownload(available, { version: "1.1.0" }))

    expect(state.activity).toEqual({ status: "available", version: "1.1.0" })
    expect(state.failure).toEqual({ stage: "download" })
    expect(resolveUpdateAction(state)).toBe("download")
  })

  test("a build that cannot update itself offers nothing", () => {
    const state = createUpdateState({
      currentVersion: "1.0.0",
      ring: "stable",
      supported: false,
    })

    expect(resolveUpdateAction(state)).toBe("none")
    expect(beginCheck(state)).toBe(state)
  })

  test("an in-flight step is inert", () => {
    const available = completeCheckAvailable(idleState(), {
      version: "1.1.0",
      checkedAt: CHECKED_AT,
    })
    const state = beginDownload(available, { version: "1.1.0" })

    expect(resolveUpdateAction(state)).toBe("none")
    expect(isUpdateBusy(state)).toBe(true)
  })
})

describe("download progress", () => {
  test("clamps readings that overshoot", () => {
    const available = completeCheckAvailable(idleState(), {
      version: "1.1.0",
      checkedAt: CHECKED_AT,
    })
    const state = reportDownloadProgress(beginDownload(available, { version: "1.1.0" }), {
      percent: 140,
      transferredBytes: 900,
    })

    expect(state.activity).toEqual({
      status: "downloading",
      version: "1.1.0",
      progress: { percent: 100, transferredBytes: 900 },
    })
  })

  test("is ignored once the transfer is no longer in flight", () => {
    const state = reportDownloadProgress(downloadedState(), { percent: 40 })

    expect(state.activity).toEqual({ status: "downloaded", version: "1.1.0" })
  })
})

describe("switching release ring", () => {
  test("drops an update offered by the ring the user left", () => {
    const state = selectRing(downloadedState(), "preview")

    expect(state.ring).toBe("preview")
    expect(state.activity).toEqual({ status: "idle" })
    expect(pendingUpdateVersion(state)).toBeUndefined()
    expect(state.checkedAt).toBeUndefined()
  })
})

describe("published state ordering", () => {
  test("accepts only a strictly newer revision", () => {
    const current = { ...idleState(), revision: 4 }

    expect(supersedesUpdateState({ ...current, revision: 5 }, current)).toBe(true)
    expect(supersedesUpdateState({ ...current, revision: 4 }, current)).toBe(false)
    expect(supersedesUpdateState({ ...current, revision: 3 }, current)).toBe(false)
  })

  test("accepts the initial owner snapshot even at revision zero", () => {
    expect(supersedesUpdateState(idleState(), undefined)).toBe(true)
  })
})
