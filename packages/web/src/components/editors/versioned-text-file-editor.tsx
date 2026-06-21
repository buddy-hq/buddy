import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@buddy/ui"
import { AlertTriangleIcon, PlusIcon, RefreshCwIcon } from "lucide-react"
import type { editor as MonacoEditor } from "monaco-editor"
import { language } from "@/context/language"
import { useTheme } from "@/theme"

const AUTO_SAVE_DELAY_MS = 1000
const SAVE_FLASH_DURATION_MS = 1000

export type VersionedTextFileState = {
  path: string
  exists: boolean
  content: string
  version: string | null
}

export type VersionedTextFileSaveResult = {
  path: string
  content: string
  version: string | null
}

type VersionedTextFileEmptyState = {
  title: string
  description: string
  createLabel: string
  defaultContent: string
}

type VersionedTextFileFlushOptions = {
  retryFailedContent?: boolean
}

type VersionedTextFileReloadOptions = {
  silent?: boolean
}

export type VersionedTextFileFlushResult = "clean" | "saved" | "blocked"

export type VersionedTextFileEditorSnapshot = {
  path: string
  exists: boolean
  content: string
  version: string | null
  loading: boolean
  saving: boolean
  dirty: boolean
  conflict: string | undefined
  saveError: string | undefined
  saveState: "loading" | "saving" | "dirty" | "saved" | "conflict" | "save-error"
  lastFlushResult: VersionedTextFileFlushResult | undefined
}

type VersionedTextFileFlushState = {
  exists: boolean
  saving: boolean
  hasConflict: boolean
  content: string
  savedContent: string
  failedSaveContent: string | undefined
  retryFailedContent: boolean
}

type VersionedTextFileSaveRetryState = {
  error: string | undefined
  exists: boolean
  content: string
  savedContent: string
  failedSaveContent: string | undefined
}

type VersionedTextFileContentAfterSaveState = {
  existedBeforeSave: boolean
  currentContent: string
  requestedContent: string
}

type VersionedTextFileExternalRefreshState = {
  requestID: number
  latestRequestID: number
  saving: boolean
  hasConflict: boolean
  content: string
  savedContent: string
}

type VersionedTextFileEditorProps = {
  active?: boolean
  reloadKey?: string | number
  className?: string
  fallbackPath: string
  languageId: string
  emptyState?: VersionedTextFileEmptyState
  statusIndicator?: "dot" | "pill" | "none"
  errorPresentation?: "dialog" | "inline"
  reloadBehavior?: "activate" | "once"
  externalReloadIntervalMs?: number
  editorOptions?: MonacoEditor.IStandaloneEditorConstructionOptions
  onSnapshotChange?: (snapshot: VersionedTextFileEditorSnapshot) => void
  load: () => Promise<VersionedTextFileState>
  save: (input: {
    content: string
    expectedVersion?: string | null
  }) => Promise<VersionedTextFileSaveResult>
  isVersionConflictError: (error: unknown) => boolean
}

export type VersionedTextFileEditorHandle = {
  flushPendingSave: () => Promise<boolean>
  hasUnsavedChanges: () => boolean
  reloadFromDisk: (options?: VersionedTextFileReloadOptions) => Promise<void>
}

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function shouldSkipVersionedTextFileFlush(input: VersionedTextFileFlushState): boolean {
  if (!input.exists) return true
  if (input.saving) return true
  if (input.hasConflict) return true
  if (input.content === input.savedContent) return true
  return !input.retryFailedContent && input.content === input.failedSaveContent
}

export function shouldShowVersionedTextFileSaveRetry(
  input: VersionedTextFileSaveRetryState,
): boolean {
  if (!input.error) return false
  return (
    input.failedSaveContent !== undefined || (input.exists && input.content !== input.savedContent)
  )
}

export function resolveVersionedTextFileSaveRetryContent(input: {
  content: string
  failedSaveContent: string | undefined
}): string {
  return input.failedSaveContent ?? input.content
}

