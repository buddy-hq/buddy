import type { ObjectFlashcardDeckQueuedCardsResponse } from "@buddy/sdk/types"

export const FLASHCARD_QUEUE_REFETCH_FLOOR_MS = 250

export type FlashcardDueCounts = {
  new: number
  learning: number
  review: number
}

export function getFlashcardDueCounts(
  queue: ObjectFlashcardDeckQueuedCardsResponse,
): FlashcardDueCounts {
  return {
    new: queue.newCount,
    learning: queue.learningCount,
    review: queue.reviewCount,
  }
}

export function getFlashcardDueCount(
  queue: ObjectFlashcardDeckQueuedCardsResponse | undefined | null,
): number {
  if (!queue) return 0
  return queue.newCount + queue.learningCount + queue.reviewCount
}

export function isFlashcardReviewAvailable(
  queue: ObjectFlashcardDeckQueuedCardsResponse | undefined | null,
): boolean {
  return getFlashcardDueCount(queue) > 0
}

export function isFlashcardLeech(lapses: number, threshold: number): boolean {
  return threshold > 0 && lapses >= threshold
}
