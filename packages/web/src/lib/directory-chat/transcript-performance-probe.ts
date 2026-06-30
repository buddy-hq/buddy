const DEFAULT_MAX_TRANSCRIPT_PERF_EVENTS = 2_000
const RAF_GAP_REPORT_THRESHOLD_MS = 48
const DEFAULT_GEOMETRY_JUMP_THRESHOLD_PX = 100
const DEFAULT_GEOMETRY_REPORT_LIMIT = 25
const RECENT_GEOMETRY_EVENT_WINDOW_MS = 250
const ROW_TEXT_PREVIEW_LIMIT = 160
const TIMELINE_KEY_ATTRIBUTE = "data-timeline-key"
const TOOL_PART_WRAPPER_SELECTOR = '[data-component="tool-part-wrapper"]'
const DEFERRED_TOOL_FALLBACK_SELECTOR = '[data-component="deferred-tool-fallback"]'
const OBJECT_CARD_SELECTOR = '[data-component="object-card"]'
const MERMAID_LOADING_SELECTOR = '[data-component="mermaid-tool-loading"]'
const MERMAID_DIAGRAM_SELECTOR = '[data-component="mermaid-diagram"]'
const MERMAID_ERROR_SELECTOR = '[data-component="mermaid-error-panel"]'
const IMAGE_SELECTOR = "img"
const VIDEO_SELECTOR = "video"
const AUDIO_SELECTOR = "audio"
const IFRAME_SELECTOR = "iframe"
const SVG_SELECTOR = "svg"
const BUTTON_SELECTOR = "button"

const TRANSCRIPT_ROW_SHELL_KIND = {
  compactTool: "compact-tool",
  htmlWidget: "html-widget",
  media: "media",
  mermaid: "mermaid",
  objectCard: "object-card",
  unknown: "unknown",
} as const

export type TranscriptRowShellKind =
  (typeof TRANSCRIPT_ROW_SHELL_KIND)[keyof typeof TRANSCRIPT_ROW_SHELL_KIND]

export type TranscriptRowShellSnapshot = {
  shellKind: TranscriptRowShellKind
  rowHeight: number
  rowTop: number
  rowBottom: number
  textPreview: string
  hasToolWrapper: boolean
  hasDeferredToolFallback: boolean
  hasObjectCard: boolean
  hasMermaidLoading: boolean
  hasMermaidDiagram: boolean
  hasMermaidError: boolean
  imageCount: number
  svgCount: number
  iframeCount: number
  videoCount: number
  audioCount: number
  buttonCount: number
}

export type TranscriptGeometryJump = {
  at: number
  index: number
  rowKey: string | undefined
  previousSize: number | undefined
  nextSize: number
  deltaPx: number
  ignored: boolean
  shell: TranscriptRowShellSnapshot | undefined
  recentMount: boolean
  recentUnmount: boolean
  recentInlineAsset: TranscriptPerfInlineAssetEvent | undefined
}

export type TranscriptGeometryRowSummary = {
  rowKey: string
  firstSeenAt: number
  lastSeenAt: number
  sizeEvents: number
  mounts: number
  unmounts: number
  inlineAssetEvents: number
  ignoredSizeEvents: number
  maxAbsDeltaPx: number
  totalAbsDeltaPx: number
  lastShell: TranscriptRowShellSnapshot | undefined
}

export type TranscriptGeometryReport = {
  generatedAt: number
  thresholdPx: number
  eventCount: number
  jumpCount: number
  acceptedJumpCount: number
  ignoredJumpCount: number
  jumps: TranscriptGeometryJump[]
  topRows: TranscriptGeometryRowSummary[]
}

export type TranscriptGeometryReportOptions = {
  thresholdPx?: number
  limit?: number
}

export type TranscriptPerfInlineAssetEvent = {
  type: "inline-asset"
  at: number
  rowKey: string
  action: "content-ready" | "size-change"
  width: number | undefined
  height: number | undefined
  shell?: TranscriptRowShellSnapshot
}

type TranscriptGeometryRowSummaryDraft = TranscriptGeometryRowSummary

