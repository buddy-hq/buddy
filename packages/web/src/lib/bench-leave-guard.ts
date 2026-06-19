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

type BenchLeaveGuardRegistration = {
  directory: string
  guard(input: BenchLeaveGuardInput): Promise<BenchLeaveGuardResult> | BenchLeaveGuardResult
}

const benchLeaveGuardRegistrations = new Map<string, BenchLeaveGuardRegistration>()

function allowBenchLeave(): BenchLeaveGuardResult {
  return { status: "allow" }
}

function registerBenchLeaveGuard(input: BenchLeaveGuardRegistration): () => void {
  benchLeaveGuardRegistrations.set(input.directory, input)
  return () => {
    if (benchLeaveGuardRegistrations.get(input.directory) === input) {
      benchLeaveGuardRegistrations.delete(input.directory)
    }
  }
}

async function guardBenchLeaveBeforeNavigation(input: {
  directory: string
  intent: BenchLeaveIntent
  origin: BenchLeaveOrigin
  current: BenchTarget
  next: BenchTarget | null
}): Promise<BenchLeaveGuardResult> {
  const registration = benchLeaveGuardRegistrations.get(input.directory)
  if (!registration) return allowBenchLeave()
  return registration.guard({
    intent: input.intent,
    origin: input.origin,
    current: input.current,
    next: input.next,
  })
}

export { allowBenchLeave, guardBenchLeaveBeforeNavigation, registerBenchLeaveGuard }
export type { BenchLeaveGuardInput, BenchLeaveGuardResult, BenchLeaveOrigin }
