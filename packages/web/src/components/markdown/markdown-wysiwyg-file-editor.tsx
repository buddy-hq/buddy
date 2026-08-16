import { markdownBenchDocumentFormatFromPath } from "@buddy/workspace-file-policy"
import {
  VersionedTextFileEditor,
  type VersionedTextFileEditorSurface,
} from "@/components/editors/versioned-text-file-editor"
import { MarkdownBenchEditor } from "@/components/bench/markdown-bench-editor"

type MarkdownWysiwygFileEditorProps = {
  active?: boolean
  reloadKey?: string | number
  className?: string
  directory?: string
  fallbackPath: string
  emptyTitle: string
  emptyDescription: string
  createLabel: string
  defaultContent: string
  load: () => Promise<{
    path: string
    exists: boolean
    content: string
    version: string | null
  }>
  save: (input: {
    content: string
    expectedVersion?: string | null
  }) => Promise<{ path: string; content: string; version: string }>
  isVersionConflictError: <TError>(error: TError) => boolean
}

function MarkdownWysiwygSurface(props: {
  surface: VersionedTextFileEditorSurface
  directory: string
}) {
  const documentFormat = markdownBenchDocumentFormatFromPath(props.surface.path) ?? "markdown"

  return (
    <MarkdownBenchEditor
      markdown={props.surface.content}
      version={props.surface.version ?? ""}
      dirty={props.surface.dirty}
      saving={props.surface.saving}
      conflict={props.surface.conflict}
      appearance="plain"
      directory={props.directory}
      documentFormat={documentFormat}
      path={props.surface.path}
      onChange={props.surface.onChange}
    />
  )
}

/**
 * A versioned Markdown file editor that renders the same WYSIWYG surface used on
 * Bench (MarkdownBenchEditor), reusing the shared versioned load/save/autosave/
 * conflict state machine. It uses the flush "plain" appearance with no toolbar so
 * the editor reads as a single, minimal text box.
 */
export function MarkdownWysiwygFileEditor(props: MarkdownWysiwygFileEditorProps) {
  return (
    <VersionedTextFileEditor
      active={props.active}
      reloadKey={props.reloadKey}
      className={props.className}
      fallbackPath={props.fallbackPath}
      languageId="markdown"
      statusIndicator="none"
      frameless
      emptyState={{
        title: props.emptyTitle,
        description: props.emptyDescription,
        createLabel: props.createLabel,
        defaultContent: props.defaultContent,
      }}
      load={props.load}
      save={props.save}
      isVersionConflictError={props.isVersionConflictError}
      renderEditorSurface={(surface) => (
        <MarkdownWysiwygSurface surface={surface} directory={props.directory ?? ""} />
      )}
    />
  )
}
