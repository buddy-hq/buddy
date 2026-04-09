import { VersionedTextFileEditor } from "@/components/editors/versioned-text-file-editor"

type MarkdownFileState = {
  path: string
  exists: boolean
  content: string
  version: string | null
}

type MarkdownFileSaveResult = {
  path: string
  content: string
  version: string
}

type MarkdownFileEditorProps = {
  active?: boolean
  reloadKey?: string | number
  className?: string
  fallbackPath: string
  emptyTitle: string
  emptyDescription: string
  createLabel: string
  defaultContent: string
  load: () => Promise<MarkdownFileState>
  save: (input: {
    content: string
    expectedVersion?: string | null
  }) => Promise<MarkdownFileSaveResult>
  isVersionConflictError: (error: unknown) => boolean
}

export function MarkdownFileEditor(props: MarkdownFileEditorProps) {
  return (
    <VersionedTextFileEditor
      active={props.active}
      reloadKey={props.reloadKey}
      className={props.className}
      fallbackPath={props.fallbackPath}
      languageId="markdown"
      emptyState={{
        title: props.emptyTitle,
        description: props.emptyDescription,
        createLabel: props.createLabel,
        defaultContent: props.defaultContent,
      }}
      load={props.load}
      save={props.save}
      isVersionConflictError={props.isVersionConflictError}
    />
  )
}
