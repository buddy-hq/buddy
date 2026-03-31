import { useCallback, useEffect, useRef, useState } from "react"
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
import { AlertTriangleIcon, PlusIcon } from "lucide-react"
import type { editor as MonacoEditor } from "monaco-editor"
import { language } from "@/context/language"

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

const AUTO_SAVE_DELAY_MS = 1000

function stringifyError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function MarkdownFileEditor(props: MarkdownFileEditorProps) {
  const isActive = props.active ?? true
  const { isVersionConflictError, load, reloadKey, save: saveMarkdown } = props
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const [path, setPath] = useState<string>("")
  const [exists, setExists] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [conflictMessage, setConflictMessage] = useState<string | undefined>(undefined)
  const [showSaved, setShowSaved] = useState(false)

  const requestCounterRef = useRef(0)
  const contentRef = useRef(content)
  const savedContentRef = useRef(savedContent)
  const existsRef = useRef(exists)
  const conflictMessageRef = useRef(conflictMessage)
  const savingRef = useRef(saving)
  const versionRef = useRef(version)
  const saveRef = useRef<
    (contentToSave: string, options?: { overwrite?: boolean }) => Promise<void>
  >(async () => undefined)

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

        setPath(next.path)
        setExists(next.exists)
        setVersion(next.version)
        setContent(next.content)
        setSavedContent(next.content)
        setError(undefined)
        setConflictMessage(undefined)
      } catch (readError) {
        if (requestID !== requestCounterRef.current) return
        setError(stringifyError(readError))
      } finally {
        if (requestID === requestCounterRef.current && !input?.silent) {
          setLoading(false)
        }
      }
    },
    [load],
  )

  const save = useCallback(
    async (contentToSave: string, options?: { overwrite?: boolean }) => {
      setSaving(true)
      setError(undefined)

      try {
        const saved = await saveMarkdown({
          content: contentToSave,
          expectedVersion: options?.overwrite ? undefined : versionRef.current,
        })
        setPath(saved.path)
        setExists(true)
        setVersion(saved.version)
        setContent(saved.content)
        setSavedContent(saved.content)
        setConflictMessage(undefined)
      } catch (saveError) {
        if (isVersionConflictError(saveError)) {
          setConflictMessage(stringifyError(saveError))
          return
        }
        setError(stringifyError(saveError))
      } finally {
        setSaving(false)
      }
    },
    [isVersionConflictError, saveMarkdown],
  )

  useEffect(() => {
    saveRef.current = save
  }, [save])

  const flushPendingSave = useCallback(async () => {
    if (!existsRef.current) return
    if (savingRef.current) return
    if (conflictMessageRef.current) return
    if (contentRef.current === savedContentRef.current) return

    await saveMarkdown({
      content: contentRef.current,
      expectedVersion: versionRef.current,
    })
  }, [saveMarkdown])

  useEffect(() => {
    if (!isActive) return
    void refresh()
  }, [isActive, refresh, reloadKey])

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
    if (saving) return

    const timer = window.setTimeout(() => {
      void saveRef.current(contentRef.current)
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [conflictMessage, content, exists, isActive, savedContent, saving])

  useEffect(() => {
    if (!savedContent) return
    setShowSaved(true)
    const timer = window.setTimeout(() => setShowSaved(false), 1000)
    return () => window.clearTimeout(timer)
  }, [savedContent])

  const hasUnsaved = exists && !conflictMessage && content !== savedContent && !saving

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
      void save(contentRef.current)
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

  const editorPath = path || props.fallbackPath

  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col gap-3 p-3 ${props.className ?? ""}`}>
      {exists && !conflictMessage ? (
        <div className="flex justify-end">
          <span
            className={`size-2 rounded-full ${hasUnsaved ? "bg-amber-500" : showSaved ? "bg-emerald-500" : "bg-transparent"}`}
          />
        </div>
      ) : null}
      {error ? (
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
              <Button variant="outline" onClick={() => setError(undefined)}>
                {language.t("markdownEditor.dismiss")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {conflictMessage ? (
        <div className="rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
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
                void save(contentRef.current, { overwrite: true })
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

      {!exists && !loading ? (
        <button
          type="button"
          onClick={() => {
            void save(props.defaultContent)
          }}
          disabled={loading || saving}
          className="group flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/40 bg-surface-weak/5 px-4 py-10 text-center transition-all hover:border-border-base/80 hover:bg-surface-weak/30"
        >
          <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-surface-weak transition-transform group-hover:scale-105 group-hover:shadow-sm">
            <PlusIcon className="size-4 text-text-weak transition-colors group-hover:text-text-base" />
          </div>
          <h3 className="text-[13px] font-medium text-text-base transition-colors group-hover:text-text-strong">
            {props.createLabel}
          </h3>
          <p className="mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-text-weak transition-colors group-hover:text-text-weak/90">
            {props.emptyDescription}
          </p>
        </button>
      ) : exists ? (
        <div className="min-h-[260px] flex-1 overflow-hidden rounded-md border border-border-base/70 bg-background-base">
          <div ref={editorContainerRef} className="h-full min-h-[260px]">
            <Editor
              height="100%"
              path={editorPath}
              language="markdown"
              theme="vs-dark"
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
                wordWrap: "on",
                lineNumbers: "on",
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
