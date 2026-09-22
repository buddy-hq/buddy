import { useCallback } from "react"
import { toast } from "@buddy/ui"
import { createBenchObjectTarget } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { usePlatform } from "@/context/platform"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { canRenderPresentedMediaAsSource } from "@/lib/presented-media-source"
import {
  useWorkspaceFileOpen,
  type WorkspaceFileActionInput,
  type WorkspaceResourceOpener,
} from "@/lib/use-workspace-file-open"
import { WORKSPACE_FILE_OPEN_TARGET_REVEAL } from "@/lib/workspace-file-open"
import { useExternalFileOpenDialogStore } from "@/state/external-file-open-dialog-store"
import { useUiPreferences } from "@/state/ui-preferences"

type ResolvedMarkdownFile = Awaited<ReturnType<typeof resolveMarkdownFile>>

async function resolveMarkdownFile(directory: string, path: string) {
  return requireBuddyData(
    await getBuddyClient(directory).objectMediaPresentation.resolveFile({ directory, path }),
  )
}

async function presentMarkdownFile(directory: string, path: string) {
  return requireBuddyData(
    await getBuddyClient(directory).objectMediaPresentation.presentFile({ directory, path }),
  )
}

function canShowInBuddy(file: ResolvedMarkdownFile): boolean {
  return (
    file.renderMode !== "file" ||
    canRenderPresentedMediaAsSource({
      path: file.fileName,
      mimeType: file.mimeType ?? undefined,
      sizeBytes: file.sizeBytes ?? undefined,
      renderMode: file.renderMode,
    })
  )
}

async function approveExternalFileOpen(path: string): Promise<boolean> {
  if (useUiPreferences.getState().openExternalFilesWithoutAsking) return true
  const choice = await useExternalFileOpenDialogStore.getState().requestChoice({ path })
  if (choice === "always") useUiPreferences.getState().setOpenExternalFilesWithoutAsking(true)
  return choice !== "cancel"
}

export function useMarkdownFileLinkOpen(
  directory: string | undefined,
  onOpenResource?: WorkspaceResourceOpener,
) {
  const platform = usePlatform()
  const openBench = useOpenBench()
  const { resolvePlan, executePrimary, executeTarget } = useWorkspaceFileOpen(
    directory,
    onOpenResource,
  )

  const openNotebookFile = useCallback(
    async (file: ResolvedMarkdownFile, workspacePath: string) => {
      const input: WorkspaceFileActionInput = {
        path: workspacePath,
        absolutePath: file.absolutePath,
        name: file.fileName,
        available: true,
        canOpenInBuddy: true,
        canOpenDefaultApp: false,
        canReveal: !!platform.revealPath,
        mimeType: file.mimeType ?? undefined,
        sizeBytes: file.sizeBytes ?? undefined,
      }
      if (resolvePlan(input).primaryTarget) {
        await executePrimary(input)
        return
      }
      await executeTarget(input, WORKSPACE_FILE_OPEN_TARGET_REVEAL)
    },
    [executePrimary, executeTarget, platform.revealPath, resolvePlan],
  )

  const openExternalFile = useCallback(
    async (notebookDirectory: string, file: ResolvedMarkdownFile) => {
      if (!canShowInBuddy(file)) {
        await platform.revealPath?.(file.absolutePath)
        return
      }
      if (!(await approveExternalFileOpen(file.absolutePath))) return
      const { objectID } = await presentMarkdownFile(notebookDirectory, file.absolutePath)
      await openBench({
        directory: notebookDirectory,
        target: createBenchObjectTarget("media-presentation", objectID),
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: null,
      })
    },
    [openBench, platform],
  )

  return useCallback(
    (path: string) => {
      if (!directory) return
      void (async () => {
        try {
          const file = await resolveMarkdownFile(directory, path)
          if (file.workspacePath !== null) {
            await openNotebookFile(file, file.workspacePath)
            return
          }
          await openExternalFile(directory, file)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error))
        }
      })()
    },
    [directory, openExternalFile, openNotebookFile],
  )
}
