import { useMemo } from "react"
import { useStore } from "zustand"
import {
  DownloadIcon,
  Loader2Icon,
  RefreshCwIcon,
  SaveIcon,
  TriangleAlertIcon,
} from "@/icons/app-icons"
import type { BenchViewerAction } from "@/components/bench/bench-viewer-shell"
import { markdownBenchDirty } from "@/components/bench/markdown/file-rules"
import type { MarkdownBenchFileController } from "@/components/bench/markdown/use-file"

export function useMarkdownBenchActions(input: {
  file: MarkdownBenchFileController
  exporting: boolean
  exportPdf(): Promise<void>
}): BenchViewerAction[] {
  const { exportPdf, exporting, file } = input
  const { store } = file
  const conflict = useStore(store, (state) => state.conflict)
  const exists = useStore(store, (state) => state.exists)
  const loading = useStore(store, (state) => state.loading)
  const saving = useStore(store, (state) => state.saving)
  const dirty = useStore(store, markdownBenchDirty)

  return useMemo(
    () => [
      conflict
        ? {
            label: exists ? "Overwrite file" : "Restore file",
            dataAction: "markdown-overwrite",
            icon: <TriangleAlertIcon className="size-4" aria-hidden />,
            onClick: () => {
              void file.save({ overwrite: true })
            },
          }
        : {
            label: saving ? "Saving" : "Save now",
            dataAction: "markdown-save",
            disabled: saving || !dirty,
            icon: saving ? (
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
            ) : (
              <SaveIcon className="size-4" aria-hidden />
            ),
            onClick: () => {
              void file.save()
            },
          },
      {
        label: loading ? "Checking" : exists ? "Reload" : "Check again",
        dataAction: "markdown-reload",
        disabled: loading,
        icon: loading ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCwIcon className="size-4" aria-hidden />
        ),
        onClick: () => {
          if (exists) {
            void file.reload()
            return
          }
          void file.synchronize()
        },
      },
      {
        label: exporting ? "Saving PDF" : "Save as PDF",
        dataAction: "markdown-export-pdf",
        disabled: exporting,
        icon: exporting ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : (
          <DownloadIcon className="size-4" aria-hidden />
        ),
        onClick: () => {
          void exportPdf()
        },
      },
    ],
    [conflict, dirty, exists, exportPdf, exporting, file, loading, saving],
  )
}
