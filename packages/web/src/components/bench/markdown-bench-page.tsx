import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DownloadIcon,
  Loader2Icon,
  MinusIcon,
  MoonIcon,
  PlusIcon,
  PrinterIcon,
  Redo2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SaveIcon,
  SunIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react"
import { Button, ToggleGroup, ToggleGroupItem, toast } from "@buddy/ui"
import {
  BenchViewerShell,
  type BenchViewerAction,
} from "@/components/bench/bench-viewer-shell"
import { parseToolState } from "@/components/chat/tools/parse-tool-state"
import { isRecord, readNonEmptyString, readString } from "@/components/chat/tools/types"
import {
  MarkdownBenchEditor,
  type MarkdownBenchDocumentSelection,
  type MarkdownBenchHistoryControlsState,
  type MarkdownBenchEditorHandle,
} from "@/components/bench/markdown-bench-editor"
import {
  isMarkdownBenchContentThemeMode,
  resolveMarkdownBenchContentTheme,
} from "@/components/bench/markdown-bench-document-theme"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import {
  appendSelectionContextToDraft,
  removeSelectionContextFromDraft,
} from "@/components/readers/utils/reading-selection-draft"
import { usePlatform } from "@/context/platform"
import { useTheme } from "@/theme"
import {
  serializeMarkdownPdfDocument,
  waitForMarkdownPdfRenderReady,
} from "@/lib/markdown-pdf-export"
import { fileNameFromPath } from "@/lib/workspace-file-paths"
import {
  ProjectExplorerFileVersionConflictError,
  readProjectExplorerEditableFile,
  saveProjectExplorerEditableFile,
  type ProjectExplorerEditableFileState,
} from "@/state/chat-actions"
import type { MessagePart } from "@/state/chat-types"
import { useChatStore } from "@/state/chat-store"
import {
  MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
  MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
  useMarkdownBenchPreferences,
} from "@/state/markdown-bench-preferences"
import { getPromptDraft, usePromptStore } from "@/state/prompt-store"

const MARKDOWN_SAVE_DEBOUNCE_MS = 900
const FILE_EDIT_TOOL_NAMES = new Set(["edit", "write", "apply_patch"])

type MarkdownBenchPageProps = {
  directory: string
  path: string
  initialFile: ProjectExplorerEditableFileState
}

export type MarkdownBenchPendingSaveSnapshot = {
  conflict: boolean
  content: string
  directory: string
  path: string
  savedContent: string
  saving: boolean
  version: string
}

type MarkdownBenchSaveFile = (
  input: Parameters<typeof saveProjectExplorerEditableFile>[0],
) => ReturnType<typeof saveProjectExplorerEditableFile>

function markdownPdfFileName(filepath: string) {
  const name = fileNameFromPath(filepath) || "document.md"
  return `${name.replace(/\.md$/iu, "")}.pdf`
}

function createMarkdownSelectionKey() {
  const random = Math.random().toString(36).slice(2, 10)
  return `md_sel_${Date.now().toString(36)}_${random}`
}

function normalizePathForCompare(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//u, "")
}

function filePathMatchesTarget(candidate: string | undefined, targetPath: string) {
  if (!candidate) return false
  const normalizedCandidate = normalizePathForCompare(candidate)
  const normalizedTarget = normalizePathForCompare(targetPath)
  return (
    normalizedCandidate === normalizedTarget ||
    normalizedCandidate.endsWith(`/${normalizedTarget}`)
  )
}

