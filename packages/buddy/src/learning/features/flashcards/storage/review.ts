import { generateObjectID } from "../../../../objects"
import { assertIdempotencyRequestHash } from "../../../../http/idempotency"
import { scheduleReview } from "./scheduler"
import {
  DeckConfigSchema,
  ReviewRecordSchema,
  type CardRating,
  type FlashcardCard,
  type FlashcardQueueLease,
  type FlashcardQueuedCards,
  type ReviewRecord,
  type SubmitReviewOutput,
} from "../types"
import { readFlashcardDeckObject, readFlashcardObjectReviewedTodayCounts } from "./read-deck"
import {
  commitFlashcardObjectReviewTransaction,
  flashcardReviewRequestHash,
  listPendingFlashcardReviewIngestions,
  markFlashcardReviewIngestionCompleted,
  readCommittedFlashcardObjectReview,
  recoverPendingFlashcardObjectReview,
  writeRecoveredFlashcardReviewAlias,
  writePendingFlashcardObjectReviewTransaction,
} from "./review-transaction"
import type { CommittedFlashcardReview } from "./review-transaction"
import { ingestFlashcardReview } from "../../memory"
import {
  buildFlashcardQueue,
  effectiveCardQueue,
  flashcardQueueLeaseMatchesCard,
  learningRequeueDue,
} from "./queue"
import { incrementReviewedTodayCounts } from "./limits"
import { MINUTES_TO_MS, schedulerTiming, schedulingDayKey } from "./timing"

const FLASHCARD_REVIEW_QUEUE_SEPARATOR = "\u0000"
const FLASHCARD_QUEUE_LEASE_FUTURE_SKEW_MS = 60_000

const flashcardReviewQueues = new Map<string, Promise<void>>()

class FlashcardCardNotFoundError extends Error {
  constructor(cardID: string) {
    super(`Flashcard card '${cardID}' was not found.`)
    this.name = "FlashcardCardNotFoundError"
  }
}

class FlashcardCardNotQueuedError extends Error {
  constructor(cardID: string) {
    super(`Flashcard card '${cardID}' is not the next queued card.`)
    this.name = "FlashcardCardNotQueuedError"
  }
}

function flashcardObjectReviewQueueKey(directory: string, objectID: string): string {
  return `${directory}${FLASHCARD_REVIEW_QUEUE_SEPARATOR}${objectID}`
}

async function runFlashcardObjectReviewMutation<T>(
  input: { directory: string; objectID: string },
  operation: () => Promise<T>,
): Promise<T> {
  const key = flashcardObjectReviewQueueKey(input.directory, input.objectID)
  const previous = flashcardReviewQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  const tail = current.then(
    () => undefined,
    () => undefined,
  )
  flashcardReviewQueues.set(key, tail)

  try {
    return await current
  } finally {
    if (flashcardReviewQueues.get(key) === tail) {
      flashcardReviewQueues.delete(key)
    }
  }
}

async function reconcileFlashcardReviewIngestion(input: {
  directory: string
  record: CommittedFlashcardReview
}): Promise<void> {
  if (input.record.ingestion.completed) return
  const ingestion = input.record.ingestion
  await ingestFlashcardReview({
    directory: input.directory,
    eventID: ingestion.eventID,
    eventCreatedAt: ingestion.eventCreatedAt,
    objectID: ingestion.objectID,
    cardID: ingestion.cardID,
    deckTitle: ingestion.deckTitle,
    tags: ingestion.tags,
    rating: ingestion.rating,
    previousState: ingestion.previousState,
    newState: ingestion.newState,
    isLeech: ingestion.isLeech,
    nextDue: ingestion.nextDue,
  })
  await markFlashcardReviewIngestionCompleted(input)
}

async function reconcilePendingFlashcardReviewIngestions(input: {
  directory: string
  objectID: string
}): Promise<void> {
  const pending = await listPendingFlashcardReviewIngestions(input.directory, input.objectID)
  for (const record of pending) {
    await reconcileFlashcardReviewIngestion({ directory: input.directory, record }).catch(
      (error) => {
        console.warn("Failed to reconcile a committed flashcard review into learner memory:", error)
      },
    )
  }
}

