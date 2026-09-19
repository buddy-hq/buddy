const RECOVERY_WINDOW_MS = 30_000
const MAX_RECOVERY_ATTEMPTS = 3
const BASE_RECOVERY_DELAY_MS = 250

export type InAppBrowserCrashRecoveryState = {
  readonly attempts: number
  readonly windowStartedAt: number | null
}

export const INITIAL_IN_APP_BROWSER_CRASH_RECOVERY_STATE: InAppBrowserCrashRecoveryState = {
  attempts: 0,
  windowStartedAt: null,
}

export type InAppBrowserCrashRecoveryPlan =
  | {
      readonly _tag: "restart"
      readonly delayMs: number
      readonly state: InAppBrowserCrashRecoveryState
    }
  | { readonly _tag: "give-up" }

export function planInAppBrowserCrashRecovery(
  state: InAppBrowserCrashRecoveryState,
  now: number,
): InAppBrowserCrashRecoveryPlan {
  const startsNewWindow =
    state.windowStartedAt === null || now - state.windowStartedAt >= RECOVERY_WINDOW_MS
  const attempts = startsNewWindow ? 0 : state.attempts
  if (attempts >= MAX_RECOVERY_ATTEMPTS) return { _tag: "give-up" }
  return {
    _tag: "restart",
    delayMs: BASE_RECOVERY_DELAY_MS * 2 ** attempts,
    state: {
      attempts: attempts + 1,
      windowStartedAt: startsNewWindow ? now : state.windowStartedAt,
    },
  }
}
