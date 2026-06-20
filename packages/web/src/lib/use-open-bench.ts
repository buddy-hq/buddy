import { useMemo } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import {
  clearSuppressedBenchAutoOpen,
  readSuppressedBenchAutoOpenKey,
} from "@/lib/bench-auto-open-state"
import { guardBenchLeaveBeforeNavigation } from "./bench-leave-guard"
import { buildBenchNavigation, readBenchOpenPolicyStateFromLocation } from "./bench-route-adapter"
import {
  resolveBenchOpenPolicy,
  resolveBenchSurfaceDefaults,
  type BenchOpenDecision,
} from "./bench-open-policy-core"
import { readBenchPresentationPreferences } from "./bench-preferences"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  isSameBenchTarget,
  type BenchOpenRequest,
} from "./bench-targets"
import type { BenchLeaveOrigin } from "./bench-leave-guard"
import { useUiPreferences } from "@/state/ui-preferences"

type OpenBenchOptions = {
  origin: Exclude<BenchLeaveOrigin, "route">
}

type OpenBench = {
  (request: BenchOpenRequest, options?: OpenBenchOptions): Promise<BenchOpenDecision>
}

function activateDockedBenchWorkspace(directory: string) {
  useUiPreferences.getState().activateRightWorkspaceSurface(directory, "bench")
}

function useOpenBench(): OpenBench {
  const navigate = useNavigate()
  const location = useLocation()

  return useMemo(() => {
    async function open(
      request: BenchOpenRequest,
      options: OpenBenchOptions = { origin: "user" },
    ): Promise<BenchOpenDecision> {
      const defaults = resolveBenchSurfaceDefaults(request.target)
      const current = readBenchOpenPolicyStateFromLocation({
        directory: request.directory,
        pathname: location.pathname,
        search: location.search,
      })
      const currentVisible =
        current.status === "open" &&
        (current.mode === BENCH_CHAT_LAYOUT_FLOATING ||
          useUiPreferences.getState().rightSidebarOpen)
      const suppressedAutoOpenKey = request.autoOpen
        ? readSuppressedBenchAutoOpenKey(request.directory, request.autoOpen.policyID)
        : undefined
      const decision = resolveBenchOpenPolicy({
        request,
        current,
        currentVisible,
        defaults,
        preferences: readBenchPresentationPreferences(),
        autoOpenSuppressed:
          request.autoOpen !== null && request.autoOpen.eventKey === suppressedAutoOpenKey,
      })

      if (
        decision.action === "ignore" &&
        decision.policyID === "already-open" &&
        current.status === "open" &&
        current.mode === BENCH_CHAT_LAYOUT_DOCKED
      ) {
        activateDockedBenchWorkspace(request.directory)
      }

      if (decision.action === "open") {
        if (request.autoOpen && suppressedAutoOpenKey !== undefined) {
          clearSuppressedBenchAutoOpen(request.directory, request.autoOpen.policyID)
        }

        if (
          current.status === "open" &&
          (current.directory !== decision.directory ||
            !isSameBenchTarget(current.target, decision.target))
        ) {
          const guardResult = await guardBenchLeaveBeforeNavigation({
            directory: current.directory,
            intent: "replace-target",
            origin: request.autoOpen ? "auto-open" : options.origin,
            current: current.target,
            next: decision.target,
          })
          if (guardResult.status === "block") {
            return {
              action: "ignore",
              policyID: "leave-guard-blocked",
            }
          }
        }

        if (decision.mode === BENCH_CHAT_LAYOUT_DOCKED) {
          activateDockedBenchWorkspace(decision.directory)
        }

        await navigate(
          buildBenchNavigation({
            directory: decision.directory,
            target: decision.target,
            mode: decision.mode,
          }),
        )
      }

      return decision
    }

    return open
  }, [location.pathname, location.search, navigate])
}

export { useOpenBench }
export type { OpenBench, OpenBenchOptions }
