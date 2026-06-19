import { useCallback } from "react"
import { usePlatform } from "@/context/platform"
import {
  RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT,
  type ResourceOpenOptions,
  type ResourceReadingTarget,
  type ResourceViewStatus,
} from "@/state/resources-query"
import { fileNameFromPath } from "./workspace-file-paths"
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
  useOpenBench,
  type BenchModeRequest,
} from "@/lib/bench-navigation"
import type { BenchOpenDecision } from "@/lib/bench-open-policy-core"
import {
  grantWorkspaceFileLargeOpenApproval,
  revokeWorkspaceFileLargeOpenApproval,
  useWorkspaceFileOpenDialogStore,
} from "@/state/workspace-file-open-dialog-store"

export type WorkspaceResourceOpener = (
  directory: string,
  resource: ResourceReadingTarget,
  options?: ResourceOpenOptions,
) => Promise<BenchOpenDecision> | void

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
          {
            path: input.path,
            name: input.name ?? fileNameFromPath(input.path),
            ...(input.objectID ? { objectID: input.objectID } : {}),
            ...(input.resourceStatus ? { status: input.resourceStatus } : {}),
          },
          {
            sessionPreference: RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT,
          },
        )
        return
      }

      if (target === WORKSPACE_FILE_OPEN_TARGET_FILE_BENCH) {
        return openBenchRoute({
          directory,
          target: { type: "workspace-file", path: input.path, viewer: "file" },
          mode: benchMode,
          autoOpen: null,
        })
        return
      }

      if (target === WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH) {
        return openBenchRoute({
          directory,
          target: { type: "workspace-file", path: input.path, viewer: "markdown" },
          mode: benchMode,
          autoOpen: null,
        })
        return
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
      const plan = resolvePlan(input)
      const target = plan.primaryTarget
      if (!target) return false
      if (plan.requiresLargeFileApproval && typeof input.sizeBytes === "number") {
        const choice = await useWorkspaceFileOpenDialogStore.getState().requestApproval({
          path: input.path,
          sizeBytes: input.sizeBytes,
          canOpenDefaultApp: plan.targets.includes(WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP),
        })
        if (choice === "cancel") return false
        if (choice === "default-app") {
          await executeTarget(input, WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP)
          return true
        }

        if (!directory) return false
        grantWorkspaceFileLargeOpenApproval(directory, input.path)
        const result = await executeTarget(input, target)
        if (result?.action !== "open") {
          revokeWorkspaceFileLargeOpenApproval(directory, input.path)
        }
        return result?.action === "open" || result?.policyID === "already-open"
      }

      const result = await executeTarget(input, target)
      return (
        result?.action === "open" || result?.policyID === "already-open" || result === undefined
      )
    },
    [directory, executeTarget, resolvePlan],
  )

  return {
    resolvePlan,
    executeTarget,
    executePrimary,
  }
}
