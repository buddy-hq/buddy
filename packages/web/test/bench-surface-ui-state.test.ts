import { beforeEach, describe, expect, test } from "bun:test"
import {
  benchSurfaceUiKey,
  readBenchSurfaceViewport,
  useBenchSurfaceUiState,
  writeBenchSurfaceViewport,
} from "../src/state/bench-surface-ui-state"
import type { BenchTarget } from "../src/lib/bench-navigation"

const TARGET = {
  type: "workspace-file",
  path: "README.md",
  viewer: "markdown",
} satisfies BenchTarget

describe("Bench surface UI state", () => {
  beforeEach(() => {
    useBenchSurfaceUiState.setState({ viewportByKey: {} })
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
})
