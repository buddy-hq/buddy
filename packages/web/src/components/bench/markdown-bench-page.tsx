import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
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
import { BenchViewerShell, type BenchViewerAction } from "@/components/bench/bench-viewer-shell"
import {
  useRegisterBenchContextProvider,
  type BenchContextProvider,
} from "@/components/bench/bench-route-context"
import { workspaceFileRef } from "@/components/bench/bench-context-utils"
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
import { fileNameFromPath, workspaceFileInstanceKey } from "@/lib/workspace-file-paths"
import type { BenchTarget } from "@/lib/bench-navigation"
import {
  ProjectExplorerFileVersionConflictError,
  readProjectExplorerEditableFile,
  readProjectExplorerEditableFileStatus,
  saveProjectExplorerEditableFile,
  type ProjectExplorerEditableFileState,
} from "@/state/chat-actions"
import type { MessagePart } from "@/state/chat-types"
import { useTranscriptSessionMessages } from "@/state/transcript-repository"
import {
  MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
  MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
  useMarkdownBenchPreferences,
} from "@/state/markdown-bench-preferences"
import { getPromptDraft, usePromptStore } from "@/state/prompt-store"

const MARKDOWN_SAVE_DEBOUNCE_MS = 900
const MARKDOWN_LEAVE_GUARD_WAIT_MS = 5000
const MARKDOWN_LEAVE_GUARD_POLL_MS = 50
const MARKDOWN_FILE_UNAVAILABLE_MESSAGE = "Markdown file was deleted or moved on disk."
const MARKDOWN_FILE_CHANGED_MESSAGE = "Markdown file changed on disk."
const MARKDOWN_CONTEXT_SEMANTIC_KEY_SEPARATOR = "\u0000"
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
  exists: boolean
  path: string
  saveError: boolean
  savedContent: string
  saving: boolean
  version: string
}

type MarkdownBenchSaveFile = (
  input: Parameters<typeof saveProjectExplorerEditableFile>[0],
) => ReturnType<typeof saveProjectExplorerEditableFile>

type MarkdownBenchFileState = {
  conflict: boolean
  exists: boolean
  loading: boolean
  markdown: string
  savedMarkdown: string
  saveError: string | undefined
  saving: boolean
  version: string
}

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
    normalizedCandidate === normalizedTarget || normalizedCandidate.endsWith(`/${normalizedTarget}`)
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
  return (
    snapshot.exists &&
    snapshot.content !== snapshot.savedContent &&
    !snapshot.saving &&
    !snapshot.conflict &&
    !snapshot.saveError
  )
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

async function waitForMarkdownBenchSaveToSettle(input: {
  snapshotRef: MutableRefObject<MarkdownBenchPendingSaveSnapshot>
}): Promise<MarkdownBenchPendingSaveSnapshot> {
  const startedAt = Date.now()
  while (input.snapshotRef.current.saving) {
    if (Date.now() - startedAt >= MARKDOWN_LEAVE_GUARD_WAIT_MS) {
      return input.snapshotRef.current
    }
    await new Promise((resolve) => window.setTimeout(resolve, MARKDOWN_LEAVE_GUARD_POLL_MS))
  }
  return input.snapshotRef.current
}

export function MarkdownBenchPage(props: MarkdownBenchPageProps) {
  const fileKey = useMemo(
    () => workspaceFileInstanceKey({ directory: props.directory, path: props.path }),
    [props.directory, props.path],
  )

  return <MarkdownBenchPageInstance key={fileKey} {...props} />
}

