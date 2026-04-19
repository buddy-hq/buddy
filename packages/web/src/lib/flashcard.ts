export type FlashcardDueCounts = {
  new: number
  learning: number
  review: number
}

export function getFlashcardDueCount(dueCounts: FlashcardDueCounts): number {
  return dueCounts.new + dueCounts.learning + dueCounts.review
}

export function isFlashcardReviewAvailable(input: {
  dueCounts: FlashcardDueCounts
  reviewAvailable?: boolean
}): boolean {
  return input.reviewAvailable ?? getFlashcardDueCount(input.dueCounts) > 0
}
