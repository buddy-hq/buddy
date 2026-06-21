import type { BenchTarget } from "./bench-targets"

type BenchLeaveIntent = "close" | "replace-target"

type BenchLeaveOrigin = "user" | "agent" | "auto-open" | "route"

type BenchLeaveGuardInput = {
  intent: BenchLeaveIntent
  origin: BenchLeaveOrigin
  current: BenchTarget
  next: BenchTarget | null
}

type BenchLeaveGuardResult =
  | { status: "allow" }
  | {
      status: "block"
      reason: "dirty" | "saving" | "conflict" | "save_error" | "sync_error"
      message: string
    }

function allowBenchLeave(): BenchLeaveGuardResult {
  return { status: "allow" }
}

export { allowBenchLeave }
export type { BenchLeaveGuardInput, BenchLeaveGuardResult, BenchLeaveOrigin }
