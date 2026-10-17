import type { UpdateState } from "@buddy/update-contract"
import { afterEach, describe, expect, test } from "bun:test"
import { checkForUpdate, getUpdateState } from "../src/renderer/updater"

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
  else Reflect.deleteProperty(globalThis, "window")
})

function configureWindow(distribution?: "beta", updaterEnabled = true): void {
  const globals = distribution ? { updaterEnabled, distribution } : { updaterEnabled }
  Reflect.set(globalThis, "window", {
    __BUDDY__: globals,
    api: {
      getAppVersion: () => "1.0.0",
      getUpdateState: async () => {
        throw new Error("IPC unavailable")
      },
      checkUpdate: async () => {
        throw new Error("IPC unavailable")
      },
    },
  })
}

describe("renderer updater fallback", () => {
  test("retains Beta identity and fixed ring after snapshot and command failures", async () => {
    configureWindow("beta")
    const expected: UpdateState = {
      distribution: "beta",
      revision: 0,
      ring: "preview",
      currentVersion: "1.0.0",
      activity: { status: "unsupported" },
      releaseNotes: [],
    }
    expect(await getUpdateState()).toEqual(expected)
    expect(await checkForUpdate()).toEqual(expected)
    configureWindow("beta", false)
    expect(await getUpdateState()).toEqual(expected)
  })

  test("leaves the prod fallback shape unchanged", async () => {
    configureWindow()
    expect(await getUpdateState()).toEqual({
      revision: 0,
      ring: "stable",
      currentVersion: "1.0.0",
      activity: { status: "unsupported" },
      releaseNotes: [],
    })
  })
})
