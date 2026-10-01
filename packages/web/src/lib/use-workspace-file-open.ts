import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { usePlatform } from "@/context/platform"
import { type ResourceReadingTarget, type ResourceViewStatus } from "@/state/resources-query"
import { fileExtensionFromPath, fileNameFromPath } from "./workspace-file-paths"
import {
  findProcessedResourceByPath,
  processedResourcesQueryOptions,
} from "@/state/resources-query"
import {
  resolveWorkspaceFileOpenPlan,
  WORKSPACE_FILE_OPEN_TARGET_COPY_PATH,
  WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP,
  WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH,
  WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH,
  WORKSPACE_FILE_OPEN_TARGET_READING,
  WORKSPACE_FILE_OPEN_TARGET_REVEAL,
  type WorkspaceFileOpenInput,
  type WorkspaceFileOpenPlan,
  type WorkspaceFileOpenTarget,
} from "./workspace-file-open"
import {
  BENCH_MODE_REQUEST_POLICY,
  BENCH_WORKSPACE_ROOT_NOTEBOOK,
  useOpenBench,
  type BenchModeRequest,
  type OpenBenchResult,
} from "@/lib/bench-navigation"
import {
  grantWorkspaceFileLargeOpenApproval,
  revokeWorkspaceFileLargeOpenApproval,
  useWorkspaceFileOpenDialogStore,
} from "@/state/workspace-file-open-dialog-store"

export type WorkspaceResourceOpener = (
  directory: string,
  resource: ResourceReadingTarget,
) => Promise<OpenBenchResult> | void

export type WorkspaceFileActionInput = Omit<WorkspaceFileOpenInput, "canOpenReading"> & {
  name?: string
  objectID?: string
  resourceStatus?: ResourceViewStatus
}

export type WorkspaceFileOpenOptions = {
  benchMode?: BenchModeRequest
}

export function useWorkspaceFileOpen(
  directory: string | undefined,
  onOpenResource?: WorkspaceResourceOpener,
  options?: WorkspaceFileOpenOptions,
) {
  const openBenchRoute = useOpenBench()
  const queryClient = useQueryClient()
  const platform = usePlatform()
  const benchMode = options?.benchMode ?? BENCH_MODE_REQUEST_POLICY

  const resolvePlan = useCallback(
    (input: WorkspaceFileActionInput): WorkspaceFileOpenPlan =>
      resolveWorkspaceFileOpenPlan({
        ...input,
        canOpenReading: !!directory && !!onOpenResource,
      }),
    [directory, onOpenResource],
  )

  const executeTarget = useCallback(
    async (input: WorkspaceFileActionInput, target: WorkspaceFileOpenTarget) => {
      if (target === WORKSPACE_FILE_OPEN_TARGET_COPY_PATH) {
        await navigator.clipboard.writeText(input.absolutePath ?? input.path)
        return
      }
      if (!directory) return

      if (target === WORKSPACE_FILE_OPEN_TARGET_READING) {
        return onOpenResource?.(
          directory,
          Object.assign(
            {
              path: input.path,
              name: input.name ?? fileNameFromPath(input.path),
            },
            input.objectID ? { objectID: input.objectID } : undefined,
            input.resourceStatus ? { status: input.resourceStatus } : undefined,
          ),
        )
      }

      if (target === WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH) {
        return openBenchRoute({
          directory,
          target: {
            type: "workspace-file",
            root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
            path: input.path,
            viewer: "file",
          },
          mode: benchMode,
          autoOpen: null,
        })
      }

      if (target === WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH) {
        return openBenchRoute({
          directory,
          target: {
            type: "workspace-file",
            root: BENCH_WORKSPACE_ROOT_NOTEBOOK,
            path: input.path,
            viewer: "markdown",
          },
          mode: benchMode,
          autoOpen: null,
        })
      }

      if (target === WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP) {
        if (!input.absolutePath || !platform.openPath) return
        await platform.openPath(input.absolutePath)
        return
      }

      if (target === WORKSPACE_FILE_OPEN_TARGET_REVEAL) {
        if (!input.absolutePath || !platform.revealPath) return
        await platform.revealPath(input.absolutePath)
      }
    },
    [benchMode, directory, onOpenResource, openBenchRoute, platform],
  )

  const executePrimary = useCallback(
    async (input: WorkspaceFileActionInput): Promise<boolean> => {
      let resolvedInput = input
      const extension = fileExtensionFromPath(input.path)
      if (
        directory &&
        onOpenResource &&
        !input.objectID &&
        (extension === "pdf" || extension === "epub")
      ) {
        try {
          const records = await queryClient.fetchQuery({
            ...processedResourcesQueryOptions(directory),
            staleTime: 0,
          })
          const processed = findProcessedResourceByPath(records, input.path)
          if (processed) {
            resolvedInput = {
              ...input,
              objectID: processed.objectID,
              resourceStatus: processed.status,
            }
          }
        } catch {
          // The reader can still open the source file when its catalog is unavailable.
        }
      }
      const plan = resolvePlan(resolvedInput)
      const target = plan.primaryTarget
      if (!target) return false
      if (plan.requiresLargeFileApproval && resolvedInput.sizeBytes !== undefined) {
        const choice = await useWorkspaceFileOpenDialogStore.getState().requestApproval({
          path: resolvedInput.path,
          sizeBytes: resolvedInput.sizeBytes,
          canOpenDefaultApp: plan.targets.includes(WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP),
        })
        if (choice === "cancel") return false
        if (choice === "default-app") {
          await executeTarget(resolvedInput, WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP)
          return true
        }

        if (!directory) return false
        grantWorkspaceFileLargeOpenApproval(directory, resolvedInput.path)
        const result = await executeTarget(resolvedInput, target)
        if (result && result.outcome !== "committed") {
          revokeWorkspaceFileLargeOpenApproval(directory, resolvedInput.path)
        }
        return result === undefined || result.outcome === "committed"
      }

      const result = await executeTarget(resolvedInput, target)
      return result === undefined || result.outcome === "committed"
    },
    [directory, executeTarget, onOpenResource, queryClient, resolvePlan],
  )

  return {
    resolvePlan,
    executeTarget,
    executePrimary,
  }
}
