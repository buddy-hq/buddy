import { createContext } from "react"
import type { BenchLeaveGuardInput, BenchLeaveGuardResult } from "@/lib/bench-leave-guard"
import type {
  BenchLayoutProfileID,
  BenchMode,
  BenchRect,
  BenchTarget,
} from "@/lib/bench-navigation"
import type {
  BenchSurfaceSnapshot,
  BenchSurfaceSynchronizationReason,
  BenchSurfaceSynchronizationResult,
} from "@/lib/directory-workspace-lifecycle"

export type BenchSetModeRequest = {
  mode: BenchMode
  origin: "user" | "agent"
}

export type BenchFloatingChatState = "open" | "minimized"

export type BenchRuntimeState = {
  directory: string
  target: BenchTarget
  route: string
  mode: BenchMode
  layoutProfile: BenchLayoutProfileID
  floatingRect: BenchRect
  floatingChatState: BenchFloatingChatState
}

export type BenchRouteContextValue = {
  state: BenchRuntimeState
  setMode(input: BenchSetModeRequest): void
  setFloatingChatState(input: { state: BenchFloatingChatState; origin: "user" }): void
  registerSurface(input: {
    target: BenchTarget
    getSnapshot: () => BenchSurfaceSnapshot
    subscribe: (listener: () => void) => () => void
    synchronize?: (
      reason: BenchSurfaceSynchronizationReason,
    ) => Promise<BenchSurfaceSynchronizationResult>
    leaveGuard?: (
      input: BenchLeaveGuardInput,
    ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
  }): () => void
  flushContext(input: { sessionID: string }): Promise<void>
  publishCurrent(): Promise<void>
}

/** Keep the context identity stable when the provider implementation is hot reloaded. */
export const BenchRouteContext = createContext<BenchRouteContextValue | undefined>(undefined)