export type TranscriptPerfEvent =
  | {
      type: "streaming-throughput"
      at: number
      live: boolean
      contentLength: number
      deltaLength: number
    }
  | {
      type: "raf-gap"
      at: number
      gapMs: number
    }
  | {
      type: "long-task"
      at: number
      durationMs: number
    }
  | {
      type: "layout-shift"
      at: number
      value: number
    }
  | {
      type: "scroll-write"
      at: number
      requestedOffset: number
      previousScrollTop: number | undefined
      nextScrollTop: number | undefined
      noOp: boolean
    }
  | {
      type: "virtual-range"
      at: number
      firstIndex: number
      lastIndex: number
      rowCount: number
      mountedCount: number
    }
  | {
      type: "visible-row-mount"
      at: number
      rowKey: string
      index: number
    }
  | {
      type: "visible-row-unmount"
      at: number
      rowKey: string
      index: number
    }
  | {
      type: "row-size"
      at: number
      index: number
      rowKey: string | undefined
      previousSize: number | undefined
      nextSize: number
      deltaPx: number | undefined
      ignored?: boolean
      shell?: TranscriptRowShellSnapshot
    }
  | {
      type: "geometry-settlement"
      at: number
      rowKey: string
      frames: number
      stableFrames: number
      lastDeltaPx: number | undefined
      completed: boolean
    }
  | TranscriptPerfInlineAssetEvent

export type TranscriptPerformanceSummary = {
  events: number
  streamingUpdates: number
  streamedCharacters: number
  maxRafGapMs: number
  longTasks: number
  layoutShiftScore: number
  scrollWrites: number
  scrollNoOps: number
  visibleRowMounts: number
  visibleRowUnmounts: number
  rowSizeChanges: number
  geometrySettlements: number
  inlineAssetEvents: number
  virtualRangeSamples: number
}

export type TranscriptPerformanceProbe = {
  events: TranscriptPerfEvent[]
  record: (event: TranscriptPerfEvent) => void
  clear: () => void
  summary: () => TranscriptPerformanceSummary
  stop: () => void
}

export type TranscriptPerformanceProbeOptions = {
  maxEvents?: number
  observeBrowserEvents?: boolean
}

export type TranscriptGeometryDebugTools = {
  start: (options?: TranscriptPerformanceProbeOptions) => TranscriptPerformanceProbe
  clear: () => void
  report: (options?: TranscriptGeometryReportOptions) => TranscriptGeometryReport
  copy: (options?: TranscriptGeometryReportOptions) => Promise<boolean>
  stop: () => void
}

declare global {
  var __BUDDY_TRANSCRIPT_PERF__: TranscriptPerformanceProbe | undefined
  var __BUDDY_CREATE_TRANSCRIPT_PERF_PROBE__:
    | ((options?: TranscriptPerformanceProbeOptions) => TranscriptPerformanceProbe)
    | undefined
  var __BUDDY_TRANSCRIPT_GEOMETRY__: TranscriptGeometryDebugTools | undefined
}

