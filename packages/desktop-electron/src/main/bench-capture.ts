import type { BenchCaptureRectangle } from "../preload/types"
import { parseTJsonObject, parseTNumber } from "../shared/parse-external"

type TBenchCaptureBounds = {
  width: number
  height: number
}

function parseTNonNegativeSafeInteger<TValue>(value: TValue): number | undefined {
  const numeric = parseTNumber(value)
  if (numeric === undefined || !Number.isSafeInteger(numeric) || numeric < 0) {
    return undefined
  }
  return numeric
}

function parseTPositiveSafeInteger<TValue>(value: TValue): number | undefined {
  const numeric = parseTNonNegativeSafeInteger(value)
  if (numeric === undefined || numeric <= 0) {
    return undefined
  }
  return numeric
}

function isValidBenchCaptureRectangle<TValue>(
  value: TValue,
  bounds: TBenchCaptureBounds,
): value is TValue & BenchCaptureRectangle {
  const record = parseTJsonObject(value)
  if (record === undefined) return false

  const x = parseTNonNegativeSafeInteger(record.x)
  const y = parseTNonNegativeSafeInteger(record.y)
  const width = parseTPositiveSafeInteger(record.width)
  const height = parseTPositiveSafeInteger(record.height)
  const boundWidth = parseTPositiveSafeInteger(bounds.width)
  const boundHeight = parseTPositiveSafeInteger(bounds.height)
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    boundWidth === undefined ||
    boundHeight === undefined
  ) {
    return false
  }

  return x <= boundWidth - width && y <= boundHeight - height
}

export { isValidBenchCaptureRectangle }
export type { TBenchCaptureBounds as BenchCaptureBounds }
