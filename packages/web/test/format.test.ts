import { describe, expect, test } from "bun:test"

import { formatDuration, formatThoughtDuration } from "../src/components/chat/utils/format"

describe("formatThoughtDuration", () => {
  test("uses seconds under one minute", () => {
    expect(formatThoughtDuration(500)).toBe("1s")
    expect(formatThoughtDuration(45_000)).toBe("45s")
    expect(formatThoughtDuration(59_000)).toBe("59s")
  })

  test("uses minutes at and above one minute", () => {
    expect(formatThoughtDuration(60_000)).toBe("1m")
    expect(formatThoughtDuration(90_000)).toBe("1m 30s")
    expect(formatThoughtDuration(125_000)).toBe("2m 5s")
  })
})

describe("formatDuration", () => {
  test("omits zero seconds when duration is whole minutes", () => {
    expect(formatDuration(120_000)).toBe("2m")
  })
})
