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
const MARKDOWN_MATH_PLACEHOLDER_SELECTOR = '[data-component="markdown-math-placeholder"]'
const KATEX_SELECTOR = ".katex"
const IMAGE_SELECTOR = "img"
const VIDEO_SELECTOR = "video"
const AUDIO_SELECTOR = "audio"
const IFRAME_SELECTOR = "iframe"
const SVG_SELECTOR = "svg"
const BUTTON_SELECTOR = "button"
const MARKDOWN_DOCUMENT_SELECTOR = "[data-markdown-document]"
const MARKDOWN_SEGMENT_SELECTOR = "[data-markdown-segment-key]"
const MARKDOWN_BLOCK_SELECTOR = "[data-markdown-block-key]"
const MARKDOWN_VIRTUAL_BLOCK_SELECTOR = "[data-markdown-virtual-block-key]"
const MARKDOWN_IMAGE_SELECTOR = 'img[data-markdown-image="true"]'
const MARKDOWN_RESIDENT_SELECTOR = '[data-markdown-residency="resident"]'
const MARKDOWN_PLACEHOLDER_SELECTOR = '[data-markdown-residency="placeholder"]'
const MARKDOWN_OBSERVED_ATTRIBUTES = [
  "data-markdown-source-length",
  "data-markdown-source-hash",
  "data-markdown-phase",
  "data-markdown-branch",
  "data-markdown-segment-count",
  "data-markdown-segment-key",
  "data-markdown-segment-kind",
  "data-markdown-block-key",
  "data-markdown-block-mode",
  "data-markdown-parse-state",
  "data-markdown-parse-duration-ms",
  "data-markdown-parsed-source-hash",
  "data-markdown-virtual-block-key",
  "data-markdown-residency",
  "data-markdown-image-state",
]

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

export type TranscriptMarkdownSnapshot = {
  documentCount: number
  sourceLength: number | undefined
  sourceHash: string | undefined
  phase: string | undefined
  branch: string | undefined
  segmentKeys: string[]
  blockKeys: string[]
  virtualBlockKeys: string[]
  residentBlockCount: number
  placeholderBlockCount: number
  parseStates: string[]
  parseDurationsMs: number[]
  parsedSourceHashes: string[]
  images: TranscriptMarkdownImageSnapshot[]
}

export type TranscriptMarkdownImageSnapshot = {
  state: string | undefined
  complete: boolean
  naturalWidth: number
  naturalHeight: number
  renderedWidth: number
  renderedHeight: number
}

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
  mathPlaceholderCount: number
  katexCount: number
  imageCount: number
  svgCount: number
  iframeCount: number
  videoCount: number
  audioCount: number
  buttonCount: number
  markdown?: TranscriptMarkdownSnapshot
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

export type TranscriptPerfRenderStateEvent = {
  type: "render-state"
  at: number
  rowKey: string
  mutationCount: number
  shell: TranscriptRowShellSnapshot
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
      type: "bottom-anchor-repair"
      at: number
      distanceFromEnd: number
    }
  | {
      type: "abort-lifecycle"
      at: number
      phase: "requested"
    }
  | {
      type: "abort-lifecycle"
      at: number
      phase: "settled"
      durationMs: number
      outcome: "success" | "error"
    }
  | {
      type: "stream-buffer"
      at: number
      phase: "flush"
      queuedEvents: number
      appliedEvents: number
    }
  | {
      type: "stream-buffer"
      at: number
      phase: "session-fence"
      sessionID: string
      discardedEvents: number
    }
  | {
      type: "stream-buffer"
      at: number
      phase: "session-resume"
      sessionID: string
      discardedEvents: number
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
  | TranscriptPerfRenderStateEvent
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
  bottomAnchorRepairs: number
  abortRequests: number
  maxAbortLatencyMs: number
  streamFlushes: number
  streamEventsQueued: number
  streamEventsApplied: number
  streamEventsDiscarded: number
  streamSessionFences: number
  visibleRowMounts: number
  visibleRowUnmounts: number
  rowSizeChanges: number
  geometrySettlements: number
  inlineAssetEvents: number
  renderStateSamples: number
  virtualRangeSamples: number
}

export type TranscriptPerformanceProbe = {
  startedAt: number
  stoppedAt: number | undefined
  events: TranscriptPerfEvent[]
  record: (event: TranscriptPerfEvent) => void
  clear: () => void
  summary: () => TranscriptPerformanceSummary
  isRecording: () => boolean
  stop: () => void
}

export type TranscriptStreamTraceEntry = {
  sequence: number
  offsetMs: number
  event: TranscriptPerfEvent
}

