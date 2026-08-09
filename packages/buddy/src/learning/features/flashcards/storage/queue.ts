import type {
  CardQueue,
  DeckConfig,
  FlashcardCard,
  FlashcardQueueCardSnapshot,
  FlashcardQueueLease,
  FlashcardQueuedCards,
} from "../types"
import { computeRemainingLimits, type ReviewedTodayCounts } from "./limits"
import { MINUTES_TO_MS, type SchedulerTiming } from "./timing"

const DEFAULT_FLASHCARD_QUEUE_FETCH_LIMIT = 1
const MAX_FLASHCARD_QUEUE_FETCH_LIMIT = 100
const LEARNING_REQUEUE_GAP_MS = 1000

type BuildFlashcardQueueInput = {
  cards: readonly FlashcardCard[]
  config: DeckConfig
  reviewedToday: ReviewedTodayCounts
  timing: SchedulerTiming
  fetchLimit: number
}

function effectiveCardQueue(card: FlashcardCard): CardQueue {
  switch (card.state) {
    case "new":
      return "new"
    case "review":
      return "review"
    case "learning":
    case "relearning":
      return card.queue === "day-learning" ? "day-learning" : "learning"
  }
}

function flashcardQueueCardSnapshot(card: FlashcardCard): FlashcardQueueCardSnapshot {
  return {
    cardID: card.cardID,
    state: card.state,
    ...(card.queue === undefined ? {} : { queue: card.queue }),
    due: card.due,
    interval: card.interval,
    easeFactor: card.easeFactor,
    reps: card.reps,
    lapses: card.lapses,
    remainingSteps: card.remainingSteps,
    ...(card.lastReviewAt === undefined ? {} : { lastReviewAt: card.lastReviewAt }),
  }
}

function createFlashcardQueueLease(card: FlashcardCard, queuedAt: number): FlashcardQueueLease {
  return {
    queuedAt,
    card: flashcardQueueCardSnapshot(card),
  }
}

function flashcardQueueLeaseMatchesCard(lease: FlashcardQueueLease, card: FlashcardCard): boolean {
  const snapshot = flashcardQueueCardSnapshot(card)
  return (
    lease.card.cardID === snapshot.cardID &&
    lease.card.state === snapshot.state &&
    lease.card.queue === snapshot.queue &&
    lease.card.due === snapshot.due &&
    lease.card.interval === snapshot.interval &&
    lease.card.easeFactor === snapshot.easeFactor &&
    lease.card.reps === snapshot.reps &&
    lease.card.lapses === snapshot.lapses &&
    lease.card.remainingSteps === snapshot.remainingSteps &&
    lease.card.lastReviewAt === snapshot.lastReviewAt
  )
}

function compareDueCards(left: FlashcardCard, right: FlashcardCard): number {
  return left.due - right.due || left.cardID.localeCompare(right.cardID)
}

function compareIntradayLearningCards(left: FlashcardCard, right: FlashcardCard): number {
  const leftNeverAttempted = left.reps === 0 ? 1 : 0
  const rightNeverAttempted = right.reps === 0 ? 1 : 0
  return (
    leftNeverAttempted - rightNeverAttempted ||
    left.due - right.due ||
    left.cardID.localeCompare(right.cardID)
  )
}

function earliestDue(cards: readonly FlashcardCard[]): number | null {
  let earliest: number | null = null
  for (const card of cards) {
    if (earliest === null || card.due < earliest) {
      earliest = card.due
    }
  }
  return earliest
}

function earliestTimestamp(timestamps: readonly (number | null)[]): number | null {
  let earliest: number | null = null
  for (const timestamp of timestamps) {
    if (timestamp !== null && (earliest === null || timestamp < earliest)) {
      earliest = timestamp
    }
  }
  return earliest
}

/**
 * Port of Anki's requeue_learning_entry() guard. The caller supplies the
 * second queue entry from the queue that produced the answered card; if it is
 * an ahead-learning card, the main queue has collapsed and that card should
 * be allowed to appear before the just-answered card.
 */
