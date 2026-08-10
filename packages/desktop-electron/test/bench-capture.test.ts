import { describe, expect, test } from "bun:test"
import { isValidBenchCaptureRectangle } from "../src/main/bench-capture"

const CAPTURE_BOUNDS = { width: 1_440, height: 900 }

describe("Bench capture rectangle validation", () => {
  test("accepts a positive safe-integer rectangle inside the visible content bounds", () => {
    expect(
      isValidBenchCaptureRectangle(
        { x: 1_000, y: 600, width: 440, height: 300 },
        CAPTURE_BOUNDS,
      ),
    ).toBeTrue()
  })

  test("rejects rectangles that extend beyond the visible content bounds", () => {
    expect(
      isValidBenchCaptureRectangle(
        { x: 0, y: 0, width: CAPTURE_BOUNDS.width + 1, height: CAPTURE_BOUNDS.height },
        CAPTURE_BOUNDS,
      ),
    ).toBeFalse()
    expect(
      isValidBenchCaptureRectangle(
        { x: CAPTURE_BOUNDS.width, y: 0, width: 1, height: 1 },
        CAPTURE_BOUNDS,
      ),
    ).toBeFalse()
  })

  test("rejects unsafe, fractional, and malformed renderer input", () => {
    expect(
      isValidBenchCaptureRectangle(
        { x: 0, y: 0, width: Number.MAX_SAFE_INTEGER + 1, height: 1 },
        CAPTURE_BOUNDS,
      ),
    ).toBeFalse()
    expect(
      isValidBenchCaptureRectangle(
        { x: 0.5, y: 0, width: 10, height: 10 },
        CAPTURE_BOUNDS,
      ),
    ).toBeFalse()
    expect(isValidBenchCaptureRectangle(null, CAPTURE_BOUNDS)).toBeFalse()
  })
})
