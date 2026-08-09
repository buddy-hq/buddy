import type { CardQueue, DeckConfig } from "../types"

type ReviewedTodayCounts = {
  newCount: number
  reviewCount: number
}

type RemainingLimits = {
  new: number
  review: number
  capNewToReview: boolean
}

function computeRemainingLimits(
  config: DeckConfig,
  reviewedToday: ReviewedTodayCounts,
): RemainingLimits {
  let review = config.reviewsPerDay - reviewedToday.reviewCount
  let newLimit = config.newPerDay - reviewedToday.newCount

  if (!config.newCardsIgnoreReviewLimit) {
    review -= reviewedToday.newCount
    newLimit = Math.min(newLimit, review)
  }

  return {
    new: Math.max(0, newLimit),
    review: Math.max(0, review),
    capNewToReview: !config.newCardsIgnoreReviewLimit,
  }
}

function incrementReviewedTodayCounts(
  counts: ReviewedTodayCounts,
  queue: CardQueue,
): ReviewedTodayCounts {
  switch (queue) {
    case "new":
      return { ...counts, newCount: counts.newCount + 1 }
    case "day-learning":
    case "review":
      return { ...counts, reviewCount: counts.reviewCount + 1 }
    case "learning":
      return counts
  }
}

export { computeRemainingLimits, incrementReviewedTodayCounts }
export type { RemainingLimits, ReviewedTodayCounts }