export type TranscriptStreamTraceReport = {
  generatedAt: number
  startedAt: number | undefined
  stoppedAt: number | undefined
  durationMs: number
  recording: boolean
  summary: TranscriptPerformanceSummary
  events: TranscriptStreamTraceEntry[]
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
  if (snapshot.hasMermaidLoading || snapshot.hasMermaidDiagram || snapshot.hasMermaidError) {
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

function readAttributeValues(root: Element, selector: string, attribute: string): string[] {
  return Array.from(root.querySelectorAll(selector)).flatMap((element) => {
    const value = element.getAttribute(attribute)
    return value === null ? [] : [value]
  })
}

function readMarkdownSnapshot(row: HTMLElement): TranscriptMarkdownSnapshot | undefined {
  const documents = row.querySelectorAll(MARKDOWN_DOCUMENT_SELECTOR)
  const document = documents[0]
  if (!(document instanceof HTMLElement)) return undefined

  const sourceLengthValue = Number(document.dataset.markdownSourceLength)
  const parseDurationsMs = readAttributeValues(
    document,
    MARKDOWN_BLOCK_SELECTOR,
    "data-markdown-parse-duration-ms",
  ).flatMap((value) => {
    const duration = Number(value)
    return Number.isFinite(duration) ? [duration] : []
  })
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>(MARKDOWN_IMAGE_SELECTOR),
  ).map((image) => {
    const rect = image.getBoundingClientRect()
    return {
      state: image.dataset.markdownImageState,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
    }
  })
  return {
    documentCount: documents.length,
    sourceLength: Number.isFinite(sourceLengthValue) ? sourceLengthValue : undefined,
    sourceHash: document.dataset.markdownSourceHash,
    phase: document.dataset.markdownPhase,
    branch: document.dataset.markdownBranch,
    segmentKeys: readAttributeValues(document, MARKDOWN_SEGMENT_SELECTOR, "data-markdown-segment-key"),
    blockKeys: readAttributeValues(document, MARKDOWN_BLOCK_SELECTOR, "data-markdown-block-key"),
    virtualBlockKeys: readAttributeValues(
      document,
      MARKDOWN_VIRTUAL_BLOCK_SELECTOR,
      "data-markdown-virtual-block-key",
    ),
    residentBlockCount: countSelector(document, MARKDOWN_RESIDENT_SELECTOR),
    placeholderBlockCount: countSelector(document, MARKDOWN_PLACEHOLDER_SELECTOR),
    parseStates: readAttributeValues(
      document,
      MARKDOWN_BLOCK_SELECTOR,
      "data-markdown-parse-state",
    ),
    parseDurationsMs,
    parsedSourceHashes: readAttributeValues(
      document,
      MARKDOWN_BLOCK_SELECTOR,
      "data-markdown-parsed-source-hash",
    ),
    images,
  }
}

function readTranscriptRowShellElement(row: HTMLElement): TranscriptRowShellSnapshot {
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
    mathPlaceholderCount: countSelector(row, MARKDOWN_MATH_PLACEHOLDER_SELECTOR),
    katexCount: countSelector(row, KATEX_SELECTOR),
    imageCount: countSelector(row, IMAGE_SELECTOR),
    svgCount: countSelector(row, SVG_SELECTOR),
    iframeCount: countSelector(row, IFRAME_SELECTOR),
    videoCount,
    audioCount,
    buttonCount: countSelector(row, BUTTON_SELECTOR),
    markdown: readMarkdownSnapshot(row),
  }
  return {
    ...snapshot,
    shellKind: classifyShell(snapshot),
  }
}

