import { BUDDY_ENV } from "../storage/constants"
import { AGENT_RUNTIME_INFO } from "./runtime-info"

export type RuntimeUpgradeState =
  | { readonly state: "idle" | "copying" | "migrating" | "ready" }
  | { readonly state: "failed"; readonly error: string }

export type RuntimeV1ImportStatus =
  | { readonly status: "required" | "completed" }
  | { readonly status: "running"; readonly progress: { readonly label: string; readonly numerator?: number; readonly denominator?: number } }
  | { readonly status: "error"; readonly error: string }

export type RuntimeV1ImportReport = {
  readonly status: RuntimeV1ImportStatus | undefined
  readonly importRan: boolean
  readonly skipped: readonly { readonly id: string; readonly at: number; readonly error: string }[]
  readonly content: readonly {
    readonly sessionID: string
    readonly subtaskPrompts: number
    readonly subtaskResults: number
    readonly assistantFiles: number
  }[]
}

let current: RuntimeUpgradeState = { state: "idle" }
const listeners = new Set<() => void>()

export function runtimeUpgradeState(): RuntimeUpgradeState {
  return current
}

export function reportRuntimeUpgrade(next: RuntimeUpgradeState) {
  if (current.state === "failed" && next.state !== "ready" && next.state !== "failed") return
  current = next
  for (const listener of listeners) listener()
}

export function runtimeUpgradeAnswersHealth(state: RuntimeUpgradeState = current): boolean {
  return state.state === "copying" || state.state === "migrating" || state.state === "failed"
}

export type RuntimeUpgradeWait = {
  readonly upgrading: Promise<void>
  readonly cancel: () => void
}

function ignore() {}

export function waitForRuntimeUpgrade(): RuntimeUpgradeWait {
  if (runtimeUpgradeAnswersHealth()) return { upgrading: Promise.resolve(), cancel: ignore }
  const upgrading = Promise.withResolvers<void>()
  const listener = () => {
    if (!runtimeUpgradeAnswersHealth()) return
    listeners.delete(listener)
    upgrading.resolve()
  }
  listeners.add(listener)
  return { upgrading: upgrading.promise, cancel: () => listeners.delete(listener) }
}

export const RUNTIME_UPGRADE_VERSION = AGENT_RUNTIME_INFO.version

export function runtimeUpgradeSeedPauseMs(environment: Readonly<Record<string, string | undefined>> = process.env): number | undefined {
  const value = Number(environment[BUDDY_ENV.TEST_V2_SEED_PAUSE_MS])
  return Number.isFinite(value) && value > 0 ? value : undefined
}
