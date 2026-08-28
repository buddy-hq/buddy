import { describe, expect, test } from "bun:test"
import { shouldAnimateReviewSwap } from "../src/components/flashcard/flashcard-review-stage"

describe("flashcard review stage", () => {
  test("settles the first card immediately and animates later handoffs", () => {
    expect(shouldAnimateReviewSwap(0)).toBe(false)
    expect(shouldAnimateReviewSwap(1)).toBe(true)
  })
})
