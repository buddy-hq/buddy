import { beforeEach, describe, expect, test } from "bun:test"
import {
  benchSurfaceUiKey,
  readFlashcardDeckSurfaceState,
  readBenchSurfaceViewport,
  useBenchSurfaceUiState,
  writeFlashcardDeckSurfaceState,
  writeBenchSurfaceViewport,
} from "../src/state/bench-surface-ui-state"
import type { BenchTarget } from "../src/lib/bench-navigation"
import { prepareFlashcardBenchTarget } from "../src/components/flashcard/flashcard-bench-target"

const TARGET = {
  type: "workspace-file",
  path: "README.md",
  viewer: "markdown",
} satisfies BenchTarget

describe("Bench surface UI state", () => {
  beforeEach(() => {
    useBenchSurfaceUiState.setState({ flashcardDeckByKey: {}, viewportByKey: {} })
  })

  test("scopes identical relative targets to their notebook", () => {
    const first = benchSurfaceUiKey({ directory: "/notebooks/first", target: TARGET })
    const second = benchSurfaceUiKey({ directory: "/notebooks/second", target: TARGET })

    writeBenchSurfaceViewport(first, { scrollTop: 120, zoom: 1.5 })

    expect(readBenchSurfaceViewport(first)).toEqual({ scrollTop: 120, zoom: 1.5 })
    expect(readBenchSurfaceViewport(second)).toBeUndefined()
  })

  test("merges viewport updates without losing another dimension", () => {
    const key = benchSurfaceUiKey({ directory: "/notebooks/first", target: TARGET })

    writeBenchSurfaceViewport(key, { zoom: 1.25, autoFit: false })
    writeBenchSurfaceViewport(key, { panX: 40, panY: 80 })

    expect(readBenchSurfaceViewport(key)).toEqual({
      zoom: 1.25,
      autoFit: false,
      panX: 40,
      panY: 80,
    })
  })

  test("sets a deck mode before returning the Bench target", () => {
    const target = prepareFlashcardBenchTarget({
      directory: "/notebooks/first",
      objectID: "deck-2",
      mode: "review",
    })
    const key = benchSurfaceUiKey({ directory: "/notebooks/first", target })

    expect(target).toEqual({
      type: "object",
      ref: {
        kind: "flashcard-deck",
        objectID: "deck-2",
        revisionID: null,
        itemID: null,
      },
      viewID: "review",
    })
    expect(useBenchSurfaceUiState.getState().flashcardDeckByKey[key]?.mode).toBe("review")
    expect(readFlashcardDeckSurfaceState(key).reviewTally.reviewed).toBe(0)
  })

  test("keeps a completed review tally and resets it only for a new review", () => {
    const target = prepareFlashcardBenchTarget({
      directory: "/notebooks/first",
      objectID: "deck-2",
      mode: "deck",
    })
    const key = benchSurfaceUiKey({ directory: "/notebooks/first", target })
    writeFlashcardDeckSurfaceState(key, {
      mode: "done",
      reviewTally: {
        reviewed: 3,
        elapsedMs: 4500,
        ratings: { again: 1, hard: 0, good: 2, easy: 0 },
      },
    })

    expect(readFlashcardDeckSurfaceState(key).reviewTally.reviewed).toBe(3)

    prepareFlashcardBenchTarget({
      directory: "/notebooks/first",
      objectID: "deck-2",
      mode: "review",
    })
    expect(readFlashcardDeckSurfaceState(key).reviewTally).toEqual({
      reviewed: 0,
      elapsedMs: 0,
      ratings: { again: 0, hard: 0, good: 0, easy: 0 },
    })
  })
})