function MarkdownBenchPageInstance(props: MarkdownBenchPageProps) {
  const { controller } = useDirectoryNotebookRouteContext()
  const platform = usePlatform()
  const { themeId, themes } = useTheme()
  const editorRef = useRef<MarkdownBenchEditorHandle>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const [markdown, setMarkdown] = useState(props.initialFile.content)
  const [savedMarkdown, setSavedMarkdown] = useState(props.initialFile.content)
  const [version, setVersion] = useState(props.initialFile.version ?? "")
  const [exists, setExists] = useState(true)
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
  const activeMessages = useTranscriptSessionMessages(props.directory, activeSessionID)
  const toolParts = useMemo(
    () =>
      activeMessages.flatMap((message) =>
        message.parts.filter(
          (part) => part.type === "tool" && toolMetadataTargetsPath(part, props.path),
        ),
      ),
    [activeMessages, props.path],
  )
  const dirty = markdown !== savedMarkdown
  const title = fileNameFromPath(props.path) || props.path
  const saveState = conflict ? "conflict" : saveError ? "error" : saving ? "saving" : "ready"
  const targetStatus = !exists
    ? "unavailable"
    : conflict || saveError
      ? "error"
      : dirty
        ? "dirty"
        : loading
          ? "loading"
          : "ready"
  const fileStateRef = useRef<MarkdownBenchFileState>({
    conflict,
    exists,
    loading,
    markdown,
    savedMarkdown,
    saveError,
    saving,
    version,
  })
  fileStateRef.current = {
    conflict,
    exists,
    loading,
    markdown,
    savedMarkdown,
    saveError,
    saving,
    version,
  }
  const patchFileStateRef = useCallback((patch: Partial<MarkdownBenchFileState>) => {
    fileStateRef.current = {
      ...fileStateRef.current,
      ...patch,
    }
  }, [])
  const contextTarget = useMemo<BenchTarget>(
    () => ({ type: "workspace-file", path: props.path, viewer: "markdown" }),
    [props.path],
  )
  const contextSemanticKey = useMemo(
    () =>
      [
        exists,
        dirty,
        markdown,
        savedMarkdown,
        version,
        saveState,
        saveError ?? "",
        saving,
        targetStatus,
        contentThemeMode,
        contentFontScale,
      ].join(MARKDOWN_CONTEXT_SEMANTIC_KEY_SEPARATOR),
    [
      contentFontScale,
      contentThemeMode,
      dirty,
      exists,
      markdown,
      saveError,
      saveState,
      savedMarkdown,
      saving,
      targetStatus,
      version,
    ],
  )
  const contextProvider = useMemo<BenchContextProvider>(
    () => ({
      read: () => {
        const current = fileStateRef.current
        const currentDirty = current.markdown !== current.savedMarkdown
        const currentSaveState = current.conflict
          ? "conflict"
          : current.saveError
            ? "error"
            : current.saving
              ? "saving"
              : "ready"
        const currentTargetStatus = !current.exists
          ? "unavailable"
          : current.conflict || current.saveError
            ? "error"
            : currentDirty
              ? "dirty"
              : current.loading
                ? "loading"
                : "ready"
        const unavailableClean = !current.exists && !currentDirty
        const verificationErrorClean = current.exists && !!current.saveError && !currentDirty

        return {
          targetStatus: currentTargetStatus,
          title,
          metadata: [
            `exists: ${current.exists}`,
            `dirty: ${currentDirty}`,
            `version: ${current.version}`,
            `save_state: ${currentSaveState}`,
            `theme_mode: ${contentThemeMode}`,
            `font_scale: ${contentFontScale}`,
          ],
          content: unavailableClean
            ? `The Markdown file at ${props.path} was deleted or moved. No verified file content is available.`
            : verificationErrorClean
              ? `The Markdown file at ${props.path} could not be verified. No verified file content is available.`
              : current.markdown,
          refs: [
            workspaceFileRef({
              path: props.path,
              note: "Markdown file on Bench.",
            }),
          ],
          hints: [
            ...(currentDirty
              ? ["Content may differ from the saved file because Bench has unsaved edits."]
              : []),
            ...(!current.exists && currentDirty
              ? [
                  "The file no longer exists on disk; this Markdown content exists only in Bench memory until explicitly restored.",
                ]
              : []),
            ...(!current.exists && !currentDirty
              ? ["File content is unavailable because the file no longer exists on disk."]
              : []),
            ...(verificationErrorClean
              ? ["File content is unavailable because verification failed."]
              : []),
          ],
        }
      },
    }),
    [contentFontScale, contentThemeMode, props.path, title],
  )
  const currentSaveSnapshot = useMemo<MarkdownBenchPendingSaveSnapshot>(
    () => ({
      conflict,
      content: markdown,
      directory: props.directory,
      exists,
      path: props.path,
      saveError: saveError !== undefined,
      savedContent: savedMarkdown,
      saving,
      version,
    }),
    [
      conflict,
      exists,
      markdown,
      props.directory,
      props.path,
      saveError,
      savedMarkdown,
      saving,
      version,
    ],
  )
  const latestSaveSnapshotRef = useRef(currentSaveSnapshot)
  const previousCommittedSaveSnapshotRef = useRef(currentSaveSnapshot)
  latestSaveSnapshotRef.current = currentSaveSnapshot
  const leaveGuard = useCallback(async () => {
    let snapshot = latestSaveSnapshotRef.current
    if (snapshot.saving) {
      snapshot = await waitForMarkdownBenchSaveToSettle({
        snapshotRef: latestSaveSnapshotRef,
      })
    }

    if (snapshot.saving) {
      return {
        status: "block" as const,
        reason: "saving" as const,
        message: "Markdown is still saving. Wait for the save to finish before leaving Bench.",
      }
    }

    if (snapshot.conflict) {
      return {
        status: "block" as const,
        reason: "conflict" as const,
        message: "Markdown has a file conflict. Resolve it before leaving Bench.",
      }
    }

    if (snapshot.saveError) {
      return {
        status: "block" as const,
        reason: "save_error" as const,
        message: "Markdown has a save error. Resolve it before leaving Bench.",
      }
    }

    if (snapshot.content === snapshot.savedContent) {
      return { status: "allow" as const }
    }

    const saved = await flushMarkdownBenchPendingSave(snapshot)
    if (saved) {
      return { status: "allow" as const }
    }

    setSaveError("Markdown could not be saved before leaving Bench.")
    toast("Markdown could not be saved before leaving Bench.")
    return {
      status: "block" as const,
      reason: "save_error" as const,
      message: "Markdown could not be saved before leaving Bench.",
    }
  }, [])
  const synchronize = useCallback(async () => {
    const current = fileStateRef.current
    if (current.saving) return { changed: false }

    try {
      const status = await readProjectExplorerEditableFileStatus({
        directory: props.directory,
        path: props.path,
      })
      const latest = fileStateRef.current
      const latestDirty = latest.markdown !== latest.savedMarkdown

      if (!status.exists) {
        const nextConflict = latestDirty
        const nextSaveError = nextConflict ? MARKDOWN_FILE_UNAVAILABLE_MESSAGE : undefined
        const changed =
          latest.exists ||
          latest.conflict !== nextConflict ||
          latest.saveError !== nextSaveError ||
          latest.loading

        if (!changed) return { changed: false }

        patchFileStateRef({
          exists: false,
          loading: false,
          conflict: nextConflict,
          saveError: nextSaveError,
        })
        setExists(false)
        setLoading(false)
        setConflict(nextConflict)
        setSaveError(nextSaveError)
        return { changed: true }
      }

      if (latest.exists && latest.version === status.version) {
        return { changed: false }
      }

      if (latestDirty) {
        const changed =
          !latest.exists || !latest.conflict || latest.saveError !== MARKDOWN_FILE_CHANGED_MESSAGE
        patchFileStateRef({
          exists: true,
          loading: false,
          conflict: true,
          saveError: MARKDOWN_FILE_CHANGED_MESSAGE,
        })
        setExists(true)
        setLoading(false)
        setConflict(true)
        setSaveError(MARKDOWN_FILE_CHANGED_MESSAGE)
        return { changed }
      }

      const next = await readProjectExplorerEditableFile({
        directory: props.directory,
        path: props.path,
      })
      const settled = fileStateRef.current
      if (settled.saving) return { changed: false }
      if (settled.markdown !== settled.savedMarkdown) {
        patchFileStateRef({
          exists: true,
          loading: false,
          conflict: true,
          saveError: MARKDOWN_FILE_CHANGED_MESSAGE,
        })
        setExists(true)
        setLoading(false)
        setConflict(true)
        setSaveError(MARKDOWN_FILE_CHANGED_MESSAGE)
        return { changed: true }
      }

      const nextVersion = next.version ?? ""
      const changed =
        !settled.exists ||
        settled.markdown !== next.content ||
        settled.savedMarkdown !== next.content ||
        settled.version !== nextVersion ||
        settled.conflict ||
        settled.saveError !== undefined ||
        settled.loading

      if (!changed) return { changed: false }

      patchFileStateRef({
        exists: true,
        loading: false,
        markdown: next.content,
        savedMarkdown: next.content,
        version: nextVersion,
        conflict: false,
        saveError: undefined,
      })
      setExists(true)
      setMarkdown(next.content)
      setSavedMarkdown(next.content)
      setVersion(nextVersion)
      setLoading(false)
      setConflict(false)
      setSaveError(undefined)
      editorRef.current?.setMarkdown(next.content)
      return { changed: true }
    } catch (error) {
      const latest = fileStateRef.current
      const latestDirty = latest.markdown !== latest.savedMarkdown
      const nextSaveError = error instanceof Error ? error.message : String(error)
      patchFileStateRef({
        loading: false,
      })
      setLoading(false)
      if (!latestDirty) return { changed: false }
      if (latestDirty && latest.saveError === nextSaveError) return { changed: false }
      patchFileStateRef({
        saveError: nextSaveError,
      })
      setSaveError(nextSaveError)
      return { changed: true }
    }
  }, [patchFileStateRef, props.directory, props.path])
  useRegisterBenchContextProvider({
    target: contextTarget,
    provider: contextProvider,
    semanticKey: contextSemanticKey,
    synchronize,
    leaveGuard,
  })
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
    if (previousSnapshot.directory !== props.directory || previousSnapshot.path !== props.path) {
      void flushMarkdownBenchPendingSave(previousSnapshot)
    }

    setMarkdown(props.initialFile.content)
    setSavedMarkdown(props.initialFile.content)
    setVersion(props.initialFile.version ?? "")
    setExists(true)
    setSaving(false)
    setLoading(false)
    setConflict(false)
    setSaveError(undefined)
    patchFileStateRef({
      exists: true,
      markdown: props.initialFile.content,
      savedMarkdown: props.initialFile.content,
      version: props.initialFile.version ?? "",
      saving: false,
      loading: false,
      conflict: false,
      saveError: undefined,
    })
    editorRef.current?.setMarkdown(props.initialFile.content)
  }, [patchFileStateRef, props.directory, props.initialFile, props.path])

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
    patchFileStateRef({
      loading: true,
      saveError: undefined,
    })
    try {
      const next = await readProjectExplorerEditableFile({
        directory: props.directory,
        path: props.path,
      })
      const nextVersion = next.version ?? ""
      patchFileStateRef({
        exists: true,
        markdown: next.content,
        savedMarkdown: next.content,
        version: nextVersion,
        conflict: false,
        saveError: undefined,
      })
      setExists(true)
      setMarkdown(next.content)
      setSavedMarkdown(next.content)
      setVersion(nextVersion)
      setConflict(false)
      editorRef.current?.setMarkdown(next.content)
    } catch (error) {
      const nextSaveError = error instanceof Error ? error.message : String(error)
      patchFileStateRef({
        saveError: nextSaveError,
      })
      setSaveError(nextSaveError)
    } finally {
      patchFileStateRef({
        loading: false,
      })
      setLoading(false)
    }
  }, [patchFileStateRef, props.directory, props.path])

  const save = useCallback(
    async (input?: { overwrite?: boolean }) => {
      if (!exists && !input?.overwrite) return
      if (!dirty && !input?.overwrite) return
      setSaving(true)
      setSaveError(undefined)
      patchFileStateRef({
        saving: true,
        saveError: undefined,
      })
      try {
        const saved = await saveProjectExplorerEditableFile({
          directory: props.directory,
          path: props.path,
          content: markdown,
          expectedVersion: input?.overwrite ? undefined : version,
        })
        const nextVersion = saved.version ?? ""
        patchFileStateRef({
          exists: true,
          savedMarkdown: saved.content,
          version: nextVersion,
          conflict: false,
          saving: false,
          saveError: undefined,
        })
        setExists(true)
        setSavedMarkdown(saved.content)
        setVersion(nextVersion)
        setConflict(false)
      } catch (error) {
        if (error instanceof ProjectExplorerFileVersionConflictError) {
          const status = await readProjectExplorerEditableFileStatus({
            directory: props.directory,
            path: props.path,
          }).catch(() => undefined)
          if (status && !status.exists) {
            patchFileStateRef({
              exists: false,
              conflict: true,
              saveError: MARKDOWN_FILE_UNAVAILABLE_MESSAGE,
            })
            setExists(false)
            setConflict(true)
            setSaveError(MARKDOWN_FILE_UNAVAILABLE_MESSAGE)
            return
          }
          patchFileStateRef({
            conflict: true,
            saveError: error.message,
          })
          setConflict(true)
          setSaveError(error.message)
        } else {
          const nextSaveError = error instanceof Error ? error.message : String(error)
          patchFileStateRef({
            saveError: nextSaveError,
          })
          setSaveError(nextSaveError)
        }
      } finally {
        patchFileStateRef({
          saving: false,
        })
        setSaving(false)
      }
    },
    [dirty, exists, markdown, patchFileStateRef, props.directory, props.path, version],
  )

  useEffect(() => {
    if (!exists || !dirty || saving || conflict) return
    const timeout = window.setTimeout(() => {
      void save()
    }, MARKDOWN_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [conflict, dirty, exists, save, saving])

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

  const syncSelectionToChat = useCallback(
    (selection: MarkdownBenchDocumentSelection) => {
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
    },
    [controller, props.path, setPromptDraft, version],
  )

  const setDocumentContentThemeMode = useCallback(
    (mode: string) => {
      if (!isMarkdownBenchContentThemeMode(mode)) return
      setContentThemeMode(mode)
    },
    [setContentThemeMode],
  )
  const changeMarkdown = useCallback(
    (nextMarkdown: string) => {
      patchFileStateRef({
        markdown: nextMarkdown,
      })
      setMarkdown(nextMarkdown)
    },
    [patchFileStateRef],
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
              label: exists ? "Overwrite file" : "Restore file",
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
            void reload()
            return
          }
          void synchronize()
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
    [conflict, dirty, exists, exportPdf, exporting, loading, reload, save, saving, synchronize],
  )

  const status = !exists
    ? "Unavailable"
    : conflict
      ? "Conflict"
      : saving
        ? "Saving..."
        : dirty
          ? "Unsaved"
          : "Saved"
  const subtitle = status === "Saved" ? props.path : `${props.path} · ${status}`
  const showUnavailableCleanState = !exists && !dirty

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
        {showUnavailableCleanState ? (
          <div className="flex h-full min-h-0 items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-border-base bg-surface-base px-5 py-4 text-center shadow-sm">
              <TriangleAlertIcon
                className="mx-auto mb-3 size-5 text-icon-warning-base"
                aria-hidden
              />
              <h2 className="text-sm font-medium text-text-base">File deleted or moved</h2>
              <p className="mt-2 text-sm text-text-weak">{props.path} no longer exists on disk.</p>
            </div>
          </div>
        ) : (
          <MarkdownBenchEditor
            ref={editorRef}
            markdown={markdown}
            version={version}
            dirty={dirty}
            saving={saving}
            conflict={conflict}
            contentFontScale={contentFontScale}
            contentTheme={contentTheme}
            onChange={changeMarkdown}
            onHistoryControlsChange={setHistoryControls}
            onSelectionChange={syncSelectionToChat}
          />
        )}
      </div>
    </BenchViewerShell>
  )
}
