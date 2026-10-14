import { WHITEBOARD_SELECTION_REVIEW } from "./whiteboard-selection/review"
import { VISUAL_TEACHING_SYSTEM_REVIEW } from "./visual-teaching-system/review"
import { BENCH_FEATURE_FACTS_REVIEW } from "./bench-feature-facts/review"
import { PRESENT_MEDIA_VISIBILITY_REVIEW } from "./present-media-visibility/review"
import type { PromptReview, RegisteredPromptComparison } from "./model"

/** Add new prompt refactors here; the workbench renders the registry automatically. */
export const PROMPT_REVIEWS: readonly PromptReview[] = [
  WHITEBOARD_SELECTION_REVIEW,
  VISUAL_TEACHING_SYSTEM_REVIEW,
  BENCH_FEATURE_FACTS_REVIEW,
  PRESENT_MEDIA_VISIBILITY_REVIEW,
]

export const PROMPT_COMPARISONS: readonly RegisteredPromptComparison[] = PROMPT_REVIEWS.flatMap(
  (review) =>
    review.comparisons.map((comparison) => ({
      id: `${review.id}/${comparison.id}`,
      review,
      comparison,
    })),
)
