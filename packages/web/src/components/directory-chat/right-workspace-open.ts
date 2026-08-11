import { useCallback } from "react"
import { toast } from "@buddy/ui"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  useOpenBench,
  type BenchModeRequest,
  type BenchTarget,
  type OpenBenchResult,
} from "@/lib/bench-navigation"
import { useOpenReadingResource } from "@/lib/use-open-reading-resource"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import type { NotebookSearchResult } from "@/state/notebook-search"
import type { ResourceReadingTarget } from "@/state/resources-query"

export type RightWorkspaceResourceTarget = ResourceReadingTarget

export type RightWorkspaceOpenOutcome = "opened" | "focused" | "blocked" | "failed"

export type RightWorkspaceOpenRequest =
  | { type: "object"; directory: string; target: BenchTarget }
  | {
      type: "resource"
      directory: string
      resource: RightWorkspaceResourceTarget
    }

export type RightWorkspaceOpener = (
  request: RightWorkspaceOpenRequest,
) => Promise<RightWorkspaceOpenOutcome>

export type RightWorkspaceOpenOptions = {
  /**
   * How the chat sits around the opened target. Defaults to docked, which is
   * what a drawer wants — a drawer is only reachable in docked mode. A surface
   * that also exists in immersive mode, like the tab strip, passes the policy
   * request so opening keeps whichever mode Bench is already in.
   */
  mode?: BenchModeRequest
}

type RightWorkspaceOpenResolution =
  | Pick<Extract<OpenBenchResult, { outcome: "committed" }>, "outcome" | "decision">
  | Pick<Exclude<OpenBenchResult, { outcome: "committed" }>, "outcome">

/**
 * Whether the open reached the Bench. The surface that started it — a drawer, a
 * picker — dismisses itself only on these, so a blocked or failed open leaves
 * the user their query and somewhere to retry from.
 */
export function rightWorkspaceOpenSettled(outcome: RightWorkspaceOpenOutcome): boolean {
  return outcome === "opened" || outcome === "focused"
}

export function resolveRightWorkspaceOpenOutcome(
  openResult: RightWorkspaceOpenResolution | void,
): RightWorkspaceOpenOutcome {
  if (!openResult) return "failed"
  if (openResult.outcome === "blocked") return "blocked"
  if (openResult.outcome !== "committed") return "failed"
  if (openResult.decision.action === "ignore" && openResult.decision.policyID === "already-open") {
    return "focused"
  }
  return "opened"
}

/**
 * The one way a workspace surface opens something on the Bench. Sources take the
 * reader path so they resume where the learner left off; everything else is a
 * plain docked open. Failures surface as a toast rather than a silent no-op.
 */
export function useRightWorkspaceOpen(options?: RightWorkspaceOpenOptions): RightWorkspaceOpener {
  const mode = options?.mode ?? BENCH_CHAT_LAYOUT_DOCKED
  const openBench = useOpenBench()
  const openReadingResource = useOpenReadingResource({ mode })

  return useCallback(
    async (request: RightWorkspaceOpenRequest) => {
      try {
        if (request.type === "resource") {
          return resolveRightWorkspaceOpenOutcome(
            await openReadingResource(request.directory, request.resource),
          )
        }

        return resolveRightWorkspaceOpenOutcome(
          await openBench({
            directory: request.directory,
            target: request.target,
            mode,
            autoOpen: null,
          }),
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return "failed"
      }
    },
    [mode, openBench, openReadingResource],
  )
}

/**
 * A search result as an open request. Chats are not Bench targets, so they come
 * back as `null` and the caller decides whether it can select one at all.
 */
export function notebookSearchOpenRequest(input: {
  result: NotebookSearchResult
  directory: string
}): RightWorkspaceOpenRequest | null {
  const { target } = input.result

  if (target.type === "thread") return null

  if (target.type === "resource") {
    return {
      type: "resource",
      directory: input.directory,
      resource: {
        path: target.path,
        name: target.name,
        ...(target.objectID ? { objectID: target.objectID } : {}),
        ...(target.status ? { status: target.status } : {}),
      },
    }
  }

  if (target.type === "object") {
    return {
      type: "object",
      directory: input.directory,
      target: createBenchObjectTarget(target.kind, target.objectID),
    }
  }

  return {
    type: "object",
    directory: input.directory,
    target: { type: "workspace-file", path: target.path, viewer: target.viewer },
  }
}
