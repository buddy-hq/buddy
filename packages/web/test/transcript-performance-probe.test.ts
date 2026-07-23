import "../happydom"
import { describe, expect, test } from "bun:test"

import {
  createTranscriptGeometryReport,
  createTranscriptPerformanceProbe,
  createTranscriptStreamTraceReport,
  formatTranscriptStreamTraceReport,
  recordTranscriptPerfEvent,
  type TranscriptPerfEvent,
} from "../src/lib/directory-chat/transcript-performance-probe"

describe("transcript performance probe", () => {
  test("keeps a bounded event buffer and summarizes transcript metrics", () => {
    const probe = createTranscriptPerformanceProbe({
      maxEvents: 4,
      observeBrowserEvents: false,
    })
    const events: TranscriptPerfEvent[] = [
      {
        type: "streaming-throughput",
        at: 1,
        live: true,
        contentLength: 10,
        deltaLength: 10,
      },
      {
        type: "scroll-write",
        at: 2,
        requestedOffset: 100,
        previousScrollTop: 100,
        nextScrollTop: 100,
        noOp: true,
      },
      {
        type: "visible-row-mount",
        at: 3,
        rowKey: "assistant:msg:part:prt",
        index: 1,
      },
      {
        type: "row-size",
        at: 4,
        index: 1,
        rowKey: "assistant:msg:part:prt",
        previousSize: 100,
        nextSize: 140,
        deltaPx: 40,
      },
      {
        type: "geometry-settlement",
        at: 5,
        rowKey: "user:msg",
        frames: 3,
        stableFrames: 2,
        lastDeltaPx: 0,
        completed: true,
      },
    ]

    for (const event of events) {
      probe.record(event)
    }

    expect(probe.events).toHaveLength(4)
    expect(probe.events[0]?.type).toBe("scroll-write")

    const summary = probe.summary()
    expect(summary.events).toBe(4)
    expect(summary.streamingUpdates).toBe(0)
    expect(summary.scrollWrites).toBe(1)
    expect(summary.scrollNoOps).toBe(1)
    expect(summary.bottomAnchorRepairs).toBe(0)
    expect(summary.visibleRowMounts).toBe(1)
    expect(summary.rowSizeChanges).toBe(1)
    expect(summary.geometrySettlements).toBe(1)
  })

  test("reports large row geometry jumps with nearby lifecycle evidence", () => {
    const rowKey = "assistant:msg:part:prt_figure"
    const events: TranscriptPerfEvent[] = [
      {
        type: "visible-row-mount",
        at: 100,
        rowKey,
        index: 3,
      },
      {
        type: "inline-asset",
        at: 120,
        rowKey,
        action: "content-ready",
        width: 800,
        height: 600,
      },
      {
        type: "row-size",
        at: 160,
        index: 3,
        rowKey,
        previousSize: 72,
        nextSize: 655,
        deltaPx: 583,
      },
      {
        type: "row-size",
        at: 200,
        index: 4,
        rowKey: "assistant:msg:part:small",
        previousSize: 48,
        nextSize: 52,
        deltaPx: 4,
      },
    ]

    const report = createTranscriptGeometryReport(events, {
      thresholdPx: 100,
      limit: 10,
    })

    expect(report.jumpCount).toBe(1)
    expect(report.acceptedJumpCount).toBe(1)
    expect(report.ignoredJumpCount).toBe(0)
    expect(report.jumps[0]?.rowKey).toBe(rowKey)
    expect(report.jumps[0]?.deltaPx).toBe(583)
    expect(report.jumps[0]?.recentMount).toBe(true)
    expect(report.jumps[0]?.recentInlineAsset?.action).toBe("content-ready")
    expect(report.topRows[0]?.rowKey).toBe(rowKey)
    expect(report.topRows[0]?.maxAbsDeltaPx).toBe(583)
  })

  test("separates ignored collapse attempts from accepted geometry jumps", () => {
    const rowKey = "assistant:msg:part:prt_widget"
    const events: TranscriptPerfEvent[] = [
      {
        type: "row-size",
        at: 1,
        index: 1,
        rowKey,
        previousSize: 489,
        nextSize: 72,
        deltaPx: -417,
        ignored: true,
      },
      {
        type: "row-size",
        at: 2,
        index: 1,
        rowKey,
        previousSize: 489,
        nextSize: 823,
        deltaPx: 334,
      },
    ]

    const report = createTranscriptGeometryReport(events, {
      thresholdPx: 100,
      limit: 10,
    })

    expect(report.jumpCount).toBe(2)
    expect(report.acceptedJumpCount).toBe(1)
    expect(report.ignoredJumpCount).toBe(1)
    expect(report.topRows[0]?.ignoredSizeEvents).toBe(1)
    expect(report.topRows[0]?.maxAbsDeltaPx).toBe(334)
    expect(report.topRows[0]?.totalAbsDeltaPx).toBe(334)
  })

  test("enriches row-size events with the measured transcript row shell", () => {
    document.body.replaceChildren()
    const row = document.createElement("div")
    row.dataset.timelineKey = "assistant:msg:part:prt_compact"
    row.innerHTML = `
      <div data-component="tool-part-wrapper">
        <button type="button">render_figure</button>
      </div>
      <div
        data-markdown-document="part"
        data-markdown-source-length="14000"
        data-markdown-source-hash="hash"
        data-markdown-phase="streaming"
        data-markdown-branch="segmented-lazy"
      >
        <div data-markdown-segment-key="part:segment:0">
          <div data-markdown-virtual-block-key="part:virtual-block:0" data-markdown-residency="resident">
            <div
              data-markdown-block-key="part:block:0"
              data-markdown-parse-state="ready"
              data-markdown-parse-duration-ms="8.25"
              data-markdown-parsed-source-hash="hash"
            ></div>
          </div>
          <div data-markdown-virtual-block-key="part:virtual-block:1" data-markdown-residency="placeholder"></div>
        </div>
      </div>
    `
    Object.defineProperty(row, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        width: 320,
        height: 72,
        top: 10,
        right: 320,
        bottom: 82,
        left: 0,
        toJSON: () => ({}),
      }),
    })
    document.body.append(row)

    const probe = createTranscriptPerformanceProbe({
      maxEvents: 10,
      observeBrowserEvents: false,
    })
    globalThis.__BUDDY_TRANSCRIPT_PERF__ = probe

    recordTranscriptPerfEvent({
      type: "row-size",
      at: 1,
      index: 1,
      rowKey: row.dataset.timelineKey,
      previousSize: 72,
      nextSize: 655,
      deltaPx: 583,
    })

    const event = probe.events[0]
    expect(event?.type).toBe("row-size")
    if (event?.type !== "row-size") {
      throw new Error("expected row-size event")
    }
    expect(event.shell?.shellKind).toBe("compact-tool")
    expect(event.shell?.rowHeight).toBe(72)
    expect(event.shell?.buttonCount).toBe(1)
    expect(event.shell?.mathPlaceholderCount).toBe(0)
    expect(event.shell?.katexCount).toBe(0)
    expect(event.shell?.markdown).toEqual({
      documentCount: 1,
      sourceLength: 14_000,
      sourceHash: "hash",
      phase: "streaming",
      branch: "segmented-lazy",
      segmentKeys: ["part:segment:0"],
      blockKeys: ["part:block:0"],
      virtualBlockKeys: ["part:virtual-block:0", "part:virtual-block:1"],
      residentBlockCount: 1,
      placeholderBlockCount: 1,
      parseStates: ["ready"],
      parseDurationsMs: [8.25],
      parsedSourceHashes: ["hash"],
      images: [],
    })

    probe.stop()
    globalThis.__BUDDY_TRANSCRIPT_PERF__ = undefined
    document.body.replaceChildren()
  })

  test("captures Markdown image readiness and intrinsic geometry", () => {
    document.body.replaceChildren()
    const row = document.createElement("div")
    row.dataset.timelineKey = "assistant:msg:part:prt_image"
    row.innerHTML = `
      <div data-markdown-document="image-part" data-markdown-source-length="80">
        <img
          data-markdown-image="true"
          data-markdown-image-state="ready"
          src="https://assets.example/known.png"
          alt="known"
        />
      </div>
    `
    Object.defineProperty(row, "getBoundingClientRect", {
      value: () => new DOMRect(0, 0, 320, 180),
    })
    const image = row.querySelector<HTMLImageElement>("img")
    if (!image) throw new Error("expected Markdown image")
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 640 },
      naturalHeight: { configurable: true, value: 360 },
      getBoundingClientRect: {
        configurable: true,
        value: () => new DOMRect(0, 0, 320, 180),
      },
    })
    document.body.append(row)

    const probe = createTranscriptPerformanceProbe({
      maxEvents: 10,
      observeBrowserEvents: false,
    })
    globalThis.__BUDDY_TRANSCRIPT_PERF__ = probe
    recordTranscriptPerfEvent({
      type: "row-size",
      at: 1,
      index: 1,
      rowKey: row.dataset.timelineKey,
      previousSize: 160,
      nextSize: 180,
      deltaPx: 20,
    })

    const event = probe.events[0]
    expect(event?.type).toBe("row-size")
    if (event?.type !== "row-size") throw new Error("expected row-size event")
    expect(event.shell?.markdown?.images).toEqual([
      {
        state: "ready",
        complete: true,
        naturalWidth: 640,
        naturalHeight: 360,
        renderedWidth: 320,
        renderedHeight: 180,
      },
    ])

    probe.stop()
    globalThis.__BUDDY_TRANSCRIPT_PERF__ = undefined
    document.body.replaceChildren()
  })

  test("freezes an ordered in-flight rendering trace when recording stops", () => {
    const probe = createTranscriptPerformanceProbe({
      maxEvents: 10,
      observeBrowserEvents: false,
    })
    probe.record({
      type: "render-state",
      at: probe.startedAt + 5,
      rowKey: "assistant:math",
      mutationCount: 2,
      shell: {
        shellKind: "unknown",
        rowHeight: 120,
        rowTop: 0,
        rowBottom: 120,
        textPreview: "equation",
        hasToolWrapper: false,
        hasDeferredToolFallback: false,
        hasObjectCard: false,
        hasMermaidLoading: false,
        hasMermaidDiagram: false,
        hasMermaidError: false,
        mathPlaceholderCount: 1,
        katexCount: 0,
        imageCount: 0,
        svgCount: 0,
        iframeCount: 0,
        videoCount: 0,
        audioCount: 0,
        buttonCount: 0,
      },
    })
    probe.record({
      type: "bottom-anchor-repair",
      at: probe.startedAt + 9,
      distanceFromEnd: 42,
    })
    probe.stop()
    probe.record({
      type: "streaming-throughput",
      at: probe.startedAt + 12,
      live: true,
      contentLength: 20,
      deltaLength: 20,
    })

    const report = createTranscriptStreamTraceReport(probe)

    expect(report.recording).toBe(false)
    expect(report.stoppedAt).toBeNumber()
    expect(report.events).toHaveLength(2)
    expect(report.events.map((entry) => entry.sequence)).toEqual([1, 2])
    expect(report.events.map((entry) => entry.offsetMs)).toEqual([5, 9])
    expect(report.summary.renderStateSamples).toBe(1)
    expect(report.summary.bottomAnchorRepairs).toBe(1)
  })

  test("excludes buffered browser history from a new capture", () => {
    const probe = createTranscriptPerformanceProbe({
      maxEvents: 10,
      observeBrowserEvents: false,
    })
    probe.record({
      type: "long-task",
      at: probe.startedAt - 100,
      durationMs: 250,
    })
    probe.record({
      type: "layout-shift",
      at: probe.startedAt + 5,
      value: 0.12,
      sources: [],
    })

    const report = createTranscriptStreamTraceReport(probe)

    expect(report.events).toHaveLength(1)
    expect(report.events[0]?.event.type).toBe("layout-shift")
    expect(report.events[0]?.offsetMs).toBe(5)
    expect(report.summary.longTasks).toBe(0)
    expect(report.summary.layoutShiftScore).toBe(0.12)
  })

  test("ranks instability and embeds a direct source pointer with its evidence window", () => {
    const probe = createTranscriptPerformanceProbe({
      maxEvents: 20,
      observeBrowserEvents: false,
    })
    const tailRowKey = "activity:msg_terminal:1"
    const at = probe.startedAt
    const events: TranscriptPerfEvent[] = [
      {
        type: "streaming-throughput",
        at: at + 100,
        live: false,
        contentLength: 157,
        deltaLength: 0,
      },
      {
        type: "row-size",
        at: at + 110,
        index: 19,
        rowKey: undefined,
        previousSize: 52,
        nextSize: 12,
        deltaPx: -40,
      },
      {
        type: "scroll-write",
        at: at + 111,
        requestedOffset: 1_017,
        previousScrollTop: 1_017,
        nextScrollTop: 977,
        noOp: false,
      },
      {
        type: "visible-row-mount",
        at: at + 112,
        rowKey: tailRowKey,
        index: 19,
      },
      {
        type: "scroll-write",
        at: at + 113,
        requestedOffset: 1_029,
        previousScrollTop: 977,
        nextScrollTop: 1_029,
        noOp: false,
      },
      {
        type: "visible-row-unmount",
        at: at + 114,
        rowKey: tailRowKey,
        index: 19,
      },
      {
        type: "scroll-write",
        at: at + 115,
        requestedOffset: 977,
        previousScrollTop: 1_029,
        nextScrollTop: 977,
        noOp: false,
      },
      {
        type: "visible-row-mount",
        at: at + 116,
        rowKey: tailRowKey,
        index: 19,
      },
      {
        type: "layout-shift",
        at: at + 117,
        value: 0.1293,
        sources: [
          {
            rowKey: tailRowKey,
            timelineRow: "Activity",
            component: undefined,
            nodeName: "article",
            textPreview: "Pondering",
            previousRect: undefined,
            currentRect: undefined,
          },
        ],
      },
    ]
    for (const event of events) probe.record(event)

    const report = createTranscriptStreamTraceReport(probe)
    const rowSizeFinding = report.diagnostics.findings.find(
      (finding) => finding.kind === "row-size",
    )
    const scrollFinding = report.diagnostics.findings.find(
      (finding) => finding.kind === "scroll-oscillation",
    )
    const layoutFinding = report.diagnostics.findings.find(
      (finding) => finding.kind === "layout-shift",
    )

    expect(report.schemaVersion).toBe(2)
    expect(report.geometry.thresholdPx).toBe(16)
    expect(report.geometry.acceptedJumpCount).toBe(1)
    expect(report.diagnostics.severity).toBe("critical")
    expect(report.diagnostics.headline).toContain("evidence is embedded")
    expect(rowSizeFinding?.origin.rowKey).toBe(tailRowKey)
    expect(rowSizeFinding?.origin.derivedFromSequence).toBe(4)
    expect(rowSizeFinding?.pointer.primarySequence).toBe(2)
    expect(rowSizeFinding?.explanation).toContain("Terminal phase starts at #1")
    expect(rowSizeFinding?.evidence.map((entry) => entry.sequence)).toContain(2)
    expect(rowSizeFinding?.evidence.map((entry) => entry.sequence)).toContain(4)
    expect(scrollFinding?.title).toContain("Scroll reversed 2×")
    expect(scrollFinding?.origin.rowKey).toBe(tailRowKey)
    expect(scrollFinding?.evidence.map((entry) => entry.sequence)).toEqual(
      expect.arrayContaining([2, 3, 4, 5, 6, 7, 8, 9]),
    )
    expect(layoutFinding?.origin.rowKey).toBe(tailRowKey)
    expect(layoutFinding?.origin.derivedFromSequence).toBe(9)
    expect(layoutFinding?.origin.layoutShiftSources[0]?.timelineRow).toBe("Activity")
    const serialized = formatTranscriptStreamTraceReport(report)
    expect(serialized).toContain('"schemaVersion": 2')
    expect(serialized.indexOf('\n  "diagnostics"')).toBeLessThan(
      serialized.indexOf('\n  "events": ['),
    )
  })

  test("records stop request timing separately from renderer settlement", () => {
    const probe = createTranscriptPerformanceProbe({
      maxEvents: 10,
      observeBrowserEvents: false,
    })
    probe.record({
      type: "abort-lifecycle",
      at: probe.startedAt + 10,
      phase: "requested",
    })
    probe.record({
      type: "abort-lifecycle",
      at: probe.startedAt + 85,
      phase: "settled",
      durationMs: 75,
      outcome: "success",
    })
    probe.record({
      type: "stream-buffer",
      at: probe.startedAt + 11,
      phase: "session-fence",
      sessionID: "session-1",
      discardedEvents: 7,
    })
    probe.record({
      type: "stream-buffer",
      at: probe.startedAt + 86,
      phase: "session-resume",
      sessionID: "session-1",
      discardedEvents: 2,
    })
    probe.record({
      type: "stream-buffer",
      at: probe.startedAt + 90,
      phase: "flush",
      queuedEvents: 12,
      appliedEvents: 3,
    })

    const summary = probe.summary()
    expect(summary.abortRequests).toBe(1)
    expect(summary.maxAbortLatencyMs).toBe(75)
    expect(summary.streamSessionFences).toBe(1)
    expect(summary.streamEventsDiscarded).toBe(9)
    expect(summary.streamFlushes).toBe(1)
    expect(summary.streamEventsQueued).toBe(12)
    expect(summary.streamEventsApplied).toBe(3)
  })
})
