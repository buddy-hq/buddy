import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useDirectoryWorkspaceOptional } from "@/components/directory-chat/directory-workspace-context"
import { usePlatform } from "@/context/platform"
import { canonicalProjectDirectory } from "@/lib/project-directory"
import {
  findProcessedResourceByPath,
  processedResourcesQueryOptions,
  type ResourceReadingTarget,
  type ResourceViewStatus,
} from "@/state/resources-query"
import {
  fileExtensionFromPath,
  fileNameFromPath,
  normalizeRelativePath,
} from "./workspace-file-paths"
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
  BENCH_WORKSPACE_ROOT_NOTES,
  useOpenBench,
  type BenchModeRequest,
  type BenchTabTarget,
  type OpenBenchResult,
} from "@/lib/bench-navigation"
import { BENCH_ROUTE_STATUS_OPEN } from "@/state/directory-workspace-store"
import {
  grantWorkspaceFileLargeOpenApproval,
  hasWorkspaceFileLargeOpenSessionApproval,
  releaseWorkspaceFileLargeOpenHandoff,
  revokeWorkspaceFileLargeOpenApproval,
  useWorkspaceFileOpenDialogStore,
} from "@/state/workspace-file-open-dialog-store"

function benchTargetsForDirectory(
  workspace: ReturnType<typeof useDirectoryWorkspaceOptional>,
  directory: string | undefined,
): readonly BenchTabTarget[] {
  if (!directory || !workspace) return []
  const requestedDirectory = canonicalProjectDirectory(directory)
  if (
    !requestedDirectory ||
    canonicalProjectDirectory(workspace.directory) !== requestedDirectory
  ) {
    return []
  }
  const targets: BenchTabTarget[] = []
  for (const slot of Object.values(workspace.store.getState().slots)) {
    if (!slot) continue
    for (const tab of slot.tabs) targets.push(tab.target)
    if (slot.route.status === BENCH_ROUTE_STATUS_OPEN) targets.push(slot.route.target)
  }
  return targets
}

function isWorkspaceFileAlreadyOpen(input: {
  readonly path: string
  readonly objectID: string | undefined
  readonly targets: readonly BenchTabTarget[]
}): boolean {
  const path = normalizeRelativePath(input.path)
  if (!path && !input.objectID) return false
  for (const target of input.targets) {
    if (
      path &&
      target.type === "workspace-file" &&
      target.root !== BENCH_WORKSPACE_ROOT_NOTES &&
      normalizeRelativePath(target.path) === path
    ) {
      return true
    }
    if (
      input.objectID &&
      target.type === "object" &&
      target.ref.kind === "resource" &&
      target.ref.objectID === input.objectID
    ) {
      return true
    }
  }
  return false
}

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
  const workspace = useDirectoryWorkspaceOptional()
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
      const sessionApproved =
        directory !== undefined &&
        hasWorkspaceFileLargeOpenSessionApproval(directory, resolvedInput.path)
      const alreadyOpen = isWorkspaceFileAlreadyOpen({
        path: resolvedInput.path,
        objectID: resolvedInput.objectID,
        targets: benchTargetsForDirectory(workspace, directory),
      })
      if (
        plan.requiresLargeFileApproval &&
        resolvedInput.sizeBytes !== undefined &&
        !sessionApproved &&
        !alreadyOpen
      ) {
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

      if (directory && sessionApproved) {
        grantWorkspaceFileLargeOpenApproval(directory, resolvedInput.path)
      }
      const result = await executeTarget(resolvedInput, target)
      if (result && result.outcome !== "committed" && directory && sessionApproved) {
        releaseWorkspaceFileLargeOpenHandoff(directory, resolvedInput.path)
      }
      return result === undefined || result.outcome === "committed"
    },
    [directory, executeTarget, onOpenResource, queryClient, resolvePlan, workspace],
  )

  return {
    resolvePlan,
    executeTarget,
    executePrimary,
  }
}
