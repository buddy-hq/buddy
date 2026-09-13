import { useCallback, useRef, useState, type RefObject } from "react"
import { toast } from "@buddy/ui"
import { usePlatform } from "@/context/platform"
import {
  serializeMarkdownPdfDocument,
  waitForMarkdownPdfRenderReady,
} from "@/lib/markdown-pdf-export"
import { fileNameFromPath } from "@/lib/workspace-file-paths"

function markdownPdfFileName(filepath: string) {
  const name = fileNameFromPath(filepath) || "document.md"
  return `${name.replace(/\.mdx?$/iu, "")}.pdf`
}

export type MarkdownBenchPdfExport = {
  exporting: boolean
  exportRef: RefObject<HTMLDivElement>
  exportPdf(): Promise<void>
}

export function useMarkdownBenchPdfExport(input: {
  directory: string
  path: string
  title: string
}): MarkdownBenchPdfExport {
  const { directory, path, title } = input
  const platform = usePlatform()
  const exportRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const exportPdf = useCallback(async () => {
    const exportElement = exportRef.current
    if (!exportElement || !platform.exportMarkdownPdf) {
      toast.error("PDF export is unavailable.")
      return
    }
    setExporting(true)
    try {
      await waitForMarkdownPdfRenderReady(exportElement)
      const exportedPath = await platform.exportMarkdownPdf({
        html: serializeMarkdownPdfDocument({ title, element: exportElement }),
        directory,
        defaultPath: markdownPdfFileName(path),
      })
      if (!exportedPath) return
      toast.success("Saved PDF.", {
        action: platform.revealPath
          ? {
              label: "Open",
              onClick: () => {
                void platform.revealPath?.(exportedPath)
              },
            }
          : undefined,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Markdown export failed.")
    } finally {
      setExporting(false)
    }
  }, [directory, path, platform, title])

  return { exporting, exportRef, exportPdf }
}
