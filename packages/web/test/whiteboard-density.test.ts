import { describe, expect, test } from "bun:test"
import {
  resolveWhiteboardDensity,
  WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX,
} from "../src/components/whiteboard/whiteboard-density"

describe("resolveWhiteboardDensity", () => {
  test("compacts a board narrower than the stock chrome needs", () => {
    expect(resolveWhiteboardDensity(WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX - 1)).toBe("compact")
  })

  test("treats the threshold itself as compact", () => {
    expect(resolveWhiteboardDensity(WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX)).toBe("compact")
  })

  test("leaves a wide board comfortable", () => {
    expect(resolveWhiteboardDensity(WHITEBOARD_COMPACT_DENSITY_MAX_WIDTH_PX + 1)).toBe(
      "comfortable",
    )
  })

  test("stays comfortable while the board is unmeasured", () => {
    // A first-frame or detached node reads 0; compacting there would flash the chrome.
    expect(resolveWhiteboardDensity(0)).toBe("comfortable")
    expect(resolveWhiteboardDensity(Number.NaN)).toBe("comfortable")
  })
})
