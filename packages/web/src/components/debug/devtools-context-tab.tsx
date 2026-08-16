import { useEffect, useMemo, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@buddy/ui"
import { Markdown } from "@/components/markdown/Markdown"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"
import { getSessionContextMetrics } from "@/state/context-metrics"
import { useChatStore } from "@/state/chat-store"
import { HISTORY_TRANSCRIPT_MESSAGE_LIMIT } from "@/state/session-messages"
import {
  getTranscriptSessionMeta,
  loadOlderTranscriptMessages,
  loadTranscriptMessages,
  useTranscriptSessionMessages,
  useTranscriptSessionMeta,
} from "@/state/transcript-repository"
import {
  estimateDevToolsContextBreakdown,
  type DevToolsContextBreakdownKey,
} from "./devtools-context-breakdown"
import { createDevToolsContextFormatter } from "./devtools-context-format"
import { createDevToolsContextRows, type DevToolsContextRow } from "./devtools-context-rows"

type DevToolsContextTabProps = {
  directory: string
  sessionID?: string
}

type ContextStat = {
  label: string
  value: string
  emphasis?: boolean
}

type TokenSortKey = "input" | "output"
type TokenSortDirection = "asc" | "desc"
type TokenSort = {
  key: TokenSortKey
  direction: TokenSortDirection
}

const EMPTY_PROVIDERS: ProviderInfo[] = []
const TRANSCRIPT_LOAD_POLL_MS = 50
const VERBOSE_SWITCH_ID = "buddy-devtools-context-verbose"
const SYSTEM_PROMPT_CACHE_KEY = "buddy-devtools-context-system-prompt"
const BREAKDOWN_COLORS = {
  system: "var(--syntax-info)",
  user: "var(--syntax-success)",
  assistant: "var(--syntax-property)",
  tool: "var(--syntax-warning)",
  other: "var(--syntax-comment)",
} satisfies Record<DevToolsContextBreakdownKey, string>
const BREAKDOWN_LABELS = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tool Calls",
  other: "Other",
} satisfies Record<DevToolsContextBreakdownKey, string>

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function errorMessage<TError>(error: TError) {
  return error instanceof Error ? error.message : String(error)
}

function safeStringify<TValue>(value: TValue) {
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return `Unable to render JSON: ${errorMessage(error)}`
  }
}

function useCompleteTranscriptLoader(directory: string, sessionID: string | undefined) {
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!sessionID) return undefined

    const activeSessionID = sessionID
    let cancelled = false

    async function loadCompleteTranscript() {
      setError(undefined)

      try {
        await loadTranscriptMessages(directory, activeSessionID, {
          limit: HISTORY_TRANSCRIPT_MESSAGE_LIMIT,
        })

        for (;;) {
          if (cancelled) return
          const meta = getTranscriptSessionMeta(directory, activeSessionID)
          if (meta.complete || !meta.cursor) return
          if (meta.loading) {
            await sleep(TRANSCRIPT_LOAD_POLL_MS)
            continue
          }
          await loadOlderTranscriptMessages(directory, activeSessionID)
        }
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError))
      }
    }

    void loadCompleteTranscript()

    return () => {
      cancelled = true
    }
  }, [directory, sessionID])

  return error
}

function ContextStatCell(props: ContextStat) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-weaker">
        {props.label}
      </div>
      <div
        className={cn(
          "min-w-0 truncate font-medium text-text-strong",
          props.emphasis ? "text-base" : "text-sm",
        )}
        title={props.value}
      >
        {props.value}
      </div>
    </div>
  )
}

function contextCounts(messages: MessageWithParts[]) {
  return messages.reduce(
    (counts, message) => ({
      all: counts.all + 1,
      user: counts.user + (message.info.role === "user" ? 1 : 0),
      assistant: counts.assistant + (message.info.role === "assistant" ? 1 : 0),
    }),
    {
      all: 0,
      user: 0,
      assistant: 0,
    },
  )
}