function toolMetadataTargetsPath(part: MessagePart, targetPath: string) {
  if (part.type !== "tool" || typeof part.tool !== "string") return false
  if (!FILE_EDIT_TOOL_NAMES.has(part.tool)) return false

  const state = parseToolState(part)
  if (part.tool === "apply_patch") {
    const files = state.metadata.files
    if (!Array.isArray(files)) return false
    return files.some((file) => {
      if (!isRecord(file)) return false
      return (
        filePathMatchesTarget(readNonEmptyString(file.relativePath), targetPath) ||
        filePathMatchesTarget(readNonEmptyString(file.filePath), targetPath)
      )
    })
  }

  const filediff = isRecord(state.metadata.filediff) ? state.metadata.filediff : undefined
  return (
    filePathMatchesTarget(readString(state.input.filePath), targetPath) ||
    filePathMatchesTarget(readString(filediff?.file), targetPath) ||
    filePathMatchesTarget(state.title, targetPath)
  )
}

function toolPartCompletionKey(part: MessagePart) {
  const state = parseToolState(part)
  if (state.status !== "completed") return undefined
  return `${part.id}:${state.end ?? "completed"}`
}

export function shouldFlushMarkdownBenchPendingSave(
  snapshot: MarkdownBenchPendingSaveSnapshot,
): boolean {
  return snapshot.content !== snapshot.savedContent && !snapshot.saving && !snapshot.conflict
}

export async function flushMarkdownBenchPendingSave(
  snapshot: MarkdownBenchPendingSaveSnapshot,
  saveFile: MarkdownBenchSaveFile = saveProjectExplorerEditableFile,
): Promise<boolean> {
  if (!shouldFlushMarkdownBenchPendingSave(snapshot)) return false

  try {
    await saveFile({
      directory: snapshot.directory,
      path: snapshot.path,
      content: snapshot.content,
      expectedVersion: snapshot.version,
    })
    return true
  } catch {
    return false
  }
}

