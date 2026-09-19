import { markdownBenchDocumentFormatFromPath } from "@buddy/workspace-file-policy"
import { ReadOnlyMarkdownBenchView } from "@/components/bench/read-only-markdown-bench-view"
import { ReadOnlySourceBenchView } from "@/components/bench/read-only-source-bench-view"
import type { BenchViewerAction } from "@/components/bench/bench-viewer-shell"

/** Inputs for choosing the owning read-only renderer for presented source text. */
export type PresentedMediaSourceViewerProps = {
  actions: BenchViewerAction[]
  content: string | undefined
  directory: string
  error: string | undefined
  loading: boolean
  path: string
  sourceFileName: string
  sourceRawUrl: string | undefined
  title: string
  version: string
  viewportKey: string
}

/** Selects Markdown/MDX presentation or Monaco source presentation by the source path. */
export function PresentedMediaSourceViewer(props: PresentedMediaSourceViewerProps) {
  const documentFormat = markdownBenchDocumentFormatFromPath(props.sourceFileName)
  if (documentFormat) {
    return (
      <ReadOnlyMarkdownBenchView
        title={props.title}
        path={props.path}
        sourceRawUrl={props.sourceRawUrl}
        directory={props.directory}
        documentFormat={documentFormat}
        markdown={props.content}
        version={props.version}
        error={props.error}
        loading={props.loading}
        actions={props.actions}
        viewportKey={props.viewportKey}
      />
    )
  }

  return (
    <ReadOnlySourceBenchView
      title={props.title}
      path={props.path}
      content={props.content}
      error={props.error}
      loading={props.loading}
      actions={props.actions}
      banner={
        <div className="border-b border-border-base bg-surface-weak/40 px-4 py-1.5 text-xs text-text-weak">
          External file · Read-only
        </div>
      }
    />
  )
}
