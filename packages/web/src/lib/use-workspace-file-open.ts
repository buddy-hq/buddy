import { useCallback } from "react"
import { useLocation } from "@tanstack/react-router"
import { usePlatform } from "@/context/platform"
import {
  RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT,
  type ResourceOpenOptions,
  type ResourceReadingTarget,
  type ResourceViewStatus,
} from "@/state/resources-query"
import { useWorkspaceFilePanelStore } from "@/state/workspace-file-panel-store"
import { fileNameFromPath } from "./workspace-file-paths"
import {
  resolveWorkspaceFileOpenPlan,
  WORKSPACE_FILE_OPEN_TARGET_COPY_PATH,
  WORKSPACE_FILE_OPEN_TARGET_DEFAULT_APP,
  WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH,
  WORKSPACE_FILE_OPEN_TARGET_PANEL,
  WORKSPACE_FILE_OPEN_TARGET_READING,
  WORKSPACE_FILE_OPEN_TARGET_REVEAL,
  type WorkspaceFileOpenInput,
  type WorkspaceFileOpenPlan,
  type WorkspaceFileOpenTarget,
} from "./workspace-file-open"
import {
  BENCH_MODE_REQUEST_POLICY,
  isBenchRoutePathname,
  useOpenBench,
} from "@/lib/bench-navigation"

export type WorkspaceResourceOpener = (
  directory: string,
  resource: ResourceReadingTarget,
  options?: ResourceOpenOptions,
) => void

export type WorkspaceFileActionInput = Omit<WorkspaceFileOpenInput, "canOpenReading"> & {
  name?: string
  resourceID?: string
  resourceStatus?: ResourceViewStatus
}

export function useWorkspaceFileOpen(
  directory: string | undefined,
  onOpenResource?: WorkspaceResourceOpener,
) {
  const location = useLocation()
  const openBenchRoute = useOpenBench()
  const platform = usePlatform()
  const queueFileOpen = useWorkspaceFilePanelStore((state) => state.queueFileOpen)

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
        onOpenResource?.(
          directory,
          {
            path: input.path,
            name: input.name ?? fileNameFromPath(input.path),
            ...(input.resourceID ? { resourceID: input.resourceID } : {}),
            ...(input.resourceStatus ? { status: input.resourceStatus } : {}),
          },
          {
            sessionPreference: RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT,
          },
        )
        return
      }

      if (target === WORKSPACE_FILE_OPEN_TARGET_PANEL) {
        if (isBenchRoutePathname(location.pathname)) {
          await openBenchRoute({
            directory,
            target: { type: "file", path: input.path },
            mode: BENCH_MODE_REQUEST_POLICY,
            autoOpen: null,
          })
          return
        }

        queueFileOpen(
          directory,
          {
            path: input.path,
            ...(input.absolutePath ? { absolutePath: input.absolutePath } : {}),
          },
          { autoOpen: true },
        )
        return
      }

      if (target === WORKSPACE_FILE_OPEN_TARGET_MARKDOWN_BENCH) {
        await openBenchRoute({
          directory,
          target: { type: "markdown", path: input.path },
          mode: BENCH_MODE_REQUEST_POLICY,
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
    [directory, location.pathname, onOpenResource, openBenchRoute, platform, queueFileOpen],
  )

  const executePrimary = useCallback(
    async (input: WorkspaceFileActionInput) => {
      const target = resolvePlan(input).primaryTarget
      if (!target) return
      await executeTarget(input, target)
    },
    [executeTarget, resolvePlan],
  )

  return {
    resolvePlan,
    executeTarget,
    executePrimary,
  }
}