function readTranscriptRowShellSnapshot(
  rowKey: string | undefined,
): TranscriptRowShellSnapshot | undefined {
  if (rowKey === undefined || typeof document === "undefined") return undefined
  const row = document.querySelector(`[${TIMELINE_KEY_ATTRIBUTE}="${escapeTimelineKey(rowKey)}"]`)
  if (!(row instanceof HTMLElement)) return undefined
  return readTranscriptRowShellElement(row)
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
  events: readonly TranscriptPerfEvent[],
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
        case "bottom-anchor-repair":
          summary.bottomAnchorRepairs += 1
          break
        case "abort-lifecycle":
          if (event.phase === "requested") {
            summary.abortRequests += 1
          } else {
            summary.maxAbortLatencyMs = Math.max(summary.maxAbortLatencyMs, event.durationMs)
          }
          break
        case "stream-buffer":
          if (event.phase === "flush") {
            summary.streamFlushes += 1
            summary.streamEventsQueued += event.queuedEvents
            summary.streamEventsApplied += event.appliedEvents
          } else if (event.phase === "session-fence") {
            summary.streamSessionFences += 1
            summary.streamEventsDiscarded += event.discardedEvents
          } else {
            summary.streamEventsDiscarded += event.discardedEvents
          }
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
        case "render-state":
          summary.renderStateSamples += 1
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
      bottomAnchorRepairs: 0,
      abortRequests: 0,
      maxAbortLatencyMs: 0,
      streamFlushes: 0,
      streamEventsQueued: 0,
      streamEventsApplied: 0,
      streamEventsDiscarded: 0,
      streamSessionFences: 0,
      visibleRowMounts: 0,
      visibleRowUnmounts: 0,
      rowSizeChanges: 0,
      geometrySettlements: 0,
      inlineAssetEvents: 0,
      renderStateSamples: 0,
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
        case "render-state":
          row.lastShell = event.shell
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
        findRecentRowEvent(events, event.rowKey, "visible-row-mount", event.at) !== undefined,
      recentUnmount:
        findRecentRowEvent(events, event.rowKey, "visible-row-unmount", event.at) !== undefined,
      recentInlineAsset: findRecentInlineAssetEvent(events, event.rowKey, event.at),
    })
  }

  const topRows = [...rows.values()]
    .filter(
      (row) =>
        row.sizeEvents > 0 || row.mounts > 0 || row.unmounts > 0 || row.inlineAssetEvents > 0,
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

export function createTranscriptStreamTraceReport(
  probe: TranscriptPerformanceProbe | undefined = getTranscriptPerformanceProbe(),
): TranscriptStreamTraceReport {
  const events = probe?.events ?? []
  const generatedAt = now()
  const startedAt = probe?.startedAt
  const stoppedAt = probe?.stoppedAt
  const traceEnd = stoppedAt ?? generatedAt
  return {
    generatedAt,
    startedAt,
    stoppedAt,
    durationMs: startedAt === undefined ? 0 : Math.max(0, traceEnd - startedAt),
    recording: probe?.isRecording() ?? false,
    summary: summarizeTranscriptPerformance(events),
    events: events.map((event, index) => ({
      sequence: index + 1,
      offsetMs: startedAt === undefined ? 0 : Math.max(0, event.at - startedAt),
      event,
    })),
  }
}

export function formatTranscriptStreamTraceReport(report: TranscriptStreamTraceReport) {
  return JSON.stringify(report, null, 2)
}

function collectTranscriptRows(node: Node, rows: Set<HTMLElement>) {
  const element = node instanceof Element ? node : node.parentElement
  if (!element) return
  const closest = element.closest(`[${TIMELINE_KEY_ATTRIBUTE}]`)
  if (closest instanceof HTMLElement) {
    rows.add(closest)
  }
  if (element instanceof HTMLElement && element.hasAttribute(TIMELINE_KEY_ATTRIBUTE)) {
    rows.add(element)
  }
  for (const row of element.querySelectorAll(`[${TIMELINE_KEY_ATTRIBUTE}]`)) {
    if (row instanceof HTMLElement) rows.add(row)
  }
}

function installTranscriptRenderObserver(probe: TranscriptPerformanceProbe) {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return
  const root = document.body
  if (!root) return

  const pendingMutationCountByRow = new Map<HTMLElement, number>()
  let frameID: number | undefined

  const flush = () => {
    frameID = undefined
    const at = now()
    const pending = [...pendingMutationCountByRow]
    pendingMutationCountByRow.clear()
    for (const [row, mutationCount] of pending) {
      const rowKey = row.dataset.timelineKey
      if (!rowKey || !row.isConnected) continue
      probe.record({
        type: "render-state",
        at,
        rowKey,
        mutationCount,
        shell: readTranscriptRowShellElement(row),
      })
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const rows = new Set<HTMLElement>()
      collectTranscriptRows(mutation.target, rows)
      for (const node of mutation.addedNodes) {
        collectTranscriptRows(node, rows)
      }
      for (const row of rows) {
        pendingMutationCountByRow.set(row, (pendingMutationCountByRow.get(row) ?? 0) + 1)
      }
    }
    if (pendingMutationCountByRow.size > 0 && frameID === undefined) {
      if (typeof requestAnimationFrame === "undefined") {
        flush()
      } else {
        frameID = requestAnimationFrame(flush)
      }
    }
  })
  observer.observe(root, {
    attributes: true,
    attributeFilter: MARKDOWN_OBSERVED_ATTRIBUTES,
    childList: true,
    subtree: true,
  })
  return () => {
    observer.disconnect()
    if (frameID !== undefined && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(frameID)
    }
    pendingMutationCountByRow.clear()
  }
}

export function createTranscriptPerformanceProbe(
  options?: TranscriptPerformanceProbeOptions,
): TranscriptPerformanceProbe {
  const maxEvents = options?.maxEvents ?? DEFAULT_MAX_TRANSCRIPT_PERF_EVENTS
  const events: TranscriptPerfEvent[] = []
  const disposers: Array<() => void> = []
  const startedAt = now()
  let stoppedAt: number | undefined
  let stopped = false

  const probe: TranscriptPerformanceProbe = {
    startedAt,
    get stoppedAt() {
      return stoppedAt
    },
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
    isRecording() {
      return !stopped
    },
    stop() {
      if (stopped) return
      stopped = true
      stoppedAt = now()
      while (disposers.length > 0) {
        disposers.pop()?.()
      }
    },
  }

  if (options?.observeBrowserEvents ?? true) {
    const disposeRenderObserver = installTranscriptRenderObserver(probe)
    if (disposeRenderObserver) disposers.push(disposeRenderObserver)

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

export function restartTranscriptPerformanceProbe(
  options?: TranscriptPerformanceProbeOptions,
): TranscriptPerformanceProbe {
  getTranscriptPerformanceProbe()?.stop()
  const probe = createTranscriptPerformanceProbe(options)
  globalThis.__BUDDY_TRANSCRIPT_PERF__ = probe
  return probe
}

export function createTranscriptGeometryDebugTools(): TranscriptGeometryDebugTools {
  return {
    start(options) {
      return restartTranscriptPerformanceProbe(options)
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