function now() {
  return performance.now()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function layoutShiftValue(entry: PerformanceEntry) {
  if (!isRecord(entry) || entry.hadRecentInput === true) return undefined
  return typeof entry.value === "number" ? entry.value : undefined
}

function supportedPerformanceEntry(type: string) {
  return (
    typeof PerformanceObserver !== "undefined" &&
    PerformanceObserver.supportedEntryTypes.includes(type)
  )
}

function escapeTimelineKey(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')
}

function countSelector(root: Element, selector: string) {
  return root.querySelectorAll(selector).length
}

function readRowTextPreview(root: Element) {
  const normalized = (root.textContent ?? "").replace(/\s+/gu, " ").trim()
  if (normalized.length <= ROW_TEXT_PREVIEW_LIMIT) return normalized
  return `${normalized.slice(0, ROW_TEXT_PREVIEW_LIMIT)}...`
}

function classifyShell(snapshot: Omit<TranscriptRowShellSnapshot, "shellKind">) {
  if (
    snapshot.hasMermaidLoading ||
    snapshot.hasMermaidDiagram ||
    snapshot.hasMermaidError
  ) {
    return TRANSCRIPT_ROW_SHELL_KIND.mermaid
  }
  if (snapshot.iframeCount > 0) return TRANSCRIPT_ROW_SHELL_KIND.htmlWidget
  if (snapshot.imageCount > 0 || snapshot.videoCount > 0 || snapshot.audioCount > 0) {
    return TRANSCRIPT_ROW_SHELL_KIND.media
  }
  if (snapshot.hasObjectCard) return TRANSCRIPT_ROW_SHELL_KIND.objectCard
  if (snapshot.hasToolWrapper || snapshot.hasDeferredToolFallback) {
    return TRANSCRIPT_ROW_SHELL_KIND.compactTool
  }
  return TRANSCRIPT_ROW_SHELL_KIND.unknown
}

function readTranscriptRowShellSnapshot(
  rowKey: string | undefined,
): TranscriptRowShellSnapshot | undefined {
  if (rowKey === undefined || typeof document === "undefined") return undefined
  const row = document.querySelector(
    `[${TIMELINE_KEY_ATTRIBUTE}="${escapeTimelineKey(rowKey)}"]`,
  )
  if (!(row instanceof HTMLElement)) return undefined
  const rect = row.getBoundingClientRect()
  const videoCount = countSelector(row, VIDEO_SELECTOR)
  const audioCount = countSelector(row, AUDIO_SELECTOR)
  const snapshot = {
    rowHeight: rect.height,
    rowTop: rect.top,
    rowBottom: rect.bottom,
    textPreview: readRowTextPreview(row),
    hasToolWrapper: row.querySelector(TOOL_PART_WRAPPER_SELECTOR) !== null,
    hasDeferredToolFallback: row.querySelector(DEFERRED_TOOL_FALLBACK_SELECTOR) !== null,
    hasObjectCard: row.querySelector(OBJECT_CARD_SELECTOR) !== null,
    hasMermaidLoading: row.querySelector(MERMAID_LOADING_SELECTOR) !== null,
    hasMermaidDiagram: row.querySelector(MERMAID_DIAGRAM_SELECTOR) !== null,
    hasMermaidError: row.querySelector(MERMAID_ERROR_SELECTOR) !== null,
    imageCount: countSelector(row, IMAGE_SELECTOR),
    svgCount: countSelector(row, SVG_SELECTOR),
    iframeCount: countSelector(row, IFRAME_SELECTOR),
    videoCount,
    audioCount,
    buttonCount: countSelector(row, BUTTON_SELECTOR),
  }
  return {
    ...snapshot,
    shellKind: classifyShell(snapshot),
  }
}

function enrichTranscriptPerfEvent(event: TranscriptPerfEvent): TranscriptPerfEvent {
  if (event.type === "row-size" && event.shell === undefined) {
    return {
      ...event,
      shell: readTranscriptRowShellSnapshot(event.rowKey),
    }
  }
  if (event.type === "inline-asset" && event.shell === undefined) {
    return {
      ...event,
      shell: readTranscriptRowShellSnapshot(event.rowKey),
    }
  }
  return event
}

function readEventRowKey(event: TranscriptPerfEvent) {
  return "rowKey" in event ? event.rowKey : undefined
}

function findRecentRowEvent(
  events: readonly TranscriptPerfEvent[],
  rowKey: string | undefined,
  type: "visible-row-mount" | "visible-row-unmount",
  at: number,
) {
  if (rowKey === undefined) return undefined
  const minAt = at - RECENT_GEOMETRY_EVENT_WINDOW_MS
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.at < minAt) break
    if (event.type === type && event.rowKey === rowKey && event.at <= at) {
      return event
    }
  }
  return undefined
}

function findRecentInlineAssetEvent(
  events: readonly TranscriptPerfEvent[],
  rowKey: string | undefined,
  at: number,
): TranscriptPerfInlineAssetEvent | undefined {
  if (rowKey === undefined) return undefined
  const minAt = at - RECENT_GEOMETRY_EVENT_WINDOW_MS
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event === undefined || event.at < minAt) break
    if (event.type === "inline-asset" && event.rowKey === rowKey && event.at <= at) {
      return event
    }
  }
  return undefined
}

function readRowSummaryDraft(
  rows: Map<string, TranscriptGeometryRowSummaryDraft>,
  rowKey: string,
  at: number,
) {
  const existing = rows.get(rowKey)
  if (existing) {
    existing.lastSeenAt = Math.max(existing.lastSeenAt, at)
    return existing
  }
  const next: TranscriptGeometryRowSummaryDraft = {
    rowKey,
    firstSeenAt: at,
    lastSeenAt: at,
    sizeEvents: 0,
    mounts: 0,
    unmounts: 0,
    inlineAssetEvents: 0,
    ignoredSizeEvents: 0,
    maxAbsDeltaPx: 0,
    totalAbsDeltaPx: 0,
    lastShell: undefined,
  }
  rows.set(rowKey, next)
  return next
}

