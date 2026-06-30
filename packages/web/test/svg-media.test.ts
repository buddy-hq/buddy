import { describe, expect, test } from "bun:test"
import { isSvgMedia } from "../src/lib/svg-media"

describe("SVG media detection", () => {
  test("detects SVG MIME types with optional parameters", () => {
    expect(isSvgMedia({ mimeType: "image/svg+xml" })).toBe(true)
    expect(isSvgMedia({ mimeType: "IMAGE/SVG+XML; charset=utf-8" })).toBe(true)
  })

  test("falls back to case-insensitive file extensions", () => {
    expect(isSvgMedia({ fileName: "diagram.SVG" })).toBe(true)
    expect(isSvgMedia({ fileName: "diagram.png", mimeType: "image/png" })).toBe(false)
  })
})
