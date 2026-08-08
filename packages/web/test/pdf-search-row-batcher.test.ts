import { describe, expect, test } from "bun:test"
import { createPdfSearchRowBatcher } from "../src/components/readers/pdf/pdf-search-row-batcher"
import type {
  ReaderSearchResult,
  ReaderSearchRow,
} from "../src/components/readers/reader-types"

const RESULT_COUNT = 10_000
const FRAME_ID = 7

function searchResult(index: number): ReaderSearchResult {
  return {
    id: `result-${index}`,
    anchor: {
      kind: "pdf-text",
      segments: [{ pageIndex: index, quads: [] }],
      quote: { exact: `Match ${index}` },
    },
    excerpt: { pre: "", match: "Match", post: "" },
  }
}

describe("PDF search row batching", () => {
  test("coalesces a large streamed result set into one scheduled state flush", () => {
    let scheduledFlush: (() => void) | undefined
    let scheduleCount = 0
    const flushedRows: ReaderSearchRow[][] = []
    const batcher = createPdfSearchRowBatcher({
      schedule: (flush) => {
        scheduleCount += 1
        scheduledFlush = flush
        return FRAME_ID
      },
      cancelScheduled: () => undefined,
      onRows: (rows) => flushedRows.push(rows),
    })

    for (let index = 0; index < RESULT_COUNT; index += 1) {
      batcher.queue([searchResult(index)])
    }

    expect(scheduleCount).toBe(1)
    expect(flushedRows).toEqual([])
    scheduledFlush?.()
    expect(flushedRows).toHaveLength(1)
    expect(flushedRows[0]).toHaveLength(RESULT_COUNT)
  })

  test("drops pending rows when a search is cancelled", () => {
    let scheduledFlush: (() => void) | undefined
    const cancelledFrames: number[] = []
    const flushedRows: ReaderSearchRow[][] = []
    const batcher = createPdfSearchRowBatcher({
      schedule: (flush) => {
        scheduledFlush = flush
        return FRAME_ID
      },
      cancelScheduled: (frame) => cancelledFrames.push(frame),
      onRows: (rows) => flushedRows.push(rows),
    })

    batcher.queue([searchResult(0)])
    batcher.cancel()
    scheduledFlush?.()

    expect(cancelledFrames).toEqual([FRAME_ID])
    expect(flushedRows).toEqual([])
  })
})
