import { useEffect, useRef, type ReactNode } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import type { editor as MonacoEditor } from "monaco-editor"
import { Button } from "@buddy/ui"
import type {
  TeachingDiagnostic,
  TeachingLanguage,
  TeachingSelection,
  TeachingWorkspaceFile,
  TeachingWorkspaceState,
} from "@/state/teaching-runtime"
import { TEACHING_LANGUAGE_OPTIONS, teachingMonacoLanguage } from "@/state/teaching-runtime"

type TeachingEditorPanelProps = {
  workspace: TeachingWorkspaceState
  isBusy: boolean
  onCodeChange: (code: string) => void
  onSelectFile: (relativePath: string) => void
  onCreateFile: () => void
  onSelectionChange: (selection?: TeachingSelection) => void
  onLanguageChange: (language: TeachingLanguage) => void
  onCheckpoint: () => void
  onRestoreAccepted: () => void
  onLoadExternalChanges: () => void
  onForceOverwrite: () => void
  className?: string
}

type TeachingFileTreeNode =
  | {
      type: "directory"
      key: string
      name: string
      children: TeachingFileTreeNode[]
    }
  | {
      type: "file"
      key: string
      name: string
      file: TeachingWorkspaceFile
    }

type TeachingFileTreeBucket = {
  directories: Map<string, TeachingFileTreeBucket>
  files: TeachingWorkspaceFile[]
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

function buildFileTree(files: TeachingWorkspaceFile[]): TeachingFileTreeNode[] {
  const root: TeachingFileTreeBucket = {
    directories: new Map(),
    files: [],
  }

  function ensureDirectory(bucket: TeachingFileTreeBucket, segment: string) {
    const existing = bucket.directories.get(segment)
    if (existing) return existing

    const created: TeachingFileTreeBucket = {
      directories: new Map(),
      files: [],
    }
    bucket.directories.set(segment, created)
    return created
  }

  for (const file of files) {
    const segments = file.relativePath.split("/").filter(Boolean)
    if (segments.length === 0) continue

    let bucket = root

    for (let index = 0; index < segments.length - 1; index += 1) {
      bucket = ensureDirectory(bucket, segments[index]!)
    }

    bucket.files.push(file)
  }

  function toNodes(bucket: TeachingFileTreeBucket, prefix = ""): TeachingFileTreeNode[] {
    const directoryNodes = Array.from(bucket.directories.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([segment, child]) => {
        const key = prefix ? `${prefix}/${segment}` : segment
        return {
          type: "directory" as const,
          key,
          name: segment,
          children: toNodes(child, key),
        }
      })

    const fileNodes = [...bucket.files]
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
      .map((file) => {
        const segments = file.relativePath.split("/")
        return {
          type: "file" as const,
          key: file.relativePath,
          name: segments[segments.length - 1] ?? file.relativePath,
          file,
        }
      })

    return [...directoryNodes, ...fileNodes]
  }

  return toNodes(root)
}

function toMonacoSeverity(monaco: typeof import("monaco-editor"), severity: TeachingDiagnostic["severity"]) {
  switch (severity) {
    case "error":
      return monaco.MarkerSeverity.Error
    case "warning":
      return monaco.MarkerSeverity.Warning
    case "info":
      return monaco.MarkerSeverity.Info
    default:
      return monaco.MarkerSeverity.Hint
  }
}

export function TeachingEditorPanel(props: TeachingEditorPanelProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null)
  const rootClassName = [
    "flex min-h-0 flex-1 flex-col border-t bg-card/60 lg:border-t-0 lg:border-l",
    props.className,
  ]
    .filter(Boolean)
    .join(" ")

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
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
  }, [props.workspace.code, props.workspace.activeRelativePath])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return

    monaco.editor.setModelMarkers(
      model,
      "buddy-lsp",
      (props.workspace.diagnostics ?? []).map((diagnostic) => ({
        severity: toMonacoSeverity(monaco, diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source,
        code: diagnostic.code === undefined ? undefined : String(diagnostic.code),
        startLineNumber: diagnostic.startLine,
        startColumn: diagnostic.startColumn,
        endLineNumber: diagnostic.endLine,
        endColumn: diagnostic.endColumn,
      })),
    )

    return () => {
      if (model.isDisposed()) return
      monaco.editor.setModelMarkers(model, "buddy-lsp", [])
    }
  }, [props.workspace.diagnostics, props.workspace.lessonFilePath])

  const status = props.workspace.conflict
    ? "Conflict"
    : props.workspace.pendingSave
      ? "Saving..."
      : props.workspace.saveError
        ? "Save failed"
        : props.workspace.code === props.workspace.savedCode
          ? "Saved"
          : "Unsaved"
  const fileTree = buildFileTree(props.workspace.files)

  function renderTree(nodes: TeachingFileTreeNode[], depth = 0): ReactNode {
    return nodes.map((node) => {
      const paddingLeft = `${depth * 14 + 10}px`

      if (node.type === "directory") {
        return (
          <div key={node.key}>
            <div
              className="flex items-center gap-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              style={{ paddingLeft }}
            >
              <span className="text-[10px]">/</span>
              <span className="truncate">{node.name}</span>
            </div>
            {renderTree(node.children, depth + 1)}
          </div>
        )
      }

      const isActive = node.file.relativePath === props.workspace.activeRelativePath

      return (
        <button
          key={node.key}
          type="button"
          onClick={() => props.onSelectFile(node.file.relativePath)}
          className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs ${
            isActive
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
          }`}
          style={{ paddingLeft }}
          title={node.file.relativePath}
        >
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="shrink-0 rounded border border-border/70 px-1 py-0.5 text-[10px] uppercase text-muted-foreground">
            {node.file.language}
          </span>
        </button>
      )
    })
  }

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
          {TEACHING_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="min-w-0 flex-1 text-xs text-muted-foreground truncate">
          {props.workspace.lessonFilePath}
        </div>

        <span className="rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">
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
        <div className="flex h-full min-h-0">
          <div className="min-w-0 flex min-h-0 flex-1 flex-col">
            <div className="border-b px-3 py-2 text-xs text-muted-foreground">
              Editing: <span className="font-medium text-foreground">{props.workspace.activeRelativePath}</span>
            </div>

            <div className="min-h-0 flex-1">
              <Editor
                height="100%"
                path={props.workspace.lessonFilePath}
                language={teachingMonacoLanguage(props.workspace.language)}
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

            <div className="max-h-44 shrink-0 border-t bg-background/40">
              <div className="border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                LSP Diagnostics
              </div>

              {!props.workspace.lspAvailable ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No LSP server is available for the active teaching file.
                </div>
              ) : props.workspace.diagnostics.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No diagnostics in the active file.
                </div>
              ) : (
                <div className="max-h-32 overflow-y-auto px-2 py-2">
                  <div className="space-y-1">
                    {props.workspace.diagnostics.map((diagnostic, index) => (
                      <div
                        key={`${diagnostic.startLine}:${diagnostic.startColumn}:${index}`}
                        className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded border border-border/70 px-1 py-0.5 text-[10px] uppercase text-muted-foreground">
                            {diagnostic.severity}
                          </span>
                          <span className="text-muted-foreground">
                            L{diagnostic.startLine}:C{diagnostic.startColumn}
                          </span>
                          {diagnostic.source ? (
                            <span className="truncate text-muted-foreground">{diagnostic.source}</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-foreground">{diagnostic.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="flex min-h-0 w-56 shrink-0 flex-col border-l bg-background/30">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Files</p>
                <p className="text-[11px] text-muted-foreground">{props.workspace.files.length} tracked</p>
              </div>
              <Button size="sm" variant="secondary" onClick={props.onCreateFile} disabled={props.isBusy}>
                New File
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {fileTree.length > 0 ? (
                <div className="space-y-0.5">{renderTree(fileTree)}</div>
              ) : (
                <p className="px-2 py-2 text-xs text-muted-foreground">No teaching files yet.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
