import { describe, expect, test } from "bun:test"
import {
  INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE,
  planInAppBrowserCrashRecovery,
  type InAppBrowserCrashRecoveryState,
} from "../src/lib/in-app-browser-crash-recovery"

function restartState(state: InAppBrowserCrashRecoveryState, now: number) {
  const plan = planInAppBrowserCrashRecovery(state, now)
  if (plan["_tag"] !== "restart") throw new Error("Expected a restart.")
  return plan
}

describe("Browser crash recovery", () => {
  test("backs off, then stops restarting a page that keeps crashing", () => {
    const first = restartState(INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE, 1_000)
    const second = restartState(first.state, 2_000)
    const third = restartState(second.state, 3_000)

    expect([first.delayMs, second.delayMs, third.delayMs]).toEqual([250, 500, 1_000])
    expect(planInAppBrowserCrashRecovery(third.state, 4_000)).toEqual({ _tag: "give-up" })
  })

  test("starts over once the crashes are far enough apart", () => {
    const first = restartState(INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE, 0)
    const second = restartState(first.state, 1_000)
    const third = restartState(second.state, 2_000)

    const later = restartState(third.state, 31_000)
    expect(later.delayMs).toBe(250)
    expect(later.state).toEqual({ attempts: 1, windowStartedAt: 31_000 })
  })
})
