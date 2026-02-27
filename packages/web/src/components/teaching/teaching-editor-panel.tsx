import { useEffect, useRef } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import type { editor as MonacoEditor } from "monaco-editor"
import { Button } from "@buddy/ui"
import type {
  TeachingLanguage,
  TeachingSelection,
  TeachingWorkspaceState,
} from "@/state/teaching-mode"

type TeachingEditorPanelProps = {
  workspace: TeachingWorkspaceState
  isBusy: boolean
  onCodeChange: (code: string) => void
  onSelectionChange: (selection?: TeachingSelection) => void
  onLanguageChange: (language: TeachingLanguage) => void
  onCheckpoint: () => void
  onRestoreAccepted: () => void
  onLoadExternalChanges: () => void
  onForceOverwrite: () => void
  className?: string
}

function selectionFromEditor(editor: MonacoEditor.IStandaloneCodeEditor): TeachingSelection | undefined {
  const selection = editor.getSelection()
  if (!selection) return undefined

  return {
    selectionStartLine: selection.startLineNumber,
    selectionStartColumn: selection.startColumn,
    selectionEndLine: selection.endLineNumber,
    selectionEndColumn: selection.endColumn,
  }
}

export function TeachingEditorPanel(props: TeachingEditorPanelProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const rootClassName = [
    "flex min-h-0 flex-1 flex-col border-t bg-card/60 lg:border-t-0 lg:border-l",
    props.className,
  ]
    .filter(Boolean)
    .join(" ")

  const onMount: OnMount = (editor) => {
    editorRef.current = editor
    requestAnimationFrame(() => {
      editor.layout()
    })
    props.onSelectionChange(selectionFromEditor(editor))
    editor.onDidChangeCursorSelection(() => {
      props.onSelectionChange(selectionFromEditor(editor))
    })
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !props.workspace.conflict) return
    editor.focus()
  }, [props.workspace.conflict])

  useEffect(() => {
    editorRef.current?.layout()
  }, [props.workspace.code])

  const status = props.workspace.conflict
    ? "Conflict"
    : props.workspace.pendingSave
      ? "Saving..."
      : props.workspace.saveError
        ? "Save failed"
        : props.workspace.code === props.workspace.savedCode
          ? "Saved"
          : "Unsaved"

  return (
    <section className={rootClassName}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs"
          value={props.workspace.language}
          onChange={(event) => props.onLanguageChange(event.target.value as TeachingLanguage)}
          disabled={props.isBusy}
          aria-label="Lesson language"
        >
          <option value="ts">TypeScript</option>
          <option value="tsx">React</option>
        </select>

        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {props.workspace.lessonFilePath}
        </div>

        <span className="ml-auto rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">
          rev {props.workspace.revision}
        </span>
        <span className="rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">{status}</span>

        <Button
          size="sm"
          variant="secondary"
          onClick={props.onCheckpoint}
          disabled={props.isBusy}
          title="Mark the current lesson state as accepted"
        >
          Accept Step
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={props.onRestoreAccepted}
          disabled={props.isBusy}
          title="Restore the lesson file to the last accepted state"
        >
          Restore Step
        </Button>
      </div>

      {props.workspace.conflict ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          <span className="min-w-0 flex-1">The lesson file changed outside the editor. Choose which version to keep.</span>
          <Button size="sm" variant="secondary" onClick={props.onLoadExternalChanges}>
            Load external changes
          </Button>
          <Button size="sm" onClick={props.onForceOverwrite}>
            Force overwrite
          </Button>
        </div>
      ) : null}

      {props.workspace.saveError ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {props.workspace.saveError}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          path={props.workspace.lessonFilePath}
          language="typescript"
          theme="vs-dark"
          value={props.workspace.code}
          onMount={onMount}
          onChange={(value) => props.onCodeChange(value ?? "")}
          options={{
            automaticLayout: true,
            minimap: {
              enabled: false,
            },
            fontSize: 14,
            scrollBeyondLastLine: false,
            wordWrap: "on",
          }}
        />
      </div>
    </section>
  )
}
