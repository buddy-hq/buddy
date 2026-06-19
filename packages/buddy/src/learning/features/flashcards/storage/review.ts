import { generateObjectID } from "../../../../objects"
import { scheduleReview, selectNextDueCard } from "./scheduler"
import {
  DeckConfigSchema,
  ReviewRecordSchema,
  type CardRating,
  type FlashcardCard,
  type ReviewRecord,
  type SubmitReviewOutput,
} from "../types"
import {
  readFlashcardDeckObject,
  readFlashcardObjectReviewedTodayCounts,
} from "./read-deck"
import {
  commitFlashcardObjectReviewTransaction,
  recoverPendingFlashcardObjectReview,
  writePendingFlashcardObjectReviewTransaction,
} from "./review-transaction"
import { appendLearnerEvent, createLearnerEvent, recordFlashcardReviewMemory } from "../../memory"
import type { LearnerEvent } from "../../memory"
import { writeLearnerEvidenceForEvent } from "../../memory/evidence"

const FLASHCARD_REVIEW_QUEUE_SEPARATOR = "\u0000"

const flashcardReviewQueues = new Map<string, Promise<void>>()

class FlashcardCardNotFoundError extends Error {
  constructor(cardID: string) {
    super(`Flashcard card '${cardID}' was not found.`)
    this.name = "FlashcardCardNotFoundError"
  }
}

type FlashcardReviewMutation = {
  output: SubmitReviewOutput
  record: ReviewRecord
  learnerEvent: LearnerEvent
  deckTitle: string
  noteTags: string[]
  previousState: FlashcardCard["state"]
  newState: FlashcardCard["state"]
  isLeech: boolean
  nextDue: number
}

function flashcardObjectReviewQueueKey(directory: string, objectID: string): string {
  return `${directory}${FLASHCARD_REVIEW_QUEUE_SEPARATOR}${objectID}`
}

async function runFlashcardObjectReviewMutation(
  input: { directory: string; objectID: string },
  operation: () => Promise<FlashcardReviewMutation>,
): Promise<FlashcardReviewMutation> {
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

async function submitFlashcardObjectReview(input: {
  directory: string
  objectID: string
  cardID: string
  rating: CardRating
  timeTakenMs: number
}): Promise<SubmitReviewOutput> {
  const mutation = await runFlashcardObjectReviewMutation(input, async () => {
    await recoverPendingFlashcardObjectReview(input.directory, input.objectID)
    const deck = await readFlashcardDeckObject(input.directory, input.objectID)
    const cardIndex = deck.cards.findIndex((card) => card.cardID === input.cardID)
    if (cardIndex < 0) {
      throw new FlashcardCardNotFoundError(input.cardID)
    }

    const card = deck.cards[cardIndex]
    const config = DeckConfigSchema.parse(deck.config)
    const now = Date.now()

    const result = scheduleReview({ card, rating: input.rating, config, now })

    const updatedCard: FlashcardCard = {
      ...card,
      state: result.newState,
      interval: result.newInterval,
      easeFactor: result.newEaseFactor,
      due: result.nextDue,
      reps: result.reps,
      lapses: result.lapses,
      remainingSteps: result.remainingSteps,
    }

    deck.cards[cardIndex] = updatedCard

    const record: ReviewRecord = ReviewRecordSchema.parse({
      reviewID: generateObjectID(),
      cardID: input.cardID,
      rating: input.rating,
      answeredAt: now,
      timeTakenMs: input.timeTakenMs,
      previousState: card.state,
      newState: result.newState,
      previousInterval: card.interval,
      newInterval: result.newInterval,
      previousEaseFactor: card.easeFactor,
      newEaseFactor: result.newEaseFactor,
    })
    const transaction = await writePendingFlashcardObjectReviewTransaction({
      directory: input.directory,
      deck,
      record,
    })
    await commitFlashcardObjectReviewTransaction(input.directory, transaction)

    const learnerEvent = createLearnerEvent({
      type: "flashcard_review_ingested",
      sourceKind: "flashcard_review",
      sourceId: input.cardID,
      searchableText: `Flashcard review ${input.objectID}/${input.cardID}: rating ${input.rating}, ${card.state} -> ${result.newState}.`,
      payload: {
        objectID: input.objectID,
        cardID: input.cardID,
        rating: input.rating,
        previousState: card.state,
        newState: result.newState,
        isLeech: result.isLeech,
      },
    })
    const note = deck.notes.find((candidate) => candidate.noteID === card.noteID)

    return {
      output: {
        cardID: input.cardID,
        newState: result.newState,
        newInterval: result.newInterval,
        newEaseFactor: result.newEaseFactor,
        nextDue: result.nextDue,
        isLeech: result.isLeech,
      },
      record,
      learnerEvent,
      deckTitle: deck.title,
      noteTags: note?.tags ?? [],
      previousState: card.state,
      newState: result.newState,
      isLeech: result.isLeech,
      nextDue: result.nextDue,
    }
  })

  const learnerEvent = mutation.learnerEvent
  await appendLearnerEvent(input.directory, learnerEvent)
  const memory = await recordFlashcardReviewMemory({
    directory: input.directory,
    eventId: learnerEvent.id,
    deckTitle: mutation.deckTitle,
    tags: mutation.noteTags,
    rating: input.rating,
    previousState: mutation.previousState,
    newState: mutation.newState,
    isLeech: mutation.isLeech,
    projectPath: input.directory,
  })
  await writeLearnerEvidenceForEvent({
    directory: input.directory,
    event: learnerEvent,
    objectId: input.objectID,
    title: mutation.deckTitle,
    note: `Flashcard review recorded for card ${input.cardID} with rating ${input.rating}; ${mutation.previousState} -> ${mutation.newState}.`,
    tags: mutation.noteTags,
    payload: {
      objectID: input.objectID,
      cardID: input.cardID,
      rating: input.rating,
      previousState: mutation.previousState,
      newState: mutation.newState,
      isLeech: mutation.isLeech,
      nextDue: mutation.nextDue,
    },
    memoryEffects: [
      {
        ...(memory ? { memoryId: memory.id } : {}),
        effect: mutation.isLeech || input.rating === "again" ? "reinforced" : "noted",
        reason:
          mutation.isLeech || input.rating === "again"
            ? "Repeated difficulty on this card suggests the topic remains fragile."
            : "Stable review evidence recorded for this card.",
      },
    ],
  })

  return mutation.output
}

async function getNextFlashcardObjectForReview(input: {
  directory: string
  objectID: string
}): Promise<FlashcardCard | undefined> {
  await recoverPendingFlashcardObjectReview(input.directory, input.objectID)
  const deck = await readFlashcardDeckObject(input.directory, input.objectID)
  const config = DeckConfigSchema.parse(deck.config)
  const now = Date.now()
  const reviewedToday = await readFlashcardObjectReviewedTodayCounts(
    input.directory,
    input.objectID,
  )

  return selectNextDueCard({
    cards: deck.cards,
    config,
    now,
    reviewedToday,
  })
}

export {
  FlashcardCardNotFoundError,
  getNextFlashcardObjectForReview,
  submitFlashcardObjectReview,
}
