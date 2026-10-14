import { describe, expect, test } from "bun:test"
import { PROMPT_COMPARISONS, PROMPT_REVIEWS } from "../src/components/debug/prompt-reviews"

describe("prompt review registry", () => {
  test("registers distinct complete before/after comparisons", () => {
    const reviewIDs = PROMPT_REVIEWS.map((review) => review.id)
    const comparisonIDs = PROMPT_COMPARISONS.map((entry) => entry.id)

    expect(PROMPT_REVIEWS.length).toBeGreaterThan(0)
    expect(new Set(reviewIDs).size).toBe(reviewIDs.length)
    expect(new Set(comparisonIDs).size).toBe(comparisonIDs.length)
    expect(PROMPT_COMPARISONS.length).toBe(
      PROMPT_REVIEWS.reduce((count, review) => count + review.comparisons.length, 0),
    )

    for (const entry of PROMPT_COMPARISONS) {
      expect(entry.id).toBe(`${entry.review.id}/${entry.comparison.id}`)
      expect(entry.comparison.before.trim().length).toBeGreaterThan(0)
      expect(entry.comparison.after.trim().length).toBeGreaterThan(0)
      expect(entry.comparison.before).not.toBe(entry.comparison.after)
    }
  })
})
