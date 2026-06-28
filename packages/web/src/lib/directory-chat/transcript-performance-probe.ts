const DEFAULT_MAX_TRANSCRIPT_PERF_EVENTS = 2_000
const RAF_GAP_REPORT_THRESHOLD_MS = 48

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
  | {
      type: "inline-asset"
      at: number
      rowKey: string
      action: "content-ready" | "size-change"
      width: number | undefined
      height: number | undefined
    }

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

declare global {
  var __BUDDY_TRANSCRIPT_PERF__: TranscriptPerformanceProbe | undefined
  var __BUDDY_CREATE_TRANSCRIPT_PERF_PROBE__:
    | ((options?: TranscriptPerformanceProbeOptions) => TranscriptPerformanceProbe)
    | undefined
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
  globalThis.__BUDDY_TRANSCRIPT_PERF__?.record(event)
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

globalThis.__BUDDY_CREATE_TRANSCRIPT_PERF_PROBE__ = createTranscriptPerformanceProbe