function summarizeTranscriptPerformance(
  events: TranscriptPerfEvent[],
): TranscriptPerformanceSummary {
  return events.reduce<TranscriptPerformanceSummary>(
    (summary, event) => {
      summary.events += 1
      switch (event.type) {
        case "streaming-throughput":
          summary.streamingUpdates += 1
          summary.streamedCharacters += Math.max(0, event.deltaLength)
          break
        case "raf-gap":
          summary.maxRafGapMs = Math.max(summary.maxRafGapMs, event.gapMs)
          break
        case "long-task":
          summary.longTasks += 1
          break
        case "layout-shift":
          summary.layoutShiftScore += event.value
          break
        case "scroll-write":
          summary.scrollWrites += 1
          if (event.noOp) summary.scrollNoOps += 1
          break
        case "visible-row-mount":
          summary.visibleRowMounts += 1
          break
        case "visible-row-unmount":
          summary.visibleRowUnmounts += 1
          break
        case "row-size":
          summary.rowSizeChanges += 1
          break
        case "geometry-settlement":
          summary.geometrySettlements += 1
          break
        case "inline-asset":
          summary.inlineAssetEvents += 1
          break
        case "virtual-range":
          summary.virtualRangeSamples += 1
          break
      }
      return summary
    },
    {
      events: 0,
      streamingUpdates: 0,
      streamedCharacters: 0,
      maxRafGapMs: 0,
      longTasks: 0,
      layoutShiftScore: 0,
      scrollWrites: 0,
      scrollNoOps: 0,
      visibleRowMounts: 0,
      visibleRowUnmounts: 0,
      rowSizeChanges: 0,
      geometrySettlements: 0,
      inlineAssetEvents: 0,
      virtualRangeSamples: 0,
    },
  )
}

export function createTranscriptGeometryReport(
  events: readonly TranscriptPerfEvent[] = getTranscriptPerformanceProbe()?.events ?? [],
  options?: TranscriptGeometryReportOptions,
): TranscriptGeometryReport {
  const thresholdPx = options?.thresholdPx ?? DEFAULT_GEOMETRY_JUMP_THRESHOLD_PX
  const limit = options?.limit ?? DEFAULT_GEOMETRY_REPORT_LIMIT
  const rows = new Map<string, TranscriptGeometryRowSummaryDraft>()
  const jumps: TranscriptGeometryJump[] = []
  let acceptedJumpCount = 0
  let ignoredJumpCount = 0

  for (const event of events) {
    const rowKey = readEventRowKey(event)
    if (rowKey !== undefined) {
      const row = readRowSummaryDraft(rows, rowKey, event.at)
      switch (event.type) {
        case "visible-row-mount":
          row.mounts += 1
          break
        case "visible-row-unmount":
          row.unmounts += 1
          break
        case "inline-asset":
          row.inlineAssetEvents += 1
          row.lastShell = event.shell ?? row.lastShell
          break
        case "row-size": {
          row.sizeEvents += 1
          row.lastShell = event.shell ?? row.lastShell
          if (event.ignored) {
            row.ignoredSizeEvents += 1
            break
          }
          const absDeltaPx = Math.abs(event.deltaPx ?? 0)
          row.maxAbsDeltaPx = Math.max(row.maxAbsDeltaPx, absDeltaPx)
          row.totalAbsDeltaPx += absDeltaPx
          break
        }
        default:
          break
      }
    }

    if (event.type !== "row-size") continue
    const deltaPx = event.deltaPx
    if (deltaPx === undefined || Math.abs(deltaPx) < thresholdPx) continue
    if (event.ignored) ignoredJumpCount += 1
    else acceptedJumpCount += 1
    jumps.push({
      at: event.at,
      index: event.index,
      rowKey: event.rowKey,
      previousSize: event.previousSize,
      nextSize: event.nextSize,
      deltaPx,
      ignored: event.ignored ?? false,
      shell: event.shell,
      recentMount:
        findRecentRowEvent(events, event.rowKey, "visible-row-mount", event.at) !==
        undefined,
      recentUnmount:
        findRecentRowEvent(events, event.rowKey, "visible-row-unmount", event.at) !==
        undefined,
      recentInlineAsset: findRecentInlineAssetEvent(events, event.rowKey, event.at),
    })
  }

  const topRows = [...rows.values()]
    .filter(
      (row) =>
        row.sizeEvents > 0 ||
        row.mounts > 0 ||
        row.unmounts > 0 ||
        row.inlineAssetEvents > 0,
    )
    .toSorted((first, second) => {
      const deltaDifference = second.maxAbsDeltaPx - first.maxAbsDeltaPx
      if (deltaDifference !== 0) return deltaDifference
      return second.totalAbsDeltaPx - first.totalAbsDeltaPx
    })
    .slice(0, limit)

  return {
    generatedAt: now(),
    thresholdPx,
    eventCount: events.length,
    jumpCount: acceptedJumpCount + ignoredJumpCount,
    acceptedJumpCount,
    ignoredJumpCount,
    jumps: jumps.slice(-limit),
    topRows,
  }
}

