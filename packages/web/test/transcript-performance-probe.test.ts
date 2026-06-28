import { describe, expect, test } from "bun:test"

import {
  createTranscriptPerformanceProbe,
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
})