export function MarkdownBenchPage(props: MarkdownBenchPageProps) {
  const { controller } = useDirectoryNotebookRouteContext()
  const platform = usePlatform()
  const { themeId, themes } = useTheme()
  const editorRef = useRef<MarkdownBenchEditorHandle>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const [markdown, setMarkdown] = useState(props.initialFile.content)
  const [savedMarkdown, setSavedMarkdown] = useState(props.initialFile.content)
  const [version, setVersion] = useState(props.initialFile.version ?? "")
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)
  const [exporting, setExporting] = useState(false)
  const [historyControls, setHistoryControls] = useState<MarkdownBenchHistoryControlsState>({
    canRedo: false,
    canUndo: false,
  })
  const setPromptDraft = usePromptStore((state) => state.replaceDraft)
  const contentFontScale = useMarkdownBenchPreferences((state) => state.contentFontScale)
  const contentThemeMode = useMarkdownBenchPreferences((state) => state.contentThemeMode)
  const decreaseContentFontScale = useMarkdownBenchPreferences(
    (state) => state.decreaseContentFontScale,
  )
  const increaseContentFontScale = useMarkdownBenchPreferences(
    (state) => state.increaseContentFontScale,
  )
  const resetContentFontScale = useMarkdownBenchPreferences((state) => state.resetContentFontScale)
  const setContentThemeMode = useMarkdownBenchPreferences((state) => state.setContentThemeMode)
  const stagedSelectionKeyRef = useRef<string | undefined>(undefined)
  const activeSessionID =
    controller.status === "ready" ? controller.mainPaneProps.chatState.sessionID : undefined
  const toolParts = useChatStore((state) => {
    const directoryState = state.directories[props.directory]
    if (!directoryState || !activeSessionID) return []
    const messages =
      directoryState.messagesBySessionID?.[activeSessionID] ??
      (directoryState.sessionID === activeSessionID ? directoryState.messages : [])
    return messages.flatMap((message) =>
      message.parts.filter((part) => part.type === "tool" && toolMetadataTargetsPath(part, props.path)),
    )
  })
  const dirty = markdown !== savedMarkdown
  const title = fileNameFromPath(props.path) || props.path
  const currentSaveSnapshot = useMemo<MarkdownBenchPendingSaveSnapshot>(
    () => ({
      conflict,
      content: markdown,
      directory: props.directory,
      path: props.path,
      savedContent: savedMarkdown,
      saving,
      version,
    }),
    [conflict, markdown, props.directory, props.path, savedMarkdown, saving, version],
  )
  const latestSaveSnapshotRef = useRef(currentSaveSnapshot)
  const previousCommittedSaveSnapshotRef = useRef(currentSaveSnapshot)
  latestSaveSnapshotRef.current = currentSaveSnapshot
  const contentTheme = useMemo(() => {
    const theme = themes[themeId]
    if (!theme) return undefined
    return resolveMarkdownBenchContentTheme({
      mode: contentThemeMode,
      theme,
    })
  }, [contentThemeMode, themeId, themes])
  const contentFontScaleLabel = `${Math.round(contentFontScale * 100)}%`
  const agentEditActivity = useMemo(() => {
    let running = false
    let completedKey: string | undefined

    for (const part of toolParts) {
      const state = parseToolState(part)
      if (state.status === "pending" || state.status === "running") {
        running = true
        continue
      }
      const key = toolPartCompletionKey(part)
      if (key) completedKey = key
    }

    return { running, completedKey }
  }, [toolParts])
  const handledAgentEditKeyRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const previousSnapshot = previousCommittedSaveSnapshotRef.current
    if (
      previousSnapshot.directory !== props.directory ||
      previousSnapshot.path !== props.path
    ) {
      void flushMarkdownBenchPendingSave(previousSnapshot)
    }

    setMarkdown(props.initialFile.content)
    setSavedMarkdown(props.initialFile.content)
    setVersion(props.initialFile.version ?? "")
    setSaving(false)
    setLoading(false)
    setConflict(false)
    setSaveError(undefined)
    editorRef.current?.setMarkdown(props.initialFile.content)
  }, [props.directory, props.initialFile, props.path])

  useEffect(() => {
    previousCommittedSaveSnapshotRef.current = currentSaveSnapshot
  }, [currentSaveSnapshot])

  useEffect(() => {
    return () => {
      void flushMarkdownBenchPendingSave(latestSaveSnapshotRef.current)
    }
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setSaveError(undefined)
    try {
      const next = await readProjectExplorerEditableFile({
        directory: props.directory,
        path: props.path,
      })
      setMarkdown(next.content)
      setSavedMarkdown(next.content)
      setVersion(next.version ?? "")
      setConflict(false)
      editorRef.current?.setMarkdown(next.content)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [props.directory, props.path])

  const save = useCallback(
    async (input?: { overwrite?: boolean }) => {
      if (!dirty && !input?.overwrite) return
      setSaving(true)
      setSaveError(undefined)
      try {
        const saved = await saveProjectExplorerEditableFile({
          directory: props.directory,
          path: props.path,
          content: markdown,
          expectedVersion: input?.overwrite ? undefined : version,
        })
        setSavedMarkdown(saved.content)
        setVersion(saved.version ?? "")
        setConflict(false)
      } catch (error) {
        if (error instanceof ProjectExplorerFileVersionConflictError) {
          setConflict(true)
          setSaveError(error.message)
        } else {
          setSaveError(error instanceof Error ? error.message : String(error))
        }
      } finally {
        setSaving(false)
      }
    },
    [dirty, markdown, props.directory, props.path, version],
  )

  useEffect(() => {
    if (!dirty || saving || conflict) return
    const timeout = window.setTimeout(() => {
      void save()
    }, MARKDOWN_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [conflict, dirty, save, saving])

  useEffect(() => {
    if (agentEditActivity.running) {
      return
    }

    const completedKey = agentEditActivity.completedKey
    if (!completedKey || handledAgentEditKeyRef.current === completedKey) return
    handledAgentEditKeyRef.current = completedKey

    if (dirty) {
      return
    }

    void reload()
  }, [agentEditActivity.completedKey, agentEditActivity.running, dirty, reload])

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
        html: serializeMarkdownPdfDocument({
          title,
          element: exportElement,
        }),
        defaultPath: markdownPdfFileName(props.path),
      })
      if (exportedPath) {
        toast.success("Markdown exported.")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Markdown export failed.")
    } finally {
      setExporting(false)
    }
  }, [platform, props.path, title])

  const syncSelectionToChat = useCallback((selection: MarkdownBenchDocumentSelection) => {
    if (controller.status !== "ready") return
    const text = selection.text.trim()
    const promptKey = controller.mainPaneProps.chatState.promptKey
    const currentDraft = getPromptDraft(usePromptStore.getState(), promptKey)
    const stagedSelectionKey = stagedSelectionKeyRef.current
    const draftWithoutPreviousSelection = stagedSelectionKey
      ? (removeSelectionContextFromDraft(currentDraft, stagedSelectionKey) ?? currentDraft)
      : currentDraft

    if (!text) {
      stagedSelectionKeyRef.current = undefined
      if (draftWithoutPreviousSelection !== currentDraft) {
        setPromptDraft(promptKey, draftWithoutPreviousSelection)
      }
      return
    }

    const selectionKey = createMarkdownSelectionKey()
    stagedSelectionKeyRef.current = selectionKey
    setPromptDraft(
      promptKey,
      appendSelectionContextToDraft(draftWithoutPreviousSelection, {
        source: "markdown",
        text,
        selectionKey,
        path: props.path,
        version,
        ...(selection.headingPath ? { headingPath: selection.headingPath } : {}),
      }),
    )
  }, [controller, props.path, setPromptDraft, version])

  const setDocumentContentThemeMode = useCallback(
    (mode: string) => {
      if (!isMarkdownBenchContentThemeMode(mode)) return
      setContentThemeMode(mode)
    },
    [setContentThemeMode],
  )
  const undo = useCallback(() => {
    editorRef.current?.undo()
  }, [])
  const redo = useCallback(() => {
    editorRef.current?.redo()
  }, [])
  const isPrintView = contentThemeMode === "print"
  const canDecreaseContentFontScale =
    !isPrintView && contentFontScale > MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE
  const canIncreaseContentFontScale =
    !isPrintView && contentFontScale < MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE
  const viewToolbar = useMemo(
    () => (
      <>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8 rounded-lg text-text-weak hover:bg-surface-base-hover hover:text-text-base"
          aria-label="Undo"
          title="Undo"
          disabled={!historyControls.canUndo}
          data-action="markdown-undo"
          onClick={undo}
        >
          <Undo2Icon className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8 rounded-lg text-text-weak hover:bg-surface-base-hover hover:text-text-base"
          aria-label="Redo"
          title="Redo"
          disabled={!historyControls.canRedo}
          data-action="markdown-redo"
          onClick={redo}
        >
          <Redo2Icon className="size-4" aria-hidden />
        </Button>
        <div className="mx-1 h-4 w-px bg-border-base/70" />
        <ToggleGroup
          type="single"
          value={contentThemeMode}
          variant="default"
          size="sm"
          onValueChange={setDocumentContentThemeMode}
        >
          <ToggleGroupItem
            value="light"
            aria-label="Light document view"
            title="Light document view"
            data-action="markdown-document-light"
          >
            <SunIcon className="size-4" aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="dark"
            aria-label="Dark document view"
            title="Dark document view"
            data-action="markdown-document-dark"
          >
            <MoonIcon className="size-4" aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="print"
            aria-label="Print document view"
            title="Print document view"
            data-action="markdown-document-print"
          >
            <PrinterIcon className="size-4" aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="mx-1 h-4 w-px bg-border-base/70" />
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8 rounded-lg text-text-weak hover:bg-surface-base-hover hover:text-text-base"
          aria-label={`Decrease document text size (${contentFontScaleLabel})`}
          title={`Decrease document text size (${contentFontScaleLabel})`}
          disabled={!canDecreaseContentFontScale}
          data-action="markdown-font-size-decrease"
          onClick={decreaseContentFontScale}
        >
          <MinusIcon className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8 rounded-lg text-text-weak hover:bg-surface-base-hover hover:text-text-base"
          aria-label={
            isPrintView
              ? "Print view uses PDF text size"
              : `Reset document text size (${contentFontScaleLabel})`
          }
          title={
            isPrintView
              ? "Print view uses PDF text size"
              : `Reset document text size (${contentFontScaleLabel})`
          }
          disabled={isPrintView}
          data-action="markdown-font-size-reset"
          onClick={resetContentFontScale}
        >
          <RotateCcwIcon className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8 rounded-lg text-text-weak hover:bg-surface-base-hover hover:text-text-base"
          aria-label={`Increase document text size (${contentFontScaleLabel})`}
          title={`Increase document text size (${contentFontScaleLabel})`}
          disabled={!canIncreaseContentFontScale}
          data-action="markdown-font-size-increase"
          onClick={increaseContentFontScale}
        >
          <PlusIcon className="size-4" aria-hidden />
        </Button>
      </>
    ),
    [
      canDecreaseContentFontScale,
      canIncreaseContentFontScale,
      contentFontScaleLabel,
      contentThemeMode,
      decreaseContentFontScale,
      historyControls.canRedo,
      historyControls.canUndo,
      increaseContentFontScale,
      isPrintView,
      redo,
      resetContentFontScale,
      setDocumentContentThemeMode,
      undo,
    ],
  )

  const actions = useMemo<BenchViewerAction[]>(
    () => [
      ...(conflict
        ? [
            {
              label: "Overwrite file",
              dataAction: "markdown-overwrite",
              icon: <TriangleAlertIcon className="size-4" aria-hidden />,
              onClick: () => {
                void save({ overwrite: true })
              },
            } satisfies BenchViewerAction,
          ]
        : [
            {
              label: saving ? "Saving" : "Save now",
              dataAction: "markdown-save",
              disabled: saving || !dirty,
              icon: saving ? (
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
              ) : (
                <SaveIcon className="size-4" aria-hidden />
              ),
              onClick: () => {
                void save()
              },
            } satisfies BenchViewerAction,
          ]),
      {
        label: loading ? "Reloading" : "Reload",
        dataAction: "markdown-reload",
        disabled: loading,
        icon: loading ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCwIcon className="size-4" aria-hidden />
        ),
        onClick: () => {
          void reload()
        },
      },
      {
        label: exporting ? "Exporting PDF" : "Export PDF",
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
    [
      conflict,
      dirty,
      exportPdf,
      exporting,
      loading,
      reload,
      save,
      saving,
    ],
  )

  const status = conflict
    ? "Conflict"
    : saving
      ? "Saving..."
      : dirty
        ? "Unsaved"
        : "Saved"
  const subtitle = status === "Saved" ? props.path : `${props.path} · ${status}`

  return (
    <BenchViewerShell
      title={title}
      subtitle={subtitle}
      actions={actions}
      toolbar={viewToolbar}
      contentClassName="overflow-hidden"
    >
      {saveError ? (
        <div className="border-b border-border-critical-base/40 bg-surface-critical-base/10 px-4 py-2 text-xs text-icon-critical-base">
          {saveError}
        </div>
      ) : null}
      <div ref={exportRef} className="h-full min-h-0">
        <MarkdownBenchEditor
          ref={editorRef}
          markdown={markdown}
          version={version}
          dirty={dirty}
          saving={saving}
          conflict={conflict}
          contentFontScale={contentFontScale}
          contentTheme={contentTheme}
          onChange={setMarkdown}
          onHistoryControlsChange={setHistoryControls}
          onSelectionChange={syncSelectionToChat}
        />
      </div>
    </BenchViewerShell>
  )
}
