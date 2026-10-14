/** One complete before/after comparison for a prompt file or assembled prompt. */
export type PromptComparison = {
  /** Unique within its review. The registry prefixes this with the review ID. */
  readonly id: string
  readonly target: string
  /** Repository-relative path when this comparison has an editable source file. */
  readonly sourcePath?: string
  readonly title: string
  readonly explanation: string
  readonly before: string
  readonly after: string
  readonly beforeSummary: readonly string[]
  readonly afterSummary: readonly string[]
  readonly expectedEffects: readonly string[]
}

/** Where a proposal stands: still under review, applied to the live prompts, or kept only as a record. */
export type PromptReviewStatus = "proposed" | "applied" | "historical"

/** A prompt refactor can compare one or more prompt files. */
export type PromptReview = {
  readonly id: string
  readonly label: string
  readonly status: PromptReviewStatus
  readonly title: string
  readonly summary: string
  readonly note: string
  readonly comparisons: readonly PromptComparison[]
}

export type RegisteredPromptComparison = {
  readonly id: string
  readonly review: PromptReview
  readonly comparison: PromptComparison
}

/** Apply an exact proposed edit to a frozen before snapshot. */
export function replacePromptSpan(prompt: string, original: string, replacement: string): string {
  const start = prompt.indexOf(original)
  if (start < 0 || prompt.indexOf(original, start + original.length) >= 0) {
    throw new Error("Prompt review snapshot does not contain exactly one matching edit span")
  }
  return prompt.slice(0, start) + replacement + prompt.slice(start + original.length)
}
