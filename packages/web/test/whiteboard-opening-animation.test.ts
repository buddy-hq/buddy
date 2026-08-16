import { describe, expect, test } from "bun:test"
import {
  WHITEBOARD_OPENING_VARIANTS,
  buildWhiteboardOpening,
  whiteboardOpeningVariant,
} from "../src/components/whiteboard/whiteboard-opening-animation-data"
import {
  parseBuddyConfigObject,
  parseBuddyConfigValue,
  parseFiniteNumber,
  type TBuddyConfigValue,
} from "./parse-test-values"

function collectKeyframeTimes(value: TBuddyConfigValue | undefined, into: number[]): number[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeyframeTimes(item, into)
    return into
  }
  const record = parseBuddyConfigObject(value)
  if (record === undefined) return into
  if (record.a === 1 && Array.isArray(record.k)) {
    for (const frame of record.k) {
      const frameRecord = parseBuddyConfigObject(frame)
      const time = parseFiniteNumber(frameRecord?.t)
      if (time !== undefined) into.push(time)
    }
    return into
  }
  for (const nested of Object.values(record)) collectKeyframeTimes(nested, into)
  return into
}

type SegmentWindow = { ip: number; op: number }

/** Splits the sequenced comp back into per-variant windows using each variant's layer count. */
function segmentWindows(): SegmentWindow[] {
  const { data } = buildWhiteboardOpening("sequence")
  const windows: SegmentWindow[] = []
  let cursor = 0
  for (const variant of WHITEBOARD_OPENING_VARIANTS) {
    const layerCount = variant.build().layers.length
    const layers = data.layers.slice(cursor, cursor + layerCount)
    cursor += layerCount
    windows.push({
      ip: Math.min(...layers.map((layer) => layer.ip)),
      op: Math.max(...layers.map((layer) => layer.op)),
    })
  }
  expect(cursor).toBe(data.layers.length)
  return windows
}

describe("whiteboard opening animation", () => {
  test("a single variant selection returns that variant untouched", () => {
    const variant = whiteboardOpeningVariant("flow")
    const selected = buildWhiteboardOpening("flow")
    expect(selected.data.op).toBe(variant.build().op)
    expect(selected.restFrame).toBe(variant.restFrame)
  })

  test("builders hand back fresh data so two players never share one object", () => {
    const first = buildWhiteboardOpening("flow").data
    const second = buildWhiteboardOpening("flow").data
    expect(first).not.toBe(second)
    expect(first.layers[0]).not.toBe(second.layers[0])
  })

  test("the sequence plays every variant in registry order, back to back", () => {
    const windows = segmentWindows()
    const durations = WHITEBOARD_OPENING_VARIANTS.map((variant) => variant.build().op)
    windows.forEach((window, index) => {
      expect(window.op - window.ip).toBe(durations[index])
    })
    expect(windows[0].ip).toBe(0)
    // Strictly increasing windows: no composition overlaps the next.
    expect(windows[1].ip).toBeGreaterThan(windows[0].op)
    expect(windows[2].ip).toBeGreaterThan(windows[1].op)
  })

  test("every changeover uses the same gap, including the loop back to the first", () => {
    const windows = segmentWindows()
    const { data } = buildWhiteboardOpening("sequence")
    const gaps = [
      windows[1].ip - windows[0].op,
      windows[2].ip - windows[1].op,
      data.op - windows[2].op,
    ]
    expect(gaps[0]).toBeGreaterThan(0)
    expect(new Set(gaps).size).toBe(1)
  })

  test("shifted segments carry their keyframes into their own window", () => {
    const { data } = buildWhiteboardOpening("sequence")
    const windows = segmentWindows()
    let cursor = 0
    WHITEBOARD_OPENING_VARIANTS.forEach((variant, index) => {
      const layerCount = variant.build().layers.length
      const layers = data.layers.slice(cursor, cursor + layerCount)
      cursor += layerCount
      const times = collectKeyframeTimes(parseBuddyConfigValue(layers), [])
      expect(times.length).toBeGreaterThan(0)
      expect(Math.min(...times)).toBeGreaterThanOrEqual(windows[index].ip)
      expect(Math.max(...times)).toBeLessThanOrEqual(windows[index].op)
    })
  })

  test("sequenced layers keep unique indices", () => {
    const { data } = buildWhiteboardOpening("sequence")
    expect(new Set(data.layers.map((layer) => layer.ind)).size).toBe(data.layers.length)
  })

  test("the reduced-motion still frame lands inside the first composition", () => {
    const { restFrame } = buildWhiteboardOpening("sequence")
    const windows = segmentWindows()
    expect(restFrame).toBeGreaterThan(windows[0].ip)
    expect(restFrame).toBeLessThan(windows[0].op)
  })
})
