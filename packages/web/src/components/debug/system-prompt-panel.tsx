import type { CSSProperties } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@buddy/ui"
import {
  loadTeachingSessionState,
  type TeachingLlmOutboundSnapshot,
  type TeachingSessionSnapshot,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"

type SystemPromptPanelProps = {
  directory: string
  sessionID?: string
  refreshToken?: number
  className?: string
  style?: CSSProperties
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

function readSystemPromptText(entry: TeachingLlmOutboundSnapshot | undefined) {
  if (!entry) return undefined
  if (typeof entry.fullSystemPrompt === "string" && entry.fullSystemPrompt.trim().length > 0) {
    return entry.fullSystemPrompt
  }
  return undefined
}

function readLastOutboundEntry(runtime: TeachingSessionSnapshot | undefined) {
  if (!runtime) return undefined
  if (runtime.lastLlmOutbound) {
    return runtime.lastLlmOutbound
  }
  const history = runtime.llmOutboundHistory
  if (Array.isArray(history) && history.length > 0) {
    return history[history.length - 1]
  }
  return undefined
}

function formatIsoTime(value?: string) {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
}

export function SystemPromptPanel(props: SystemPromptPanelProps) {
  const [runtime, setRuntime] = useState<TeachingSessionSnapshot | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const requestCounterRef = useRef(0)
  const activeSessionBusy = useChatStore((state) => {
    const directoryState = state.directories[props.directory]
    if (!directoryState || !props.sessionID) return false
    return directoryState.sessionStatusByID[props.sessionID] === "busy"
  })

  const lastOutbound = useMemo(() => readLastOutboundEntry(runtime), [runtime])
  const systemPromptText = useMemo(() => readSystemPromptText(lastOutbound), [lastOutbound])
  const renderedAt = formatIsoTime(lastOutbound?.createdAt)
  const charCount = systemPromptText?.length ?? 0
  const approxTokens = Math.round(charCount / 4)

  async function refresh(input?: { silent?: boolean }) {
    if (!props.sessionID) {
      setRuntime(undefined)
      setError(undefined)
      setLoading(false)
      return
    }

    const requestID = requestCounterRef.current + 1
    requestCounterRef.current = requestID

    if (!input?.silent) {
      setLoading(true)
      setError(undefined)
    }

    try {
      const next = await loadTeachingSessionState(props.directory, props.sessionID)
      if (requestID !== requestCounterRef.current) return
      if (next) {
        setRuntime(next)
      } else {
        setRuntime((current) => (current?.sessionId === props.sessionID ? current : undefined))
      }
      setError(undefined)
    } catch (runtimeError) {
      if (requestID !== requestCounterRef.current) return
      setError(stringifyError(runtimeError))
    } finally {
      if (requestID === requestCounterRef.current && !input?.silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void refresh()
  }, [props.directory, props.sessionID, props.refreshToken])

  useEffect(() => {
    if (!props.sessionID || !activeSessionBusy) return

    const interval = window.setInterval(() => {
      void refresh({ silent: true })
    }, 750)

    return () => {
      window.clearInterval(interval)
    }
  }, [activeSessionBusy, props.directory, props.sessionID, props.refreshToken])

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 p-3 ${props.className ?? ""}`}
      style={props.style}
    >
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground leading-none">
            System Prompt
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            Exact system prompt from the most recent outbound LLM turn.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      {!props.sessionID ? (
        <div className="rounded-md border border-border/70 bg-background p-3 text-sm text-muted-foreground">
          Select a session to inspect system prompts.
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {props.sessionID ? (
        <div className="min-h-0 flex-1 rounded-md border border-border/70 bg-background">
          {systemPromptText ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                <span>Turn: {lastOutbound?.kind ?? "unknown"}</span>
                {renderedAt ? <span className="ml-3">Captured: {renderedAt}</span> : null}
                <span className="ml-3">~{approxTokens.toLocaleString()} tokens</span>
                <span className="ml-1">({charCount.toLocaleString()} chars)</span>
              </div>
              <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words p-3 text-[12px] leading-5 text-foreground font-mono">
                {systemPromptText}
              </pre>
            </div>
          ) : (
            <div className="p-3 text-sm text-muted-foreground">
              {loading || activeSessionBusy
                ? "Capturing the latest system prompt..."
                : "No system prompt has been recorded for this session yet."}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