function learningRequeueDue(input: {
  scheduledQueue: CardQueue
  scheduledDue: number
  nextQueuedCard: FlashcardCard | undefined
  learnAheadCutoff: number
}): number {
  const nextCard = input.nextQueuedCard
  if (
    input.scheduledQueue !== "learning" ||
    input.scheduledDue > input.learnAheadCutoff ||
    nextCard === undefined ||
    effectiveCardQueue(nextCard) !== "learning" ||
    nextCard.due < input.scheduledDue ||
    nextCard.due + LEARNING_REQUEUE_GAP_MS >= input.learnAheadCutoff
  ) {
    return input.scheduledDue
  }

  return nextCard.due + LEARNING_REQUEUE_GAP_MS
}

/** Port of Anki's queue/builder/intersperser.rs for its default MixWithReviews mode. */
function intersperseCards(
  first: readonly FlashcardCard[],
  second: readonly FlashcardCard[],
): FlashcardCard[] {
  const result: FlashcardCard[] = []
  const ratio = Math.fround((first.length + 1) / (second.length + 1))
  let firstIndex = 0
  let secondIndex = 0

  while (firstIndex < first.length || secondIndex < second.length) {
    if (firstIndex >= first.length) {
      const card = second[secondIndex]
      if (card) result.push(card)
      secondIndex++
      continue
    }
    if (secondIndex >= second.length) {
      const card = first[firstIndex]
      if (card) result.push(card)
      firstIndex++
      continue
    }

    const relativeSecondIndex = Math.fround((secondIndex + 1) * ratio)
    if (relativeSecondIndex < firstIndex + 1) {
      const card = second[secondIndex]
      if (card) result.push(card)
      secondIndex++
    } else {
      const card = first[firstIndex]
      if (card) result.push(card)
      firstIndex++
    }
  }

  return result
}

/**
 * Build the active review queue and its counts together.
 *
 * This is Buddy's equivalent of Anki's QueueBuilder + QueuedCards boundary:
 * persisted card state enters here, and product-facing availability leaves
 * here. Callers must not reconstruct counts from raw cards.
 */
