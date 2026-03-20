import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import { Button } from "@buddy/ui"
import { AlertTriangleIcon, FileTextIcon, PlusIcon, RefreshCwIcon } from "lucide-react"
import {
  loadNotebookAgentsMd,
  NotebookAgentsMdVersionConflictError,
  saveNotebookAgentsMd,
} from "@/state/agents-md-actions"

type AgentsMdPanelProps = {
  directory: string
  refreshToken?: number
  className?: string
  style?: CSSProperties
}

const DEFAULT_AGENTS_MD_CONTENT = "# AGENTS.md\n\nAdd notebook-specific instructions for Buddy here.\n"
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

export function AgentsMdPanel(props: AgentsMdPanelProps) {
  const [exists, setExists] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [conflictMessage, setConflictMessage] = useState<string | undefined>(undefined)
  const requestCounterRef = useRef(0)
  const contentRef = useRef(content)
  const existsRef = useRef(exists)
  const savingRef = useRef(saving)
  const versionRef = useRef(version)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    existsRef.current = exists
  }, [exists])

  useEffect(() => {
    savingRef.current = saving
  }, [saving])

  useEffect(() => {
    versionRef.current = version
  }, [version])

  async function refresh(input?: { silent?: boolean }) {
    const requestID = requestCounterRef.current + 1
    requestCounterRef.current = requestID

    if (!input?.silent) {
      setLoading(true)
      setError(undefined)
      setConflictMessage(undefined)
    }

    try {
      const next = await loadNotebookAgentsMd(props.directory)
      if (requestID !== requestCounterRef.current) return

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
  }

  async function save(contentToSave: string, options?: { overwrite?: boolean }) {
    setSaving(true)
    setError(undefined)

    try {
      const saved = await saveNotebookAgentsMd({
        directory: props.directory,
        content: contentToSave,
        expectedVersion: options?.overwrite ? undefined : versionRef.current,
      })
      setExists(true)
      setVersion(saved.version)
      setContent(saved.content)
      setSavedContent(saved.content)
      setConflictMessage(undefined)
    } catch (saveError) {
      if (saveError instanceof NotebookAgentsMdVersionConflictError) {
        setConflictMessage(saveError.message)
        return
      }
      setError(stringifyError(saveError))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [props.directory, props.refreshToken])

  useEffect(() => {
    if (!exists) return
    if (conflictMessage) return
    if (content === savedContent) return
    if (saving) return

    const timer = window.setTimeout(() => {
      void save(contentRef.current)
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [conflictMessage, content, exists, savedContent, saving])

  const saveStateLabel = conflictMessage
    ? "Conflict"
    : saving
      ? "Saving..."
      : content === savedContent
        ? "Saved"
        : "Pending..."

  const onMount: OnMount = (_editor, monaco) => {
    _editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (!existsRef.current || savingRef.current) return
      void save(contentRef.current)
    })
  }

  return (
    <div className={`flex h-full min-h-0 flex-col gap-3 p-3 ${props.className ?? ""}`} style={props.style}>
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground leading-none">AGENTS.md</p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            Notebook-specific instructions loaded before each session. Autosaves after 1s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{saveStateLabel}</span>
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => void refresh()}
            disabled={loading || saving}
          >
            <RefreshCwIcon className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {conflictMessage ? (
        <div className="rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="size-4 shrink-0" />
            <p>{conflictMessage}</p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading || saving}>
              Reload
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void save(contentRef.current, { overwrite: true })
              }}
              disabled={loading || saving}
            >
              Overwrite
            </Button>
          </div>
        </div>
      ) : null}

      {loading && !exists ? (
        <div className="rounded-md border border-border/70 bg-background p-3 text-sm text-muted-foreground">
          Loading AGENTS.md...
        </div>
      ) : null}

      {!exists && !loading ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/50 px-4 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <FileTextIcon className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-medium leading-none">No AGENTS.md file</h3>
          <p className="mt-1.5 max-w-[220px] text-xs text-muted-foreground">
            Create one to add notebook-local behavior and constraints.
          </p>
          <Button
            size="sm"
            className="mt-5"
            onClick={() => {
              void save(DEFAULT_AGENTS_MD_CONTENT)
            }}
            disabled={loading || saving}
          >
            <PlusIcon className="mr-1.5 size-4" />
            Create AGENTS.md
          </Button>
        </div>
      ) : exists ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border/70 bg-background">
          <div className="h-full min-h-0">
            <Editor
              height="100%"
              path={`${props.directory}/AGENTS.md`}
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
