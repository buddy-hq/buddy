import { describe, expect, test } from "bun:test"
import {
  TRANSIENT_BENCH_SURFACE_SKETCH,
  TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING,
  resolveTransientBenchSurfaceLayoutMode,
} from "../src/components/bench/transient-bench-surface"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
} from "../src/lib/bench-navigation"

describe("transient Bench surface layout", () => {
  test("keeps the sketch docked and opens a generated whiteboard immersive", () => {
    expect(resolveTransientBenchSurfaceLayoutMode(null)).toBeNull()
    expect(resolveTransientBenchSurfaceLayoutMode(TRANSIENT_BENCH_SURFACE_SKETCH)).toBe(
      BENCH_CHAT_LAYOUT_DOCKED,
    )
    expect(
      resolveTransientBenchSurfaceLayoutMode({
        type: TRANSIENT_BENCH_SURFACE_WHITEBOARD_OPENING,
        toolKey: "message-1:tool-1",
      }),
    ).toBe(BENCH_CHAT_LAYOUT_FLOATING)
  })
})
