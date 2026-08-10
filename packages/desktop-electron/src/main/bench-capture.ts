import type { BenchCaptureRectangle } from "../preload/types"

type BenchCaptureBounds = {
  width: number
  height: number
}

type UnknownRecord = Record<PropertyKey, unknown>

function isObjectRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

function isValidBenchCaptureRectangle(
  value: unknown,
  bounds: BenchCaptureBounds,
): value is BenchCaptureRectangle {
  if (
    !isObjectRecord(value) ||
    !isNonNegativeSafeInteger(value.x) ||
    !isNonNegativeSafeInteger(value.y) ||
    !isPositiveSafeInteger(value.width) ||
    !isPositiveSafeInteger(value.height) ||
    !isPositiveSafeInteger(bounds.width) ||
    !isPositiveSafeInteger(bounds.height)
  ) {
    return false
  }

  return value.x <= bounds.width - value.width && value.y <= bounds.height - value.height
}

export { isValidBenchCaptureRectangle }
export type { BenchCaptureBounds }
