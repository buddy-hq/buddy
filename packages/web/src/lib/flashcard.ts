export type FlashcardDueCounts = {
  new: number
  learning: number
  review: number
}

export function getFlashcardDueCount(dueCounts: FlashcardDueCounts | undefined | null): number {
  if (!dueCounts) return 0
  return (dueCounts.new || 0) + (dueCounts.learning || 0) + (dueCounts.review || 0)
}

export function isFlashcardReviewAvailable(input: {
  dueCounts: FlashcardDueCounts
  reviewAvailable?: boolean
}): boolean {
  return input.reviewAvailable ?? getFlashcardDueCount(input.dueCounts) > 0
}