async function submitFlashcardObjectReview(input: {
  directory: string
  objectID: string
  cardID: string
  queueLease: FlashcardQueueLease
  rating: CardRating
  timeTakenMs: number
  submissionID: string
}): Promise<SubmitReviewOutput> {
  return runFlashcardObjectReviewMutation<SubmitReviewOutput>(input, async () => {
    const recovered = await recoverPendingFlashcardObjectReview(input.directory, input.objectID)
    await reconcilePendingFlashcardReviewIngestions(input)
    const requestHash = flashcardReviewRequestHash(input)
    const committed = await readCommittedFlashcardObjectReview(
      input.directory,
      input.objectID,
      input.submissionID,
    )
    if (committed) {
      assertIdempotencyRequestHash(committed.requestHash, requestHash)
      return committed.output
    }

    if (recovered?.requestHash === requestHash) {
      return writeRecoveredFlashcardReviewAlias({ ...input, recovered })
    }

    const deck = await readFlashcardDeckObject(input.directory, input.objectID)
    const cardIndex = deck.cards.findIndex((card) => card.cardID === input.cardID)
    if (cardIndex < 0) {
      throw new FlashcardCardNotFoundError(input.cardID)
    }

    const card = deck.cards[cardIndex]
    if (
      input.queueLease.card.cardID !== input.cardID ||
      !flashcardQueueLeaseMatchesCard(input.queueLease, card)
    ) {
      throw new FlashcardCardNotQueuedError(input.cardID)
    }

    const config = DeckConfigSchema.parse(deck.config)
    const now = Date.now()
    const queuedAt = input.queueLease.queuedAt
    if (queuedAt > now + FLASHCARD_QUEUE_LEASE_FUTURE_SKEW_MS) {
      throw new FlashcardCardNotQueuedError(input.cardID)
    }
    const queuedReviewedToday = await readFlashcardObjectReviewedTodayCounts({
      directory: input.directory,
      objectID: input.objectID,
      deck,
      config,
      now: queuedAt,
    })
    const queuedTiming = schedulerTiming(queuedAt, config.rolloverHour)
    const queue = buildFlashcardQueue({
      cards: deck.cards,
      config,
      reviewedToday: queuedReviewedToday,
      timing: queuedTiming,
      fetchLimit: 2,
    })
    if (queue.cards[0]?.cardID !== input.cardID) {
      throw new FlashcardCardNotQueuedError(input.cardID)
    }

    const result = scheduleReview({ card, rating: input.rating, config, now })
    const nextDue = learningRequeueDue({
      scheduledQueue: result.newQueue,
      scheduledDue: result.nextDue,
      nextQueuedCard: queue.cards[1],
      learnAheadCutoff: Math.min(
        queuedTiming.nextDayAt,
        queuedAt + config.learnAheadMinutes * MINUTES_TO_MS,
      ),
    })

    const reviewedToday =
      schedulingDayKey(now, config.rolloverHour) === schedulingDayKey(queuedAt, config.rolloverHour)
        ? queuedReviewedToday
        : await readFlashcardObjectReviewedTodayCounts({
            directory: input.directory,
            objectID: input.objectID,
            deck,
            config,
            now,
          })

    const previousQueue = effectiveCardQueue(card)
    const updatedCard: FlashcardCard = {
      ...card,
      state: result.newState,
      queue: result.newQueue,
      interval: result.newInterval,
      easeFactor: result.newEaseFactor,
      due: nextDue,
      reps: result.reps,
      lapses: result.lapses,
      remainingSteps: result.remainingSteps,
      lastReviewAt: now,
    }

    deck.cards[cardIndex] = updatedCard
    deck.dailyReviewCounts = {
      schedulingDay: schedulingDayKey(now, config.rolloverHour),
      ...incrementReviewedTodayCounts(reviewedToday, previousQueue),
    }

    const record: ReviewRecord = ReviewRecordSchema.parse({
      reviewID: generateObjectID(),
      cardID: input.cardID,
      rating: input.rating,
      answeredAt: now,
      timeTakenMs: input.timeTakenMs,
      previousState: card.state,
      newState: result.newState,
      previousQueue,
      newQueue: result.newQueue,
      previousInterval: card.interval,
      newInterval: result.newInterval,
      previousEaseFactor: card.easeFactor,
      newEaseFactor: result.newEaseFactor,
    })
    const output: SubmitReviewOutput = {
      cardID: input.cardID,
      newState: result.newState,
      newInterval: result.newInterval,
      newEaseFactor: result.newEaseFactor,
      nextDue,
      isLeech: result.isLeech,
    }
    const transaction = await writePendingFlashcardObjectReviewTransaction({
      directory: input.directory,
      deck,
      record,
      queueLease: input.queueLease,
      submissionID: input.submissionID,
      output,
    })
    await commitFlashcardObjectReviewTransaction(input.directory, transaction)
    await reconcileFlashcardReviewIngestion({
      directory: input.directory,
      record: transaction.committed,
    }).catch((error) => {
      console.warn("Failed to ingest a committed flashcard review into learner memory:", error)
    })
    return output
  })
}

async function getQueuedFlashcardObjectsForReview(input: {
  directory: string
  objectID: string
  fetchLimit: number
}): Promise<FlashcardQueuedCards> {
  return runFlashcardObjectReviewMutation(input, async () => {
    await recoverPendingFlashcardObjectReview(input.directory, input.objectID)
    await reconcilePendingFlashcardReviewIngestions(input)
    const deck = await readFlashcardDeckObject(input.directory, input.objectID)
    const config = DeckConfigSchema.parse(deck.config)
    const now = Date.now()
    const reviewedToday = await readFlashcardObjectReviewedTodayCounts({
      directory: input.directory,
      objectID: input.objectID,
      deck,
      config,
      now,
    })

    return buildFlashcardQueue({
      cards: deck.cards,
      config,
      reviewedToday,
      timing: schedulerTiming(now, config.rolloverHour),
      fetchLimit: input.fetchLimit,
    })
  })
}

export {
  FlashcardCardNotFoundError,
  FlashcardCardNotQueuedError,
  getQueuedFlashcardObjectsForReview,
  submitFlashcardObjectReview,
}
