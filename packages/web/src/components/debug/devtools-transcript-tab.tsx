import { useCallback, useEffect, useState } from "react"
import { Button, Card, CardContent, CheckIcon, CopyIcon } from "@buddy/ui"
import { copyToClipboard } from "@/lib/directory-chat/chat-debug-helpers"
import {
  createTranscriptGeometryReport,
  formatTranscriptGeometryReport,
  getTranscriptPerformanceProbe,
  installTranscriptPerformanceProbe,
  type TranscriptGeometryJump,
  type TranscriptGeometryRowSummary,
  type TranscriptPerfInlineAssetEvent,
  type TranscriptPerformanceSummary,
} from "@/lib/directory-chat/transcript-performance-probe"

const TRANSCRIPT_GEOMETRY_DEVTOOLS_MAX_EVENTS = 20_000
const TRANSCRIPT_GEOMETRY_DEVTOOLS_REFRESH_MS = 1_000
const TRANSCRIPT_GEOMETRY_REPORT_LIMIT = 16
const TRANSCRIPT_GEOMETRY_ROW_KEY_PREVIEW_CHARS = 56
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
    </div>
  )
}

export function DevToolsTranscriptTab() {
  const [, setVersion] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const intervalID = window.setInterval(() => {
      setVersion((current) => current + 1)
    }, TRANSCRIPT_GEOMETRY_DEVTOOLS_REFRESH_MS)
    return () => window.clearInterval(intervalID)
  }, [])

  const probe = getTranscriptPerformanceProbe()
  const summary = probe?.summary()
  const report = createTranscriptGeometryReport(undefined, {
    limit: TRANSCRIPT_GEOMETRY_REPORT_LIMIT,
  })

  const handleStart = useCallback(() => {
    installTranscriptPerformanceProbe({
      maxEvents: TRANSCRIPT_GEOMETRY_DEVTOOLS_MAX_EVENTS,
      observeBrowserEvents: true,
    })
    setVersion((current) => current + 1)
  }, [])

  const handleClear = useCallback(() => {
    getTranscriptPerformanceProbe()?.clear()
    setVersion((current) => current + 1)
  }, [])

  const handleRefresh = useCallback(() => {
    setVersion((current) => current + 1)
  }, [])

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(formatTranscriptGeometryReport(report))
    setCopied(success)
    if (!success) return
    window.setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS)
  }, [report])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border-weaker-base px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-base">Transcript Geometry</p>
          <p className="text-[11px] text-text-weak">
            {probe ? "recording" : "not recording"} · {formatSummaryMetric(summary)} events ·{" "}
            {formatCount(report.acceptedJumpCount)} accepted jumps ·{" "}
            {formatCount(report.ignoredJumpCount)} ignored
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={handleStart}
          >
            Start
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={handleClear}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={handleRefresh}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={report.eventCount === 0}
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon className="size-3 text-text-success-base" />
            ) : (
              <CopyIcon className="size-3" />
            )}
            Copy
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <Card size="sm" className="border-border-weaker-base">
          <CardContent className="grid gap-2 p-3 text-[11px] text-text-weak">
            <p>
              threshold: {formatPx(report.thresholdPx)} · row-size events:{" "}
              {formatCount(summary?.rowSizeChanges ?? 0)} · mounts:{" "}
              {formatCount(summary?.visibleRowMounts ?? 0)} · unmounts:{" "}
              {formatCount(summary?.visibleRowUnmounts ?? 0)} · total jumps:{" "}
              {formatCount(report.jumpCount)}
            </p>
            <p>
              The copied report is pure event data: row deltas, recent lifecycle events, inline
              asset readiness, and the DOM shell present when the row was measured.
            </p>
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
