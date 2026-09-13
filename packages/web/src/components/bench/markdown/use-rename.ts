import { useCallback } from "react"
import { toast } from "@buddy/ui"
import {
  MARKDOWN_CHANGED_DURING_RENAME_MESSAGE,
  type MarkdownBenchFileLocation,
} from "@/components/bench/markdown/file-rules"
import { resolveRenamedMarkdownBenchPath } from "@/components/bench/markdown/note-title"
import type { MarkdownBenchFileController } from "@/components/bench/markdown/use-file"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench, type BenchTarget } from "@/lib/bench-navigation"
import { renameProjectExplorerEditableFile } from "@/state/chat-actions"
import { forgetMarkdownBenchFile } from "@/state/bench-surface-query"
import { appQueryClient } from "@/state/query-client"

export type MarkdownBenchRenameTitle = (input: {
  title: string
  expectedVersion: string
}) => Promise<{ path: string; target: BenchTarget }>

export function useMarkdownBenchRename(input: {
  directory: string
  location: MarkdownBenchFileLocation
  file: MarkdownBenchFileController
  renameTitle: MarkdownBenchRenameTitle | undefined
  setRenaming(renaming: boolean): void
}): (nextTitle: string) => Promise<void> {
  const { directory: storageDirectory, path } = input.location
  const { file, renameTitle: onRenameTitle } = input
  const openBenchRoute = useOpenBench()
  const { setRenaming } = input

  const renameTitle = useCallback(
    async (nextTitle: string) => {
      const nextPath = resolveRenamedMarkdownBenchPath(path, nextTitle)
      if (nextPath === path) return

      setRenaming(true)
      try {
        let pending = file.snapshot()
        if (pending.saving) pending = await file.waitForSaveToSettle()
        if (pending.saving) {
          throw new Error("Markdown is still saving. Wait for it to finish before renaming.")
        }
        if (pending.conflict || pending.saveError || !pending.exists) {
          throw new Error("Resolve the Markdown file error before renaming this note.")
        }

        if (pending.content !== pending.savedContent) {
          const saved = await file.saveFile({
            directory: pending.directory,
            path: pending.path,
            content: pending.content,
            expectedVersion: pending.version,
          })
          file.store.getState().commitSaved(saved)
          pending = file.snapshot()
          if (pending.content !== pending.savedContent) {
            throw new Error(MARKDOWN_CHANGED_DURING_RENAME_MESSAGE)
          }
        }

        const currentVersion = pending.version
        const renamed = onRenameTitle
          ? await onRenameTitle({ title: nextTitle, expectedVersion: currentVersion })
          : await renameProjectExplorerEditableFile({
              directory: storageDirectory,
              path,
              nextPath,
              expectedVersion: currentVersion,
            }).then((renamedFile) => ({
              path: renamedFile.path,
              target: {
                type: "workspace-file" as const,
                path: renamedFile.path,
                viewer: "markdown" as const,
              },
            }))

        file.store.getState().markRenamed(currentVersion)
        forgetMarkdownBenchFile(appQueryClient, { directory: storageDirectory, path })
        forgetMarkdownBenchFile(appQueryClient, {
          directory: storageDirectory,
          path: renamed.path,
        })

        const openResult = await openBenchRoute({
          directory: input.directory,
          target: renamed.target,
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: null,
        })
        if (openResult.outcome !== "committed") {
          toast.error(`Renamed to ${renamed.path}, but Bench could not open the new path.`)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Note could not be renamed.")
        throw error
      } finally {
        setRenaming(false)
      }
    },
    [file, input.directory, onRenameTitle, openBenchRoute, path, setRenaming, storageDirectory],
  )

  return renameTitle
}
