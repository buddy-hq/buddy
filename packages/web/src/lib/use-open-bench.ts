import { useMemo } from "react"
import { toast } from "@buddy/ui"
import { prepareFlashcardBenchOpen } from "@/components/flashcard/flashcard-bench-target"
import { useDirectoryWorkspaceOptional } from "@/components/directory-chat/directory-workspace-context"
import type { DirectoryWorkspaceOpenResult } from "./directory-workspace-controller"
import { type BenchOpenRequest } from "./bench-targets"
import type { BenchLeaveOrigin } from "./bench-leave-guard"
import {
  BENCH_ROUTE_STATUS_CLOSED,
  DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  createCollapsedWorkspaceState,
  effectiveWorkspaceProjection,
} from "@/state/directory-workspace-store"

type OpenBenchOptions = {
  origin: Exclude<BenchLeaveOrigin, "route">
}

type OpenBench = {
  (request: BenchOpenRequest, options?: OpenBenchOptions): Promise<DirectoryWorkspaceOpenResult>
}

const NO_WORKSPACE_OPEN_PROJECTION = effectiveWorkspaceProjection(
  { status: BENCH_ROUTE_STATUS_CLOSED },
  {
    docked: createCollapsedWorkspaceState(),
    lastDrawer: DIRECTORY_WORKSPACE_DEFAULT_LAST_DRAWER,
  },
  null,
)

function useOpenBench(): OpenBench {
  const workspace = useDirectoryWorkspaceOptional()

  return useMemo(() => {
    async function open(
      request: BenchOpenRequest,
      options: OpenBenchOptions = { origin: "user" },
    ): Promise<DirectoryWorkspaceOpenResult> {
      if (!workspace) {
        return {
          outcome: "inactive",
          reason: "session_inactive",
          projection: NO_WORKSPACE_OPEN_PROJECTION,
        }
      }
      if (
        !request.autoOpen &&
        options.origin === "user" &&
        request.target.type === "object" &&
        request.target.ref.kind === "flashcard-deck"
      ) {
        const result = await prepareFlashcardBenchOpen({
          directory: request.directory,
          target: request.target,
        })
        if (result.status === "error") toast.error(result.error.message)
      }
      return workspace.controller.executeOpen(request, {
        origin: request.autoOpen ? "auto-open" : options.origin,
        autoOpen: request.autoOpen,
      })
    }

    return open
  }, [workspace])
}

export { useOpenBench }
export type { DirectoryWorkspaceOpenResult as OpenBenchResult, OpenBench, OpenBenchOptions }
