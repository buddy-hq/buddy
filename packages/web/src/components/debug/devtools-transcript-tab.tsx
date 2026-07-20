import { useCallback, useEffect, useState } from "react"
import { Button, Card, CardContent, CheckIcon, CopyIcon } from "@buddy/ui"
import { copyToClipboard } from "@/lib/directory-chat/chat-debug-helpers"
import {
  createTranscriptGeometryReport,
  createTranscriptStreamTraceReport,
  formatTranscriptGeometryReport,
  formatTranscriptStreamTraceReport,
  getTranscriptPerformanceProbe,
  restartTranscriptPerformanceProbe,
  type TranscriptGeometryJump,
  type TranscriptGeometryRowSummary,
  type TranscriptMarkdownSnapshot,
  type TranscriptPerfEvent,
  type TranscriptPerfInlineAssetEvent,
  type TranscriptPerformanceSummary,
  type TranscriptStreamTraceEntry,
} from "@/lib/directory-chat/transcript-performance-probe"

const TRANSCRIPT_GEOMETRY_DEVTOOLS_MAX_EVENTS = 20_000
const TRANSCRIPT_GEOMETRY_DEVTOOLS_REFRESH_MS = 250
const TRANSCRIPT_GEOMETRY_REPORT_LIMIT = 16
const TRANSCRIPT_GEOMETRY_ROW_KEY_PREVIEW_CHARS = 56
const TRANSCRIPT_STREAM_TRACE_VISIBLE_EVENTS = 160
const COPY_FEEDBACK_DURATION_MS = 1_200

function formatPx(value: number | undefined) {
  if (value === undefined) return "n/a"
  return `${value.toFixed(1)}px`
}

