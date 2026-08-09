import { describe, expect, test } from "bun:test"
import { shouldAnimateReviewSwap } from "../src/components/flashcard/flashcard-review-stage"
import { REVIEW_REDUCED_SWAP_VARIANTS } from "../src/components/flashcard/flashcard-review-motion"

describe("flashcard review stage", () => {
  test("settles the first card immediately and animates later handoffs", () => {
    expect(shouldAnimateReviewSwap(0)).toBe(false)
    expect(shouldAnimateReviewSwap(1)).toBe(true)
  })

  test("uses opacity-only card handoffs for reduced motion", () => {
    expect(REVIEW_REDUCED_SWAP_VARIANTS).toEqual({
      enter: { opacity: 0 },
      settled: {
        opacity: 1,
        transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
      },
      leave: {
        opacity: 0,
        transition: { duration: 0.08, ease: [0.4, 0.02, 0.85, 0.4] },
      },
    })
  })
})
