import "../happydom"
import { afterEach, describe, expect, test } from "bun:test"
import { isDeferredToolFallbackCollapse } from "../src/components/chat/chat-transcript"

const LARGE_ROW_HEIGHT_PX = 655
const COMPACT_FALLBACK_HEIGHT_PX = 72
const SMALL_ROW_HEIGHT_PX = 96
const FINAL_MEDIA_HEIGHT_PX = 392

function createMeasuredContent(hasDeferredFallback: boolean) {
  const root = document.createElement("div")
  if (hasDeferredFallback) {
    const fallback = document.createElement("div")
    fallback.dataset.component = "deferred-tool-fallback"
    root.append(fallback)
  }
  return root
}

describe("deferred tool collapse guard", () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  test("ignores compact deferred fallback measurements after a large cached row", () => {
    const root = createMeasuredContent(true)

    expect(
      isDeferredToolFallbackCollapse({
        root,
        previousSize: LARGE_ROW_HEIGHT_PX,
        nextSize: COMPACT_FALLBACK_HEIGHT_PX,
      }),
    ).toBe(true)
  })

  test("accepts normal small rows and real final content measurements", () => {
    const fallbackRoot = createMeasuredContent(true)
    const contentRoot = createMeasuredContent(false)

    expect(
      isDeferredToolFallbackCollapse({
        root: fallbackRoot,
        previousSize: SMALL_ROW_HEIGHT_PX,
        nextSize: COMPACT_FALLBACK_HEIGHT_PX,
      }),
    ).toBe(false)
    expect(
      isDeferredToolFallbackCollapse({
        root: fallbackRoot,
        previousSize: LARGE_ROW_HEIGHT_PX,
        nextSize: FINAL_MEDIA_HEIGHT_PX,
      }),
    ).toBe(false)
    expect(
      isDeferredToolFallbackCollapse({
        root: contentRoot,
        previousSize: LARGE_ROW_HEIGHT_PX,
        nextSize: COMPACT_FALLBACK_HEIGHT_PX,
      }),
    ).toBe(false)
  })
})
