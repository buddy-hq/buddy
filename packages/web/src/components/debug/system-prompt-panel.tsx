import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPatch } from "diff"
import { Button, Input } from "@buddy/ui"
import { language } from "@/context/language"
import {
  loadTeachingSessionState,
  type TeachingLlmOutboundSnapshot,
  type TeachingSessionSnapshot,
} from "@/state/chat-actions"
import { useChatStore } from "@/state/chat-store"
import { isSessionStatusActive } from "@/state/session-status"

function isPatchAdditionLine(line: string) {
  return line.startsWith("+") && !line.startsWith("+++")
}

function isPatchDeletionLine(line: string) {
  return line.startsWith("-") && !line.startsWith("---")
}

function isPatchHeaderLine(line: string) {
  return (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("Index: ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("@@")
  )
}

function PromptDiffView({ patch }: { patch: string }) {
  const lines = patch.split("\n")
  const seen = new Map<string, number>()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-5">
      {lines.map((line) => {
        const occurrence = seen.get(line) ?? 0
        seen.set(line, occurrence + 1)
        const className = isPatchAdditionLine(line)
          ? "text-icon-success-base"
          : isPatchDeletionLine(line)
            ? "text-icon-critical-base"
            : isPatchHeaderLine(line)
              ? "font-medium text-text-weak"
              : "text-text-base"

        return (
          <div key={`${line}:${occurrence}`} className={className}>
            {line}
          </div>
        )
      })}
    </div>
  )
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>

  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"))
  const seen = new Map<string, number>()

  return (
    <>
      {parts.map((part) => {
        const occurrence = seen.get(part) ?? 0
        seen.set(part, occurrence + 1)
        const key = `${part}:${occurrence}`
        return part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={key}
            className="rounded-sm bg-surface-warning-base/30 px-0.5 font-semibold text-icon-warning-base"
          >
            {part}
          </mark>
        ) : (
          <span key={key}>{part}</span>
        )
      })}
    </>
  )
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

type SystemPromptPanelProps = {
  directory: string
  sessionID?: string
  refreshToken?: number
  className?: string
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
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  })
}

export function SystemPromptPanel(props: SystemPromptPanelProps) {
  const { directory, sessionID, refreshToken, className } = props
  const [runtime, setRuntime] = useState<TeachingSessionSnapshot | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [searchQuery, setSearchQuery] = useState("")
  const [showDiff, setShowDiff] = useState(false)
  const requestCounterRef = useRef(0)
  const currentPromptRef = useRef<string | undefined>(undefined)
  const previousPromptRef = useRef<string | undefined>(undefined)
  const activeSessionBusy = useChatStore((state) => {
    const directoryState = state.directories[directory]
    if (!directoryState || !sessionID) return false
    return isSessionStatusActive(directoryState.sessionStatusByID[sessionID])
  })

  const lastOutbound = useMemo(() => readLastOutboundEntry(runtime), [runtime])
  const systemPromptText = useMemo(() => readSystemPromptText(lastOutbound), [lastOutbound])
  const renderedAt = formatIsoTime(lastOutbound?.createdAt)
  const charCount = systemPromptText?.length ?? 0
  const approxTokens = Math.round(charCount / 4)
  const hasPromptDiff =
    currentPromptRef.current !== undefined &&
    previousPromptRef.current !== undefined &&
    previousPromptRef.current !== currentPromptRef.current

  const patch = useMemo(() => {
    if (
      !showDiff ||
      !hasPromptDiff ||
      !previousPromptRef.current ||
      !currentPromptRef.current ||
      previousPromptRef.current === currentPromptRef.current
    ) {
      return null
    }
    return createPatch("system-prompt", previousPromptRef.current, currentPromptRef.current)
  }, [hasPromptDiff, showDiff])

  const refresh = useCallback(
    async (input?: { silent?: boolean }) => {
      if (!sessionID) {
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
        const next = await loadTeachingSessionState(directory, sessionID)
        if (requestID !== requestCounterRef.current) return
        if (next) {
          const newOutbound = readLastOutboundEntry(next)
          const newPromptText = readSystemPromptText(newOutbound)

          if (newPromptText) {
            if (
              currentPromptRef.current !== undefined &&
              currentPromptRef.current !== newPromptText
            ) {
              previousPromptRef.current = currentPromptRef.current
            }

            currentPromptRef.current = newPromptText
          }

          setRuntime(next)
        } else {
          setRuntime((current) => (current?.sessionId === sessionID ? current : undefined))
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
    },
    [directory, sessionID],
  )

  useEffect(() => {
    currentPromptRef.current = undefined
    previousPromptRef.current = undefined
    setShowDiff(false)
    setSearchQuery("")
  }, [directory, sessionID])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshToken])

  useEffect(() => {
    if (!sessionID || !activeSessionBusy) return

    const interval = window.setInterval(() => {
      void refresh({ silent: true })
    }, 750)

    return () => {
      window.clearInterval(interval)
    }
  }, [activeSessionBusy, refresh, refreshToken, sessionID])

  return (
    <div className={`flex h-full min-h-0 flex-col gap-3 p-3 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-weak leading-none">
            {language.t("debug.systemPrompt.title")}
          </p>
          <p className="text-xs text-text-weak line-clamp-2">
            {language.t("debug.systemPrompt.description")}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {hasPromptDiff && (
            <Button
              variant={showDiff ? "secondary" : "ghost"}
              size="sm"
              className="px-2"
              onClick={() => setShowDiff((current) => !current)}
            >
              {showDiff
                ? language.t("debug.systemPrompt.viewFull")
                : language.t("debug.systemPrompt.viewDiff")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {language.t("common.refresh")}
          </Button>
        </div>
      </div>

      {!sessionID ? (
        <div className="rounded-md border border-border-base/70 bg-background-base p-3 text-sm text-text-weak">
          {language.t("debug.systemPrompt.selectSession")}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}

      {sessionID ? (
        <div className="min-h-0 flex-1 rounded-md border border-border-base/70 bg-background-base">
          {systemPromptText ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-border-base/60 px-3 py-2 text-[11px] text-text-weak">
                <span>
                  {language.t("debug.systemPrompt.turnPrefix")}{" "}
                  {lastOutbound?.kind ?? language.t("debug.systemPrompt.unknown")}
                </span>
                {renderedAt ? (
                  <span className="ml-3">
                    {language.t("debug.systemPrompt.capturedPrefix")} {renderedAt}
                  </span>
                ) : null}
                <span className="ml-3">
                  ~{approxTokens.toLocaleString()} {language.t("debug.systemPrompt.tokensSuffix")}
                </span>
                <span className="ml-1">
                  ({charCount.toLocaleString()} {language.t("debug.systemPrompt.charsSuffix")})
                </span>
              </div>
              <div className="border-b border-border-base/60 px-3 py-2">
                <Input
                  placeholder={language.t("debug.systemPrompt.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {showDiff && patch ? (
                <PromptDiffView patch={patch} />
              ) : (
                <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words p-3 text-[12px] leading-5 text-text-base font-mono">
                  <HighlightedText text={systemPromptText} query={searchQuery} />
                </pre>
              )}
            </div>
          ) : (
            <div className="p-3 text-sm text-text-weak">
              {loading || activeSessionBusy
                ? language.t("debug.systemPrompt.capturing")
                : language.t("debug.systemPrompt.noneRecorded")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