function buildFlashcardQueue(input: BuildFlashcardQueueInput): FlashcardQueuedCards {
  const learnAheadCutoff = Math.min(
    input.timing.nextDayAt,
    input.timing.now + input.config.learnAheadMinutes * MINUTES_TO_MS,
  )

  const intradayNow: FlashcardCard[] = []
  const intradayAhead: FlashcardCard[] = []
  const intradayLater: FlashcardCard[] = []
  const interdayDue: FlashcardCard[] = []
  const interdayLater: FlashcardCard[] = []
  const reviewDue: FlashcardCard[] = []
  const reviewLater: FlashcardCard[] = []
  const newCards: FlashcardCard[] = []

  for (const card of input.cards) {
    switch (effectiveCardQueue(card)) {
      case "new":
        newCards.push(card)
        break
      case "review":
        if (card.due <= input.timing.now) {
          reviewDue.push(card)
        } else {
          reviewLater.push(card)
        }
        break
      case "day-learning":
        if (card.due <= input.timing.now) {
          interdayDue.push(card)
        } else {
          interdayLater.push(card)
        }
        break
      case "learning":
        if (card.due <= input.timing.now) {
          intradayNow.push(card)
        } else if (card.due <= learnAheadCutoff) {
          intradayAhead.push(card)
        } else {
          intradayLater.push(card)
        }
        break
    }
  }

  const sortedIntradayNow = intradayNow.toSorted(compareIntradayLearningCards)
  const sortedIntradayAhead = intradayAhead.toSorted(compareIntradayLearningCards)
  const sortedInterdayDue = interdayDue.toSorted(compareDueCards)
  const sortedReviewDue = reviewDue.toSorted(compareDueCards)
  const sortedNewCards = newCards.toSorted(
    (left, right) =>
      left.templateIdx - right.templateIdx || left.cardID.localeCompare(right.cardID),
  )

  const limits = computeRemainingLimits(input.config, input.reviewedToday)
  const admittedInterday = sortedInterdayDue.slice(0, limits.review)
  let remainingReview = Math.max(0, limits.review - admittedInterday.length)
  const admittedReview = sortedReviewDue.slice(0, remainingReview)
  remainingReview = Math.max(0, remainingReview - admittedReview.length)

  const remainingNew = limits.capNewToReview ? Math.min(limits.new, remainingReview) : limits.new
  const admittedNew = sortedNewCards.slice(0, remainingNew)

  const learningCount =
    sortedIntradayNow.length + admittedInterday.length + sortedIntradayAhead.length
  const reviewAndInterday = intersperseCards(admittedReview, admittedInterday)
  const mainQueue = intersperseCards(reviewAndInterday, admittedNew)
  const ordered = [...sortedIntradayNow, ...mainQueue, ...sortedIntradayAhead]
  const firstQueuedCard = ordered[0]
  const boundedFetchLimit = Math.max(0, Math.min(input.fetchLimit, MAX_FLASHCARD_QUEUE_FETCH_LIMIT))
  const nextLearningAt = earliestDue([...intradayLater, ...interdayLater])
  const nextDueAt = earliestDue([...intradayLater, ...interdayLater, ...reviewLater])
  /* The flags are these counts thresholded at zero, so they are derived from
     them rather than recomputed — otherwise a change to one admission rule can
     leave the boolean and the number disagreeing. */
  const newHeldBack = sortedNewCards.length - admittedNew.length
  const reviewHeldBack =
    sortedInterdayDue.length +
    sortedReviewDue.length -
    (admittedInterday.length + admittedReview.length)
  const newLimitReached = newHeldBack > 0
  const reviewLimitReached = reviewHeldBack > 0
  const nextIntradayAvailableAt = earliestDue(intradayLater)
  const needsDayBoundaryRefresh =
    interdayLater.length > 0 || reviewLater.length > 0 || newLimitReached || reviewLimitReached
  const nextQueueAt = earliestTimestamp([
    nextIntradayAvailableAt === null
      ? null
      : nextIntradayAvailableAt - input.config.learnAheadMinutes * MINUTES_TO_MS,
    needsDayBoundaryRefresh ? input.timing.nextDayAt : null,
  ])

  return {
    queuedCardIDs: ordered.map((card) => card.cardID),
    cards: ordered.slice(0, boundedFetchLimit),
    queueLease: firstQueuedCard
      ? createFlashcardQueueLease(firstQueuedCard, input.timing.now)
      : null,
    newCount: admittedNew.length,
    learningCount,
    reviewCount: admittedReview.length,
    resolvedConfig: {
      newPerDay: input.config.newPerDay,
      reviewsPerDay: input.config.reviewsPerDay,
      leechThreshold: input.config.leechThreshold,
    },
    completion: {
      nextLearningAt,
      nextDueAt,
      nextQueueAt,
      newLimitReached,
      reviewLimitReached,
      /* All of these had to be computed to decide admission. Returning them is
         what lets a client say "34 more are waiting" without a second copy of
         the limit and rollover maths. */
      newHeldBack,
      reviewHeldBack,
      learningLaterToday: intradayLater.length,
      returningLater: reviewLater.length + interdayLater.length,
      reviewedToday: {
        newCount: input.reviewedToday.newCount,
        reviewCount: input.reviewedToday.reviewCount,
      },
    },
  }
}

export {
  DEFAULT_FLASHCARD_QUEUE_FETCH_LIMIT,
  MAX_FLASHCARD_QUEUE_FETCH_LIMIT,
  buildFlashcardQueue,
  effectiveCardQueue,
  flashcardQueueLeaseMatchesCard,
  intersperseCards,
  learningRequeueDue,
}
