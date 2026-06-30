import { describe, expect, test } from "bun:test"

import {
  createTranscriptGeometryReport,
  createTranscriptPerformanceProbe,
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

    probe.stop()
    globalThis.__BUDDY_TRANSCRIPT_PERF__ = undefined
    document.body.replaceChildren()
  })
})