function latestSystemPrompt(messages: MessageWithParts[], revertMessageID: string | undefined) {
  const userMessages = messages.filter((message) => message.info.role === "user")
  const visibleUserMessages = revertMessageID
    ? userMessages.filter((message) => message.info.id < revertMessageID)
    : userMessages
  const message = visibleUserMessages.findLast((entry) => {
    const system = entry.info.role === "user" ? entry.info.system : undefined
    return !!system?.trim()
  })

  if (!message || message.info.role !== "user") return undefined
  const trimmed = message.info.system?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function ContextBreakdown(props: {
  messages: MessageWithParts[]
  inputTokens?: number
  system?: string
}) {
  const breakdown = useMemo(
    () =>
      estimateDevToolsContextBreakdown({
        messages: props.messages,
        inputTokens: props.inputTokens,
        systemPrompt: props.system,
      }),
    [props.inputTokens, props.messages, props.system],
  )

  if (breakdown.length === 0) return null

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Context Breakdown</CardTitle>
        <CardDescription>
          Estimated composition of the current input context. Other includes tool definitions and
          provider overhead.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-base">
          {breakdown.map((segment) => (
            <div
              key={segment.key}
              className="h-full"
              style={{
                width: `${segment.width}%`,
                backgroundColor: BREAKDOWN_COLORS[segment.key],
              }}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 @[36rem]:grid-cols-5">
          {breakdown.map((segment) => (
            <div
              key={segment.key}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border-weaker-base bg-background-base px-2 py-1.5"
            >
              <div
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: BREAKDOWN_COLORS[segment.key] }}
              />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-text-base">
                  {BREAKDOWN_LABELS[segment.key]}
                </div>
                <div className="text-[11px] text-text-weaker">
                  {segment.percent.toLocaleString()}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function rowTypeLabel(row: DevToolsContextRow) {
  if (row.kind === "message") return row.status ?? "message"
  if (row.kind === "tool") return "tool"
  return "step"
}

function rowName(row: DevToolsContextRow) {
  if (row.kind === "tool") return row.label
  if (row.kind === "step") return "step-finish"
  return ""
}

function rowDisplayID(row: DevToolsContextRow) {
  const separatorIndex = row.id.indexOf("_")
  if (separatorIndex === -1) return row.id
  return row.id.slice(separatorIndex + 1)
}

function displayID(value: string | undefined) {
  if (!value) return "—"
  const separatorIndex = value.indexOf("_")
  if (separatorIndex === -1) return value
  return value.slice(separatorIndex + 1)
}

function tokenSortValue(row: DevToolsContextRow, key: TokenSortKey) {
  return key === "input" ? row.tokens.input?.value : row.tokens.output?.value
}

function compareTokenRows(left: DevToolsContextRow, right: DevToolsContextRow, sort: TokenSort) {
  const leftValue = tokenSortValue(left, sort.key)
  const rightValue = tokenSortValue(right, sort.key)

  if (leftValue === undefined && rightValue === undefined) return 0
  if (leftValue === undefined) return 1
  if (rightValue === undefined) return -1

  return sort.direction === "asc" ? leftValue - rightValue : rightValue - leftValue
}

function nextTokenSort(current: TokenSort | undefined, key: TokenSortKey): TokenSort | undefined {
  if (!current || current.key !== key) {
    return { key, direction: "desc" }
  }
  if (current.direction === "desc") {
    return { key, direction: "asc" }
  }
  return undefined
}

function sortIndicator(sort: TokenSort | undefined, key: TokenSortKey) {
  if (!sort || sort.key !== key) return "↕"
  return sort.direction === "asc" ? "↑" : "↓"
}

function RawContextRow(props: {
  row: DevToolsContextRow
  formatter: ReturnType<typeof createDevToolsContextFormatter>
  expanded: boolean
  onToggle: () => void
}) {
  const row = props.row

  return (
    <>
      <TableRow
        tabIndex={0}
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          props.onToggle()
        }}
        className="cursor-pointer"
        aria-expanded={props.expanded}
      >
        <TableCell
          className={cn(
            "w-20 text-left align-middle text-[11px] font-medium uppercase tracking-wide text-text-weaker",
            row.nested && "pl-6",
          )}
        >
          {rowTypeLabel(row)}
        </TableCell>
        <TableCell className="w-24 text-left align-middle font-mono text-[11px] text-text-weak">
          {props.formatter.token(row.tokens.input)}
        </TableCell>
        <TableCell className="w-24 text-left align-middle font-mono text-[11px] text-text-weak">
          {props.formatter.token(row.tokens.output)}
        </TableCell>
        <TableCell className="w-32 text-left align-middle text-xs font-medium text-text-base">
          {rowName(row)}
        </TableCell>
        <TableCell className="min-w-64 text-left align-middle font-mono text-[11px] text-text-base">
          {rowDisplayID(row)}
        </TableCell>
        <TableCell className="text-left align-middle text-[11px] text-text-weaker">
          {row.detail}
        </TableCell>
      </TableRow>
      {props.expanded ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="p-0">
            <pre className="max-h-80 select-text overflow-auto whitespace-pre-wrap border-b border-border-weaker-base bg-surface-base/40 px-3 py-3 font-mono text-[11px] leading-relaxed text-text-weak">
              {safeStringify(row.json)}
            </pre>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

function RawMessagesSection(props: {
  messages: MessageWithParts[]
  verbose: boolean
  formatter: ReturnType<typeof createDevToolsContextFormatter>
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set())
  const [tokenSort, setTokenSort] = useState<TokenSort>()
  const rows = useMemo(
    () => createDevToolsContextRows({ messages: props.messages, verbose: props.verbose }),
    [props.messages, props.verbose],
  )
  const displayRows = useMemo(() => {
    if (!tokenSort) return rows
    return rows
      .map((row, index) => ({ row, index }))
      .toSorted((left, right) => {
        const tokenComparison = compareTokenRows(left.row, right.row, tokenSort)
        return tokenComparison === 0 ? left.index - right.index : tokenComparison
      })
      .map((entry) => entry.row)
  }, [rows, tokenSort])
  const toggleRow = (rowKey: string) => {
    setExpandedRows((current) => {
      const next = new Set(current)
      if (next.has(rowKey)) {
        next.delete(rowKey)
      } else {
        next.add(rowKey)
      }
      return next
    })
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Raw messages</CardTitle>
        <CardDescription>
          {props.verbose
            ? `${rows.length.toLocaleString()} rows including tool calls and LLM steps.`
            : `${rows.length.toLocaleString()} message rows. Turn on verbose for tool calls and LLM steps.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border border-border-base bg-background-base">
          <Table className="text-left">
            <TableHeader>
              <TableRow>
                <TableHead className="w-20 text-left text-[10px] uppercase tracking-wide text-text-weaker">
                  Type
                </TableHead>
                <TableHead className="w-24 text-left font-mono text-[10px] uppercase tracking-wide text-text-weaker">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-left uppercase tracking-wide"
                    onClick={() => setTokenSort((current) => nextTokenSort(current, "input"))}
                  >
                    <span>In</span>
                    <span>{sortIndicator(tokenSort, "input")}</span>
                  </button>
                </TableHead>
                <TableHead className="w-24 text-left font-mono text-[10px] uppercase tracking-wide text-text-weaker">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-left uppercase tracking-wide"
                    onClick={() => setTokenSort((current) => nextTokenSort(current, "output"))}
                  >
                    <span>Out</span>
                    <span>{sortIndicator(tokenSort, "output")}</span>
                  </button>
                </TableHead>
                <TableHead className="w-32 text-left text-[10px] uppercase tracking-wide text-text-weaker">
                  Name
                </TableHead>
                <TableHead className="min-w-64 text-left text-[10px] uppercase tracking-wide text-text-weaker">
                  ID
                </TableHead>
                <TableHead className="text-left text-[10px] uppercase tracking-wide text-text-weaker">
                  Detail
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((row) => (
                <RawContextRow
                  key={row.key}
                  row={row}
                  formatter={props.formatter}
                  expanded={expandedRows.has(row.key)}
                  onToggle={() => toggleRow(row.key)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export function DevToolsContextTab(props: DevToolsContextTabProps) {
  const [verbose, setVerbose] = useState(false)
  const messages = useTranscriptSessionMessages(props.directory, props.sessionID)
  const transcriptMeta = useTranscriptSessionMeta(props.directory, props.sessionID)
  const loadError = useCompleteTranscriptLoader(props.directory, props.sessionID)
  const directorySnapshot = useChatStore(
    useShallow((state) => {
      const directoryState = state.directories[props.directory]
      const session = props.sessionID
        ? directoryState?.sessions.find((entry) => entry.id === props.sessionID)
        : undefined

      return {
        session,
        sessionTitle: directoryState?.sessionTitle,
        providers: directoryState?.providers ?? EMPTY_PROVIDERS,
      }
    }),
  )
  const formatter = useMemo(() => createDevToolsContextFormatter(), [])
  const metrics = useMemo(
    () => getSessionContextMetrics(messages, directorySnapshot.providers),
    [directorySnapshot.providers, messages],
  )
  const counts = useMemo(() => contextCounts(messages), [messages])
  const systemPrompt = useMemo(
    () => latestSystemPrompt(messages, directorySnapshot.session?.revert?.messageID),
    [directorySnapshot.session?.revert?.messageID, messages],
  )
  const sessionLabel =
    directorySnapshot.session?.title ??
    directorySnapshot.sessionTitle ??
    props.sessionID ??
    "No active session"
  const context = metrics.context
  const stats = useMemo<ContextStat[]>(
    () => [
      { label: "Session", value: sessionLabel, emphasis: true },
      { label: "Messages", value: formatter.number(counts.all) },
      { label: "Provider", value: context?.providerLabel ?? "—" },
      { label: "Model", value: context?.modelLabel ?? "—" },
      { label: "Context Limit", value: formatter.number(context?.limit), emphasis: true },
      { label: "Total Tokens", value: formatter.number(context?.total), emphasis: true },
      { label: "Usage", value: formatter.percent(context?.usage), emphasis: true },
      { label: "Input Tokens", value: formatter.number(context?.input) },
      { label: "Output Tokens", value: formatter.number(context?.output) },
      { label: "Reasoning Tokens", value: formatter.number(context?.reasoning) },
      {
        label: "Cache Tokens (read/write)",
        value: `${formatter.number(context?.cacheRead)} / ${formatter.number(context?.cacheWrite)}`,
      },
      { label: "User Messages", value: formatter.number(counts.user) },
      { label: "Assistant Messages", value: formatter.number(counts.assistant) },
      { label: "Total Cost", value: formatter.currency(metrics.totalCost) },
      { label: "Session Created", value: formatter.time(directorySnapshot.session?.time.created) },
      { label: "Last Activity", value: formatter.time(context?.message.time.created) },
    ],
    [
      context,
      counts.all,
      counts.assistant,
      counts.user,
      directorySnapshot.session?.time.created,
      formatter,
      metrics.totalCost,
      sessionLabel,
    ],
  )

  if (!props.sessionID) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-weak">
        No active session
      </div>
    )
  }

  return (
    <div className="@container h-full overflow-y-auto">
      <div className="flex flex-col gap-4 px-4 pb-8 pt-3 @[44rem]:px-6">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Context</CardTitle>
            <CardDescription className="max-w-2xl">{sessionLabel}</CardDescription>
            <CardAction>
              <label
                htmlFor={VERBOSE_SWITCH_ID}
                className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-border-base/60 bg-surface-base px-2.5 py-1.5"
              >
                <span className="text-xs font-medium text-text-base">Verbose</span>
                <Switch
                  id={VERBOSE_SWITCH_ID}
                  size="sm"
                  checked={verbose}
                  onCheckedChange={setVerbose}
                />
              </label>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-weak">
              <span className="font-mono text-text-base" title={props.sessionID}>
                session {displayID(props.sessionID)}
              </span>
              <span>·</span>
              <span>
                {transcriptMeta.loading
                  ? "Loading history"
                  : transcriptMeta.complete
                    ? "Full history loaded"
                    : "Partial history"}
              </span>
              <span>·</span>
              <span className="truncate" title={props.directory}>
                {props.directory}
              </span>
              {loadError ? (
                <span className="max-w-full truncate text-icon-critical-base">{loadError}</span>
              ) : null}
            </div>
            <Separator />
            <div className="grid grid-cols-1 gap-2 @[32rem]:grid-cols-2 @[56rem]:grid-cols-4">
              {stats.map((stat) => (
                <ContextStatCell
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  emphasis={stat.emphasis}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <ContextBreakdown messages={messages} inputTokens={context?.input} system={systemPrompt} />

        {systemPrompt ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <Markdown
                text={systemPrompt}
                cacheKey={SYSTEM_PROMPT_CACHE_KEY}
                className="text-xs"
              />
            </CardContent>
          </Card>
        ) : null}

        <RawMessagesSection messages={messages} verbose={verbose} formatter={formatter} />
      </div>
    </div>
  )
}