export function formatTranscriptGeometryReport(report: TranscriptGeometryReport) {
  return JSON.stringify(report, null, 2)
}

export function createTranscriptPerformanceProbe(
  options?: TranscriptPerformanceProbeOptions,
): TranscriptPerformanceProbe {
  const maxEvents = options?.maxEvents ?? DEFAULT_MAX_TRANSCRIPT_PERF_EVENTS
  const events: TranscriptPerfEvent[] = []
  const disposers: Array<() => void> = []
  let stopped = false

  const probe: TranscriptPerformanceProbe = {
    events,
    record(event) {
      if (stopped) return
      events.push(event)
      const overflow = events.length - maxEvents
      if (overflow > 0) {
        events.splice(0, overflow)
      }
    },
    clear() {
      events.length = 0
    },
    summary() {
      return summarizeTranscriptPerformance(events)
    },
    stop() {
      stopped = true
      while (disposers.length > 0) {
        disposers.pop()?.()
      }
    },
  }

  if (options?.observeBrowserEvents ?? true) {
    if (typeof requestAnimationFrame !== "undefined") {
      let previous = now()
      let frameID = 0
      const tick = (timestamp: number) => {
        const gapMs = timestamp - previous
        previous = timestamp
        if (gapMs >= RAF_GAP_REPORT_THRESHOLD_MS) {
          probe.record({ type: "raf-gap", at: timestamp, gapMs })
        }
        frameID = requestAnimationFrame(tick)
      }
      frameID = requestAnimationFrame(tick)
      disposers.push(() => cancelAnimationFrame(frameID))
    }

    if (supportedPerformanceEntry("longtask")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          probe.record({
            type: "long-task",
            at: entry.startTime,
            durationMs: entry.duration,
          })
        }
      })
      observer.observe({ type: "longtask", buffered: true })
      disposers.push(() => observer.disconnect())
    }

    if (supportedPerformanceEntry("layout-shift")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const value = layoutShiftValue(entry)
          if (value === undefined) continue
          probe.record({
            type: "layout-shift",
            at: entry.startTime,
            value,
          })
        }
      })
      observer.observe({ type: "layout-shift", buffered: true })
      disposers.push(() => observer.disconnect())
    }
  }

  return probe
}

export function getTranscriptPerformanceProbe(): TranscriptPerformanceProbe | undefined {
  return globalThis.__BUDDY_TRANSCRIPT_PERF__
}

export function recordTranscriptPerfEvent(event: TranscriptPerfEvent) {
  globalThis.__BUDDY_TRANSCRIPT_PERF__?.record(enrichTranscriptPerfEvent(event))
}

export function installTranscriptPerformanceProbe(
  options?: TranscriptPerformanceProbeOptions,
): TranscriptPerformanceProbe {
  const current = globalThis.__BUDDY_TRANSCRIPT_PERF__
  if (current) return current
  const probe = createTranscriptPerformanceProbe(options)
  globalThis.__BUDDY_TRANSCRIPT_PERF__ = probe
  return probe
}

export function createTranscriptGeometryDebugTools(): TranscriptGeometryDebugTools {
  return {
    start(options) {
      return installTranscriptPerformanceProbe(options)
    },
    clear() {
      getTranscriptPerformanceProbe()?.clear()
    },
    report(options) {
      return createTranscriptGeometryReport(undefined, options)
    },
    async copy(options) {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined
      if (clipboard === undefined) return false
      await clipboard.writeText(
        formatTranscriptGeometryReport(createTranscriptGeometryReport(undefined, options)),
      )
      return true
    },
    stop() {
      getTranscriptPerformanceProbe()?.stop()
      globalThis.__BUDDY_TRANSCRIPT_PERF__ = undefined
    },
  }
}

globalThis.__BUDDY_CREATE_TRANSCRIPT_PERF_PROBE__ = createTranscriptPerformanceProbe
globalThis.__BUDDY_TRANSCRIPT_GEOMETRY__ = createTranscriptGeometryDebugTools()