function formatSignedPx(value: number) {
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(1)}px`
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value)
}

function formatRowKey(rowKey: string | undefined) {
  if (rowKey === undefined) return "unknown row"
  if (rowKey.length <= TRANSCRIPT_GEOMETRY_ROW_KEY_PREVIEW_CHARS) return rowKey
  return `${rowKey.slice(0, TRANSCRIPT_GEOMETRY_ROW_KEY_PREVIEW_CHARS)}...`
}

function formatInlineAsset(asset: TranscriptPerfInlineAssetEvent | undefined) {
  if (asset === undefined) return "none"
  return `${asset.action} ${formatPx(asset.width)} x ${formatPx(asset.height)}`
}

function formatSummaryMetric(summary: TranscriptPerformanceSummary | undefined) {
  if (summary === undefined) return "0"
  return formatCount(summary.events)
}

function formatDuration(value: number) {
  if (value < 1_000) return `${value.toFixed(0)}ms`
  return `${(value / 1_000).toFixed(2)}s`
}

function formatMarkdownState(markdown: TranscriptMarkdownSnapshot | undefined) {
  if (!markdown) return "Markdown none"
  const longestParseMs = Math.max(0, ...markdown.parseDurationsMs)
  const imageStates = markdown.images.map((image) => image.state ?? "unknown").join("/")
  const imageSummary =
    markdown.images.length > 0 ? ` · ${markdown.images.length} images ${imageStates}` : ""
  return `Markdown ${markdown.phase ?? "unknown"} / ${markdown.branch ?? "unknown"} · ${formatCount(markdown.sourceLength ?? 0)} chars · ${markdown.segmentKeys.length} segments · ${markdown.blockKeys.length} blocks · ${markdown.residentBlockCount} resident / ${markdown.placeholderBlockCount} placeholders${imageSummary} · parse ${formatDuration(longestParseMs)}`
}

function traceEventTone(event: TranscriptPerfEvent) {
  switch (event.type) {
    case "row-size":
    case "geometry-settlement":
      return "bg-text-warning-base"
    case "scroll-write":
    case "bottom-anchor-repair":
    case "abort-lifecycle":
    case "stream-buffer":
      return "bg-text-interactive-base"
    case "inline-asset":
    case "render-state":
      return "bg-text-success-base"
    case "visible-row-mount":
    case "visible-row-unmount":
    case "virtual-range":
      return "bg-text-weaker"
    case "streaming-throughput":
      return "bg-text-base"
    case "raf-gap":
    case "long-task":
    case "layout-shift":
      return "bg-text-critical-base"
  }
}

function traceEventLabel(event: TranscriptPerfEvent) {
  switch (event.type) {
    case "row-size":
      return "row size"
    case "geometry-settlement":
      return "geometry settled"
    case "scroll-write":
      return event.noOp ? "scroll no-op" : "scroll write"
    case "bottom-anchor-repair":
      return "bottom repair"
    case "abort-lifecycle":
      return event.phase === "requested" ? "stop requested" : "stop settled"
    case "stream-buffer":
      return `stream ${event.phase}`
    case "inline-asset":
      return `asset ${event.action}`
    case "render-state":
      return "DOM render"
    case "visible-row-mount":
      return "row mounted"
    case "visible-row-unmount":
      return "row unmounted"
    case "virtual-range":
      return "virtual range"
    case "streaming-throughput":
      return "stream update"
    case "raf-gap":
      return "frame gap"
    case "long-task":
      return "long task"
    case "layout-shift":
      return "layout shift"
  }
}

function traceEventDetail(event: TranscriptPerfEvent) {
  switch (event.type) {
    case "row-size":
      return `${formatRowKey(event.rowKey)} · ${formatSignedPx(event.deltaPx ?? 0)} · ${formatPx(event.previousSize)} → ${formatPx(event.nextSize)} · math ${event.shell?.mathPlaceholderCount ?? 0} placeholder / ${event.shell?.katexCount ?? 0} KaTeX`
    case "geometry-settlement":
      return `${formatRowKey(event.rowKey)} · ${event.frames} frames · ${event.completed ? "stable" : "timed out"}`
    case "scroll-write":
      return `${formatPx(event.previousScrollTop)} → ${formatPx(event.nextScrollTop)} · requested ${formatPx(event.requestedOffset)}`
    case "bottom-anchor-repair":
      return `${formatPx(event.distanceFromEnd)} from end before repair`
    case "abort-lifecycle":
      return event.phase === "requested"
        ? "runtime cancellation requested"
        : `${event.outcome} · ${formatDuration(event.durationMs)}`
    case "stream-buffer":
      if (event.phase === "flush") {
        return `${formatCount(event.queuedEvents)} queued · ${formatCount(event.appliedEvents)} applied`
      }
      if (event.phase === "session-fence") {
        return `${formatCount(event.discardedEvents)} queued events discarded for ${formatRowKey(event.sessionID)}`
      }
      return `${formatRowKey(event.sessionID)} recovery complete · ${formatCount(event.discardedEvents)} in-flight events discarded`
    case "inline-asset":
      return `${formatRowKey(event.rowKey)} · ${formatPx(event.width)} × ${formatPx(event.height)} · ${event.shell?.shellKind ?? "unknown"}`
    case "render-state":
      return `${formatRowKey(event.rowKey)} · ${event.mutationCount} mutations · math ${event.shell.mathPlaceholderCount} placeholder / ${event.shell.katexCount} KaTeX · Mermaid ${event.shell.hasMermaidLoading ? "loading" : event.shell.hasMermaidDiagram ? "ready" : "none"} · ${formatMarkdownState(event.shell.markdown)}`
    case "visible-row-mount":
    case "visible-row-unmount":
      return `${formatRowKey(event.rowKey)} · row ${event.index}`
    case "virtual-range":
      return `rows ${event.firstIndex}–${event.lastIndex} of ${event.rowCount} · ${event.mountedCount} mounted`
    case "streaming-throughput":
      return `${formatCount(event.deltaLength)} chars · ${formatCount(event.contentLength)} total · ${event.live ? "live" : "settled"}`
    case "raf-gap":
      return `${formatDuration(event.gapMs)} between animation frames`
    case "long-task":
      return `${formatDuration(event.durationMs)} main-thread task`
    case "layout-shift":
      return `score ${event.value.toFixed(4)}`
  }
}

function DevToolsTranscriptTraceRow({ entry }: { entry: TranscriptStreamTraceEntry }) {
  return (
    <div className="grid grid-cols-[44px_6px_minmax(0,1fr)] items-start gap-2 border-b border-border-weaker-base/70 py-1.5 last:border-b-0">
      <p className="pt-px text-right font-mono text-[10px] tabular-nums text-text-weaker">
        +{formatDuration(entry.offsetMs)}
      </p>
      <span className={`mt-1.5 size-1.5 rounded-full ${traceEventTone(entry.event)}`} />
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-text-base">
          {traceEventLabel(entry.event)}
        </p>
        <p className="mt-0.5 break-words font-mono text-[10px] leading-4 text-text-weak">
          {traceEventDetail(entry.event)}
        </p>
      </div>
    </div>
  )
}

function TraceMetric(props: { label: string; value: string }) {
  return (
    <div className="border-l border-border-weak-base pl-2 first:border-l-0 first:pl-0">
      <p className="font-mono text-[11px] font-semibold tabular-nums text-text-base">
        {props.value}
      </p>
      <p className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-text-weaker">
        {props.label}
      </p>
    </div>
  )
}

function DevToolsTranscriptJumpRow({ jump }: { jump: TranscriptGeometryJump }) {
  const shell = jump.shell
  return (
    <div className="rounded-md border border-border-weaker-base bg-surface-base p-2">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-text-base" title={jump.rowKey}>
            {formatRowKey(jump.rowKey)}
          </p>
          <p className="mt-1 text-[11px] text-text-weak">
            row {jump.index} · {formatPx(jump.previousSize)} to {formatPx(jump.nextSize)}
          </p>
        </div>
        <p className="shrink-0 font-mono text-xs font-semibold text-text-critical-base">
          {formatSignedPx(jump.deltaPx)}
        </p>
      </div>
      <div className="mt-2 grid gap-1 text-[11px] text-text-weak">
        <p>
          shell:{" "}
          <span className="font-medium text-text-base">{shell?.shellKind ?? "not in DOM"}</span>
          {shell ? ` · measured DOM ${formatPx(shell.rowHeight)}` : ""}
        </p>
        {shell ? (
          <p>
            math: {formatCount(shell.mathPlaceholderCount)} placeholder ·{" "}
            {formatCount(shell.katexCount)} KaTeX
          </p>
        ) : null}
        <p>
          recent: mount {jump.recentMount ? "yes" : "no"} · unmount{" "}
          {jump.recentUnmount ? "yes" : "no"} · asset {formatInlineAsset(jump.recentInlineAsset)} ·
          ignored {jump.ignored ? "yes" : "no"}
        </p>
        {shell?.textPreview ? (
          <p className="line-clamp-2 text-text-weaker" title={shell.textPreview}>
            {shell.textPreview}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function DevToolsTranscriptRowSummary({ row }: { row: TranscriptGeometryRowSummary }) {
  return (
    <div className="rounded-md border border-border-weaker-base bg-surface-base p-2">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-[11px] text-text-base" title={row.rowKey}>
          {formatRowKey(row.rowKey)}
        </p>
        <p className="shrink-0 font-mono text-[11px] text-text-warning-base">
          {formatPx(row.maxAbsDeltaPx)}
        </p>
      </div>
      <p className="mt-1 text-[11px] text-text-weak">
        sizes {formatCount(row.sizeEvents)} · mounts {formatCount(row.mounts)} · unmounts{" "}
        {formatCount(row.unmounts)} · assets {formatCount(row.inlineAssetEvents)}
      </p>
      <p className="mt-1 text-[11px] text-text-weaker">
        last shell: {row.lastShell?.shellKind ?? "unknown"} · total delta{" "}
        {formatPx(row.totalAbsDeltaPx)} · ignored sizes {formatCount(row.ignoredSizeEvents)}
      </p>
      {row.lastShell ? (
        <p className="mt-1 text-[11px] text-text-weaker">
          math {formatCount(row.lastShell.mathPlaceholderCount)} placeholder ·{" "}
          {formatCount(row.lastShell.katexCount)} KaTeX
        </p>
      ) : null}
    </div>
  )
}

export function DevToolsTranscriptTab() {
  const [, setVersion] = useState(0)
  const [copiedTrace, setCopiedTrace] = useState(false)
  const [copiedGeometry, setCopiedGeometry] = useState(false)

  useEffect(() => {
    const intervalID = window.setInterval(() => {
      setVersion((current) => current + 1)
    }, TRANSCRIPT_GEOMETRY_DEVTOOLS_REFRESH_MS)
    return () => window.clearInterval(intervalID)
  }, [])

  const probe = getTranscriptPerformanceProbe()
  const summary = probe?.summary()
  const trace = createTranscriptStreamTraceReport(probe)
  const visibleTraceEntries = trace.events
    .slice(-TRANSCRIPT_STREAM_TRACE_VISIBLE_EVENTS)
    .toReversed()
  const report = createTranscriptGeometryReport(undefined, {
    limit: TRANSCRIPT_GEOMETRY_REPORT_LIMIT,
  })

  const handleStart = useCallback(() => {
    restartTranscriptPerformanceProbe({
      maxEvents: TRANSCRIPT_GEOMETRY_DEVTOOLS_MAX_EVENTS,
      observeBrowserEvents: true,
    })
    setVersion((current) => current + 1)
  }, [])

  const handleStop = useCallback(() => {
    getTranscriptPerformanceProbe()?.stop()
    setVersion((current) => current + 1)
  }, [])

  const handleClear = useCallback(() => {
    getTranscriptPerformanceProbe()?.clear()
    setVersion((current) => current + 1)
  }, [])

  const handleRefresh = useCallback(() => {
    setVersion((current) => current + 1)
  }, [])

  const handleCopyTrace = useCallback(async () => {
    const success = await copyToClipboard(formatTranscriptStreamTraceReport(trace))
    setCopiedTrace(success)
    if (!success) return
    window.setTimeout(() => setCopiedTrace(false), COPY_FEEDBACK_DURATION_MS)
  }, [trace])

  const handleCopyGeometry = useCallback(async () => {
    const success = await copyToClipboard(formatTranscriptGeometryReport(report))
    setCopiedGeometry(success)
    if (!success) return
    window.setTimeout(() => setCopiedGeometry(false), COPY_FEEDBACK_DURATION_MS)
  }, [report])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border-weaker-base px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full ${probe?.isRecording() ? "bg-text-success-base" : "bg-text-weaker"}`}
            />
            <p className="text-xs font-medium text-text-base">Transcript Stream Trace</p>
          </div>
          <p className="mt-0.5 text-[11px] text-text-weak">
            {probe?.isRecording() ? "recording" : probe ? "capture stopped" : "not armed"} ·{" "}
            {formatSummaryMetric(summary)} events · {formatDuration(trace.durationMs)} ·{" "}
            {formatCount(report.acceptedJumpCount)} accepted jumps ·{" "}
            {formatCount(report.ignoredJumpCount)} ignored
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <Button
            type="button"
            variant={probe?.isRecording() ? "outline" : "default"}
            size="sm"
            className="h-7 text-[11px]"
            disabled={probe?.isRecording()}
            onClick={handleStart}
          >
            Start
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!probe?.isRecording()}
            onClick={handleStop}
          >
            Stop
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={!probe}
            onClick={handleClear}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={trace.events.length === 0}
            onClick={handleCopyTrace}
          >
            {copiedTrace ? (
              <CheckIcon className="size-3 text-text-success-base" />
            ) : (
              <CopyIcon className="size-3" />
            )}
            Copy trace
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <Card size="sm" className="overflow-hidden border-border-weaker-base bg-surface-base">
          <CardContent className="p-0">
            <div className="grid grid-cols-4 gap-y-3 border-b border-border-weaker-base bg-surface-weak/35 p-3">
              <TraceMetric
                label="DOM renders"
                value={formatCount(summary?.renderStateSamples ?? 0)}
              />
              <TraceMetric label="Row sizes" value={formatCount(summary?.rowSizeChanges ?? 0)} />
              <TraceMetric label="Scroll writes" value={formatCount(summary?.scrollWrites ?? 0)} />
              <TraceMetric
                label="Bottom repairs"
                value={formatCount(summary?.bottomAnchorRepairs ?? 0)}
              />
              <TraceMetric
                label="Asset events"
                value={formatCount(summary?.inlineAssetEvents ?? 0)}
              />
              <TraceMetric
                label="Stream updates"
                value={formatCount(summary?.streamingUpdates ?? 0)}
              />
              <TraceMetric
                label="Events queued"
                value={formatCount(summary?.streamEventsQueued ?? 0)}
              />
              <TraceMetric
                label="Events applied"
                value={formatCount(summary?.streamEventsApplied ?? 0)}
              />
              <TraceMetric
                label="Events discarded"
                value={formatCount(summary?.streamEventsDiscarded ?? 0)}
              />
              <TraceMetric
                label="Session fences"
                value={formatCount(summary?.streamSessionFences ?? 0)}
              />
              <TraceMetric label="Stop requests" value={formatCount(summary?.abortRequests ?? 0)} />
              <TraceMetric
                label="Stop latency"
                value={formatDuration(summary?.maxAbortLatencyMs ?? 0)}
              />
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <p className="text-[10px] leading-4 text-text-weak">
                Start, send one prompt, then Stop. Math counts expose placeholder → KaTeX reversals;
                stop events separate runtime cancellation latency from terminal rendering work.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 text-[10px]"
                onClick={handleRefresh}
              >
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-text-base">In-flight event trace</p>
            <p className="font-mono text-[10px] text-text-weaker">
              newest first · showing {formatCount(visibleTraceEntries.length)} /{" "}
              {formatCount(trace.events.length)}
            </p>
          </div>
          <div className="rounded-md border border-border-weaker-base bg-surface-base px-2">
            {visibleTraceEntries.length === 0 ? (
              <p className="py-3 text-[11px] text-text-weak">
                No capture yet. Press Start immediately before sending the stress prompt.
              </p>
            ) : (
              visibleTraceEntries.map((entry) => (
                <DevToolsTranscriptTraceRow key={entry.sequence} entry={entry} />
              ))
            )}
          </div>
        </div>

        <Card size="sm" className="border-border-weaker-base">
          <CardContent className="flex items-start justify-between gap-3 p-3 text-[11px] text-text-weak">
            <p>
              Geometry threshold {formatPx(report.thresholdPx)} · {formatCount(report.jumpCount)}{" "}
              total jumps · {formatCount(summary?.visibleRowMounts ?? 0)} mounts /{" "}
              {formatCount(summary?.visibleRowUnmounts ?? 0)} unmounts
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 gap-1 text-[10px]"
              disabled={report.eventCount === 0}
              onClick={handleCopyGeometry}
            >
              {copiedGeometry ? (
                <CheckIcon className="size-3 text-text-success-base" />
              ) : (
                <CopyIcon className="size-3" />
              )}
              Copy geometry
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <p className="text-xs font-medium text-text-base">Size Jumps</p>
          {report.jumps.length === 0 ? (
            <p className="rounded-md border border-border-weaker-base bg-surface-base p-2 text-[11px] text-text-weak">
              No row-size jumps above {formatPx(report.thresholdPx)} recorded.
            </p>
          ) : (
            report.jumps.map((jump) => (
              <DevToolsTranscriptJumpRow
                key={`${jump.rowKey ?? "unknown"}:${jump.at}:${jump.nextSize}`}
                jump={jump}
              />
            ))
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-text-base">Noisiest Rows</p>
          {report.topRows.length === 0 ? (
            <p className="rounded-md border border-border-weaker-base bg-surface-base p-2 text-[11px] text-text-weak">
              No transcript row activity recorded yet.
            </p>
          ) : (
            report.topRows.map((row) => <DevToolsTranscriptRowSummary key={row.rowKey} row={row} />)
          )}
        </div>
      </div>
    </div>
  )
}