export function shouldUseSavedVersionedTextFileContent(
  input: VersionedTextFileContentAfterSaveState,
): boolean {
  return !input.existedBeforeSave || input.currentContent === input.requestedContent
}

export function shouldApplyVersionedTextFileExternalRefresh(
  input: VersionedTextFileExternalRefreshState,
): boolean {
  return (
    input.requestID === input.latestRequestID &&
    !input.saving &&
    !input.hasConflict &&
    input.content === input.savedContent
  )
}

export const VersionedTextFileEditor = forwardRef<
  VersionedTextFileEditorHandle,
  VersionedTextFileEditorProps
>(function VersionedTextFileEditor(props, ref) {
  const {
    active,
    className,
    editorOptions,
    emptyState,
    errorPresentation: errorPresentationProp,
    fallbackPath,
    externalReloadIntervalMs,
    isVersionConflictError,
    languageId,
    load,
    onSnapshotChange,
    reloadBehavior: reloadBehaviorProp,
    reloadKey,
    save,
    statusIndicator: statusIndicatorProp,
  } = props
  const { mode: colorMode } = useTheme()
  const isActive = active ?? true
  const statusIndicator = statusIndicatorProp ?? "dot"
  const errorPresentation = errorPresentationProp ?? "dialog"
  const reloadBehavior = reloadBehaviorProp ?? "activate"
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const [path, setPath] = useState("")
  const [exists, setExists] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [conflictMessage, setConflictMessage] = useState<string | undefined>(undefined)
  const [showSaved, setShowSaved] = useState(false)
  const [failedSaveContent, setFailedSaveContent] = useState<string | undefined>(undefined)
  const [lastFlushResult, setLastFlushResult] = useState<VersionedTextFileFlushResult | undefined>(
    undefined,
  )

  const requestCounterRef = useRef(0)
  const externalRefreshCounterRef = useRef(0)
  const didLoadOnceRef = useRef(false)
  const loadedReloadKeyRef = useRef<string | number | undefined>(undefined)
  const contentRef = useRef(content)
  const savedContentRef = useRef(savedContent)
  const existsRef = useRef(exists)
  const conflictMessageRef = useRef(conflictMessage)
  const savingRef = useRef(saving)
  const versionRef = useRef(version)
  const failedSaveContentRef = useRef<string | undefined>(undefined)
  const saveRef = useRef<
    (contentToSave: string, options?: { overwrite?: boolean }) => Promise<void>
  >(async () => undefined)

  const rememberFailedSaveContent = useCallback((nextContent: string | undefined) => {
    failedSaveContentRef.current = nextContent
    setFailedSaveContent(nextContent)
  }, [])

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    existsRef.current = exists
  }, [exists])

  useEffect(() => {
    savedContentRef.current = savedContent
  }, [savedContent])

  useEffect(() => {
    conflictMessageRef.current = conflictMessage
  }, [conflictMessage])

  useEffect(() => {
    savingRef.current = saving
  }, [saving])

  useEffect(() => {
    versionRef.current = version
  }, [version])

  useEffect(() => {
    if (failedSaveContentRef.current !== undefined && content !== failedSaveContentRef.current) {
      rememberFailedSaveContent(undefined)
    }
  }, [content, rememberFailedSaveContent])

  const refresh = useCallback(
    async (input?: { silent?: boolean }) => {
      const requestID = requestCounterRef.current + 1
      requestCounterRef.current = requestID

      if (!input?.silent) {
        setLoading(true)
        setError(undefined)
        setConflictMessage(undefined)
      }

      try {
        const next = await load()
        if (requestID !== requestCounterRef.current) return

        didLoadOnceRef.current = true
        loadedReloadKeyRef.current = reloadKey
        setPath(next.path)
        setExists(next.exists)
        setVersion(next.version)
        setContent(next.content)
        setSavedContent(next.content)
        setShowSaved(false)
        setError(undefined)
        setConflictMessage(undefined)
        rememberFailedSaveContent(undefined)
      } catch (readError) {
        if (requestID !== requestCounterRef.current) return
        setError(stringifyError(readError))
      } finally {
        if (requestID === requestCounterRef.current && !input?.silent) {
          setLoading(false)
        }
      }
    },
    [load, reloadKey, rememberFailedSaveContent],
  )

  const saveDocument = useCallback(
    async (contentToSave: string, options?: { overwrite?: boolean }) => {
      const existedBeforeSave = existsRef.current
      setSaving(true)
      setError(undefined)

      try {
        const saved = await save({
          content: contentToSave,
          expectedVersion: options?.overwrite ? undefined : versionRef.current,
        })
        setPath(saved.path)
        setExists(true)
        setVersion(saved.version)
        if (
          shouldUseSavedVersionedTextFileContent({
            existedBeforeSave,
            currentContent: contentRef.current,
            requestedContent: contentToSave,
          })
        ) {
          setContent(saved.content)
        }
        setSavedContent(saved.content)
        setConflictMessage(undefined)
        rememberFailedSaveContent(undefined)
        setShowSaved(true)
      } catch (saveError) {
        if (isVersionConflictError(saveError)) {
          rememberFailedSaveContent(undefined)
          setConflictMessage(stringifyError(saveError))
          return
        }
        rememberFailedSaveContent(contentToSave)
        setError(stringifyError(saveError))
      } finally {
        setSaving(false)
      }
    },
    [isVersionConflictError, rememberFailedSaveContent, save],
  )

  useEffect(() => {
    saveRef.current = saveDocument
  }, [saveDocument])

  const retrySave = useCallback(() => {
    if (savingRef.current) return
    if (conflictMessageRef.current) return
    if (!existsRef.current && failedSaveContentRef.current === undefined) return
    if (
      existsRef.current &&
      failedSaveContentRef.current === undefined &&
      contentRef.current === savedContentRef.current
    ) {
      return
    }
    const contentToSave = resolveVersionedTextFileSaveRetryContent({
      content: contentRef.current,
      failedSaveContent: failedSaveContentRef.current,
    })
    void saveRef.current(contentToSave)
  }, [])

  const flushPendingSave = useCallback(async (options?: VersionedTextFileFlushOptions) => {
    if (
      shouldSkipVersionedTextFileFlush({
        exists: existsRef.current,
        saving: savingRef.current,
        hasConflict: conflictMessageRef.current !== undefined,
        content: contentRef.current,
        savedContent: savedContentRef.current,
        failedSaveContent: failedSaveContentRef.current,
        retryFailedContent: options?.retryFailedContent ?? false,
      })
    ) {
      const result: VersionedTextFileFlushResult =
        conflictMessageRef.current || failedSaveContentRef.current !== undefined
          ? "blocked"
          : "clean"
      setLastFlushResult(result)
      return result
    }

    const contentToSave = contentRef.current
    const savedBeforeFlush = savedContentRef.current
    await saveRef.current(contentToSave)
    const result: VersionedTextFileFlushResult =
      conflictMessageRef.current || savedContentRef.current === savedBeforeFlush
        ? "blocked"
        : "saved"
    setLastFlushResult(result)
    return result
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      flushPendingSave: async () => {
        const result = await flushPendingSave({ retryFailedContent: true })
        return result !== "blocked"
      },
      hasUnsavedChanges: () =>
        existsRef.current &&
        !conflictMessageRef.current &&
        contentRef.current !== savedContentRef.current,
      reloadFromDisk: refresh,
    }),
    [flushPendingSave, refresh],
  )

  useEffect(() => {
    if (!isActive) return

    if (reloadBehavior === "activate") {
      void refresh()
      return
    }

    const reloadKeyChanged = loadedReloadKeyRef.current !== reloadKey
    if (didLoadOnceRef.current && !reloadKeyChanged) return
    void refresh()
  }, [isActive, refresh, reloadBehavior, reloadKey])

  useEffect(() => {
    if (!isActive || !externalReloadIntervalMs || externalReloadIntervalMs <= 0) return

    const canApplyExternalRefresh = (requestID: number) =>
      shouldApplyVersionedTextFileExternalRefresh({
        requestID,
        latestRequestID: externalRefreshCounterRef.current,
        saving: savingRef.current,
        hasConflict: conflictMessageRef.current !== undefined,
        content: contentRef.current,
        savedContent: savedContentRef.current,
      })

    const checkForExternalChanges = async () => {
      const requestID = externalRefreshCounterRef.current + 1
      externalRefreshCounterRef.current = requestID

      if (!canApplyExternalRefresh(requestID)) return

      try {
        const next = await load()
        if (!canApplyExternalRefresh(requestID)) return
        if (next.version === versionRef.current) return
        setPath(next.path)
        setExists(next.exists)
        setVersion(next.version)
        setContent(next.content)
        setSavedContent(next.content)
        setError(undefined)
        setConflictMessage(undefined)
        rememberFailedSaveContent(undefined)
      } catch {
        // A background refresh must not replace the current editor with a transient read error.
      }
    }

    const timer = window.setInterval(() => {
      void checkForExternalChanges()
    }, externalReloadIntervalMs)
    return () => {
      externalRefreshCounterRef.current += 1
      window.clearInterval(timer)
    }
  }, [externalReloadIntervalMs, isActive, load, rememberFailedSaveContent])

  useEffect(() => {
    if (isActive) return
    void flushPendingSave().catch(() => undefined)
  }, [flushPendingSave, isActive])

  useEffect(() => {
    return () => {
      void flushPendingSave().catch(() => undefined)
    }
  }, [flushPendingSave])

  useEffect(() => {
    if (!isActive) return
    if (!exists) return
    if (conflictMessage) return
    if (content === savedContent) return
    if (content === failedSaveContentRef.current) return
    if (saving) return

    const timer = window.setTimeout(() => {
      void saveRef.current(contentRef.current)
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [conflictMessage, content, exists, isActive, savedContent, saving])

  useEffect(() => {
    if (!showSaved) return
    const timer = window.setTimeout(() => setShowSaved(false), SAVE_FLASH_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [showSaved])

  const saveStatusState = conflictMessage
    ? "conflict"
    : saving
      ? "saving"
      : error
        ? "save-error"
        : exists && content !== savedContent
          ? "unsaved"
          : "saved"
  const statusText =
    saveStatusState === "conflict"
      ? language.t("markdownEditor.conflict")
      : saveStatusState === "saving"
        ? language.t("common.saving")
        : saveStatusState === "save-error"
          ? language.t("teaching.editor.saveFailed")
          : saveStatusState === "unsaved"
            ? language.t("teaching.editor.unsaved")
            : language.t("teaching.editor.saved")
  const hasUnsaved = exists && !conflictMessage && content !== savedContent && !saving
  const showSaveRetry = shouldShowVersionedTextFileSaveRetry({
    error,
    exists,
    content,
    savedContent,
    failedSaveContent,
  })
  const saveRetryDisabled = loading || saving || Boolean(conflictMessage)

  useEffect(() => {
    onSnapshotChange?.({
      path: path || fallbackPath,
      exists,
      content,
      version,
      loading,
      saving,
      dirty: exists && content !== savedContent,
      conflict: conflictMessage,
      saveError: error,
      saveState: loading
        ? "loading"
        : conflictMessage
          ? "conflict"
          : saving
            ? "saving"
            : error
              ? "save-error"
              : exists && content !== savedContent
                ? "dirty"
                : "saved",
      lastFlushResult,
    })
  }, [
    conflictMessage,
    content,
    error,
    exists,
    fallbackPath,
    lastFlushResult,
    loading,
    onSnapshotChange,
    path,
    savedContent,
    saving,
    version,
  ])

  function layoutEditor() {
    const editor = editorRef.current
    const container = editorContainerRef.current
    if (!editor || !container) return

    const rect = container.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    editor.layout({ width: rect.width, height: rect.height })
  }

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (!existsRef.current || savingRef.current) return
      void saveRef.current(contentRef.current)
    })
    layoutEditor()
  }

  useEffect(() => {
    if (!isActive) return
    const raf = window.requestAnimationFrame(() => {
      layoutEditor()
    })
    const timer = window.setTimeout(() => {
      layoutEditor()
    }, 80)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [isActive, exists, path])

  useEffect(() => {
    if (!isActive) return
    const container = editorContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      layoutEditor()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [isActive])

  const editorPath = path || fallbackPath

  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col gap-3 p-3 ${className ?? ""}`}>
      {statusIndicator === "dot" && exists && !conflictMessage ? (
        <div className="flex justify-end">
          <span
            className={`size-2 rounded-full ${hasUnsaved ? "bg-surface-warning-base" : showSaved ? "bg-surface-success-base" : "bg-transparent"}`}
          />
        </div>
      ) : null}

      {statusIndicator === "pill" ? (
        <div className="flex justify-end">
          <span className="rounded-md border bg-background-base px-2 py-1 text-[11px] text-text-weak">
            {statusText}
          </span>
        </div>
      ) : null}

      {error && errorPresentation === "dialog" ? (
        <Dialog
          open={!!error}
          onOpenChange={(open) => {
            if (!open) setError(undefined)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language.t("markdownEditor.saveError")}</DialogTitle>
              <DialogDescription>{error}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setError(undefined)}>
                {language.t("markdownEditor.dismiss")}
              </Button>
              {showSaveRetry ? (
                <Button type="button" onClick={retrySave} disabled={saveRetryDisabled}>
                  <RefreshCwIcon className="size-4" />
                  {language.t("markdownEditor.retrySave")}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {error && errorPresentation === "inline" ? (
        <div className="flex flex-col gap-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-3 py-2 text-sm text-icon-critical-base sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 flex-1">{error}</p>
          {showSaveRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saveRetryDisabled}
              onClick={retrySave}
              className="shrink-0 text-text-base"
            >
              <RefreshCwIcon className="size-3.5" />
              {language.t("markdownEditor.retrySave")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {conflictMessage ? (
        <div className="rounded-md border border-border-warning-base/50 bg-surface-warning-weak px-3 py-2 text-xs text-text-on-warning-weak">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="size-4 shrink-0" />
            <p>{conflictMessage}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading || saving}
            >
              {language.t("markdownEditor.reload")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void saveDocument(contentRef.current, { overwrite: true })
              }}
              disabled={loading || saving}
            >
              {language.t("markdownEditor.overwrite")}
            </Button>
          </div>
        </div>
      ) : null}

      {loading && !exists ? (
        <div className="rounded-md border border-border-base/70 bg-background-base p-3 text-sm text-text-weak">
          {language.t("markdownEditor.loading")}
        </div>
      ) : null}

      {!exists && !loading && emptyState ? (
        <button
          type="button"
          onClick={() => {
            void saveDocument(emptyState.defaultContent)
          }}
          disabled={loading || saving}
          className="group flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/40 bg-surface-weak/5 px-4 py-10 text-center transition-all hover:border-border-base/80 hover:bg-surface-weak/30"
        >
          <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-surface-weak transition-transform group-hover:scale-105 group-hover:shadow-sm">
            <PlusIcon className="size-4 text-text-weak transition-colors group-hover:text-text-base" />
          </div>
          <h3 className="text-[13px] font-medium text-text-base transition-colors group-hover:text-text-strong">
            {emptyState.createLabel}
          </h3>
          <p className="mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-text-weak transition-colors group-hover:text-text-weak/90">
            {emptyState.description}
          </p>
        </button>
      ) : exists ? (
        <div className="min-h-[260px] flex-1 overflow-hidden rounded-md border border-border-base/70 bg-background-base">
          <div ref={editorContainerRef} className="h-full min-h-[260px]">
            <Editor
              height="100%"
              path={editorPath}
              language={languageId}
              theme={colorMode === "dark" ? "vs-dark" : "light"}
              value={content}
              onMount={onMount}
              onChange={(nextValue) => {
                setContent(nextValue ?? "")
              }}
              options={{
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                wordWrap: "off",
                lineNumbers: "on",
                ...editorOptions,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
})
