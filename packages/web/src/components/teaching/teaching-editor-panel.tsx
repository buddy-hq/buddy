import { useEffect, useRef } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import type { editor as MonacoEditor } from "monaco-editor"
import { Button } from "@buddy/ui"
import { language } from "@/context/language"
import type {
  TeachingDiagnostic,
  TeachingLanguage,
  TeachingSelection,
  TeachingWorkspaceState,
} from "@/state/teaching-runtime"
import { TEACHING_LANGUAGE_OPTIONS, teachingMonacoLanguage } from "@/state/teaching-runtime"
import {
  VIRTUAL_DEFAULT_OVERSCAN,
  VIRTUAL_TEACHING_DIAGNOSTIC_MIN_ITEMS,
  VIRTUAL_TEACHING_DIAGNOSTIC_ROW_ESTIMATE_PX,
  VIRTUAL_TEACHING_FILE_MIN_ITEMS,
  VIRTUAL_TEACHING_FILE_ROW_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"
import { buildFileTree, flattenFileTree, type TeachingFileTreeRow } from "./teaching-editor-tree"

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

function selectionFromEditor(
  editor: MonacoEditor.IStandaloneCodeEditor,
): TeachingSelection | undefined {
  const selection = editor.getSelection()
  if (!selection) return undefined

  return {
    selectionStartLine: selection.startLineNumber,
    selectionStartColumn: selection.startColumn,
    selectionEndLine: selection.endLineNumber,
    selectionEndColumn: selection.endColumn,
  }
}

function toMonacoSeverity(
  monaco: typeof import("monaco-editor"),
  severity: TeachingDiagnostic["severity"],
) {
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
  const diagnosticsListRef = useRef<HTMLDivElement>(null)
  const fileTreeListRef = useRef<HTMLDivElement>(null)
  const rootClassName = [
    "flex min-h-0 flex-1 flex-col border-t bg-surface-raised-base/60 lg:border-t-0 lg:border-l",
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
    ? language.t("teaching.editor.conflict")
    : props.workspace.pendingSave
      ? language.t("common.saving")
      : props.workspace.saveError
        ? language.t("teaching.editor.saveFailed")
        : props.workspace.code === props.workspace.savedCode
          ? language.t("teaching.editor.saved")
          : language.t("teaching.editor.unsaved")
  const fileTree = buildFileTree(props.workspace.files)
  const fileTreeRows = flattenFileTree(fileTree)

  function renderFileTreeRow(row: TeachingFileTreeRow, index: number) {
    const node = row.node
    const paddingLeft = `${row.depth * 14 + 10}px`

    if (node.type === "directory") {
      return (
        <div
          className={index === fileTreeRows.length - 1 ? "" : "pb-0.5"}
          style={{ paddingLeft }}
          title={node.key}
        >
          <div className="flex items-center gap-2 py-1 text-[11px] font-medium uppercase tracking-wide text-text-weak">
            <span className="text-[10px]">/</span>
            <span className="truncate">{node.name}</span>
          </div>
        </div>
      )
    }

    const isActive = node.file.relativePath === props.workspace.activeRelativePath

    return (
      <div className={index === fileTreeRows.length - 1 ? "" : "pb-0.5"}>
        <button
          type="button"
          onClick={() => props.onSelectFile(node.file.relativePath)}
          className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-xs ${
            isActive
              ? "bg-background-base text-text-base shadow-sm"
              : "text-text-weak hover:bg-background-base/60 hover:text-text-base"
          }`}
          style={{ paddingLeft }}
          title={node.file.relativePath}
        >
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="shrink-0 rounded border border-border-base/70 px-1 py-0.5 text-[10px] uppercase text-text-weak">
            {node.file.language}
          </span>
        </button>
      </div>
    )
  }

  return (
    <section className={rootClassName}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <select
          className="h-8 rounded-md border bg-background-base px-2 text-xs"
          value={props.workspace.language}
          onChange={(event) => props.onLanguageChange(event.target.value as TeachingLanguage)}
          disabled={props.isBusy}
          aria-label={language.t("teaching.editor.lessonLanguageAria")}
        >
          {TEACHING_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="min-w-0 flex-1 text-xs text-text-weak truncate">
          {props.workspace.lessonFilePath}
        </div>

        <span className="rounded-md border bg-background-base px-2 py-1 text-[11px] text-text-weak">
          {language.t("teaching.editor.revisionPrefix")} {props.workspace.revision}
        </span>
        <span className="rounded-md border bg-background-base px-2 py-1 text-[11px] text-text-weak">
          {status}
        </span>

        <Button
          size="sm"
          variant="secondary"
          onClick={props.onCheckpoint}
          disabled={props.isBusy}
          title={language.t("teaching.editor.acceptStepTitle")}
        >
          {language.t("teaching.editor.acceptStep")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={props.onRestoreAccepted}
          disabled={props.isBusy}
          title={language.t("teaching.editor.restoreStepTitle")}
        >
          {language.t("teaching.editor.restoreStep")}
        </Button>
      </div>

      {props.workspace.conflict ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-b-[color:color-mix(in_oklab,var(--surface-warning-base)_38%,transparent)] bg-[color:color-mix(in_oklab,var(--surface-warning-base)_12%,transparent)] px-3 py-2 text-xs text-text-base">
          <span className="min-w-0 flex-1">{language.t("teaching.editor.conflictMessage")}</span>
          <Button size="sm" variant="secondary" onClick={props.onLoadExternalChanges}>
            {language.t("teaching.editor.loadExternalChanges")}
          </Button>
          <Button size="sm" onClick={props.onForceOverwrite}>
            {language.t("teaching.editor.forceOverwrite")}
          </Button>
        </div>
      ) : null}

      {props.workspace.saveError ? (
        <div className="border-b border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-xs text-icon-critical-base">
          {props.workspace.saveError}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0">
          <div className="min-w-0 flex min-h-0 flex-1 flex-col">
            <div className="border-b px-3 py-2 text-xs text-text-weak">
              {language.t("teaching.editor.editingPrefix")}{" "}
              <span className="font-medium text-text-base">
                {props.workspace.activeRelativePath}
              </span>
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

            <div className="max-h-44 shrink-0 border-t bg-background-base/40">
              <div className="border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-text-weak">
                {language.t("teaching.editor.diagnosticsTitle")}
              </div>

              {!props.workspace.lspAvailable ? (
                <div className="px-3 py-2 text-xs text-text-weak">
                  {language.t("teaching.editor.noLsp")}
                </div>
              ) : props.workspace.diagnostics.length === 0 ? (
                <div className="px-3 py-2 text-xs text-text-weak">
                  {language.t("teaching.editor.noDiagnostics")}
                </div>
              ) : (
                <div ref={diagnosticsListRef} className="max-h-32 overflow-y-auto px-2 py-2">
                  {props.workspace.diagnostics.length >= VIRTUAL_TEACHING_DIAGNOSTIC_MIN_ITEMS ? (
                    <VirtualizedRows
                      items={props.workspace.diagnostics}
                      getItemKey={(diagnostic) =>
                        `${diagnostic.startLine}:${diagnostic.startColumn}:${diagnostic.severity}:${diagnostic.message}`
                      }
                      estimateSize={() => VIRTUAL_TEACHING_DIAGNOSTIC_ROW_ESTIMATE_PX}
                      getScrollElement={() => diagnosticsListRef.current}
                      overscan={VIRTUAL_DEFAULT_OVERSCAN}
                      measure
                      renderItem={(diagnostic, index) => (
                        <div
                          className={index === props.workspace.diagnostics.length - 1 ? "" : "pb-1"}
                        >
                          <div className="rounded-md border border-border-base/70 bg-background-base px-2 py-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="rounded border border-border-base/70 px-1 py-0.5 text-[10px] uppercase text-text-weak">
                                {diagnostic.severity}
                              </span>
                              <span className="text-text-weak">
                                {language.t("teaching.editor.lineColumn", {
                                  line: diagnostic.startLine,
                                  column: diagnostic.startColumn,
                                })}
                              </span>
                              {diagnostic.source ? (
                                <span className="truncate text-text-weak">{diagnostic.source}</span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-text-base">{diagnostic.message}</p>
                          </div>
                        </div>
                      )}
                    />
                  ) : (
                    <div className="space-y-1">
                      {props.workspace.diagnostics.map((diagnostic) => (
                        <div
                          key={`${diagnostic.startLine}:${diagnostic.startColumn}:${diagnostic.severity}:${diagnostic.message}`}
                          className="rounded-md border border-border-base/70 bg-background-base px-2 py-1.5 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded border border-border-base/70 px-1 py-0.5 text-[10px] uppercase text-text-weak">
                              {diagnostic.severity}
                            </span>
                            <span className="text-text-weak">
                              {language.t("teaching.editor.lineColumn", {
                                line: diagnostic.startLine,
                                column: diagnostic.startColumn,
                              })}
                            </span>
                            {diagnostic.source ? (
                              <span className="truncate text-text-weak">{diagnostic.source}</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-text-base">{diagnostic.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <aside className="flex min-h-0 w-56 shrink-0 flex-col border-l bg-background-base/30">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-weak">
                  {language.t("teaching.editor.files")}
                </p>
                <p className="text-[11px] text-text-weak">
                  {language.t("teaching.editor.tracked", { count: props.workspace.files.length })}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={props.onCreateFile}
                disabled={props.isBusy}
              >
                {language.t("teaching.editor.newFile")}
              </Button>
            </div>

            <div ref={fileTreeListRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {fileTreeRows.length > 0 ? (
                fileTreeRows.length >= VIRTUAL_TEACHING_FILE_MIN_ITEMS ? (
                  <VirtualizedRows
                    items={fileTreeRows}
                    getItemKey={(row) => row.node.key}
                    estimateSize={() => VIRTUAL_TEACHING_FILE_ROW_ESTIMATE_PX}
                    getScrollElement={() => fileTreeListRef.current}
                    overscan={VIRTUAL_DEFAULT_OVERSCAN}
                    measure
                    renderItem={renderFileTreeRow}
                  />
                ) : (
                  <div className="space-y-0.5">
                    {fileTreeRows.map((row, index) => (
                      <div key={row.node.key}>{renderFileTreeRow(row, index)}</div>
                    ))}
                  </div>
                )
              ) : (
                <p className="px-2 py-2 text-xs text-text-weak">
                  {language.t("teaching.editor.noFiles")}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
