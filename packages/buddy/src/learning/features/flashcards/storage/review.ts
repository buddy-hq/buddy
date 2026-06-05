import fs from "node:fs/promises"
import { FlashcardPath } from "./path"
import { scheduleReview, selectNextDueCard } from "./scheduler"
import {
  DeckConfigSchema,
  ReviewRecordSchema,
  type CardRating,
  type FlashcardCard,
  type ReviewRecord,
  type SubmitReviewOutput,
} from "../types"
import { FlashcardCardNotFoundError } from "../errors"
import { readFlashcardDeck, readFlashcardReviewedTodayCounts, todayISO } from "./read-deck"
import { writeFlashcardDeck } from "./save-deck"
import { appendLearnerEvent, createLearnerEvent, recordFlashcardReviewMemory } from "../../memory"
import type { LearnerEvent } from "../../memory"
import { writeLearnerEvidenceForEvent } from "../../memory/evidence"

const FLASHCARD_REVIEW_QUEUE_SEPARATOR = "\u0000"

const flashcardReviewQueues = new Map<string, Promise<void>>()

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

function flashcardReviewQueueKey(directory: string, deckID: string): string {
  return `${directory}${FLASHCARD_REVIEW_QUEUE_SEPARATOR}${FlashcardPath.sanitizeDeckID(deckID)}`
}

async function runFlashcardReviewMutation(
  input: { directory: string; deckID: string },
  operation: () => Promise<FlashcardReviewMutation>,
): Promise<FlashcardReviewMutation> {
  const key = flashcardReviewQueueKey(input.directory, input.deckID)
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

async function appendFlashcardReviewRecord(
  directory: string,
  deckID: string,
  record: ReviewRecord,
): Promise<void> {
  const safeDeckID = FlashcardPath.sanitizeDeckID(deckID)
  const reviewDir = FlashcardPath.reviewsDirectory(directory, safeDeckID)
  await fs.mkdir(reviewDir, { recursive: true })
  const filePath = FlashcardPath.reviewFile(directory, safeDeckID, todayISO())
  await fs.appendFile(filePath, JSON.stringify(record) + "\n", "utf8")
}

async function submitFlashcardReview(input: {
  directory: string
  deckID: string
  cardID: string
  rating: CardRating
  timeTakenMs: number
}): Promise<SubmitReviewOutput> {
  const mutation = await runFlashcardReviewMutation(input, async () => {
    const deck = await readFlashcardDeck(input.directory, input.deckID)
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
    await writeFlashcardDeck({ directory: input.directory, deck })

    const record: ReviewRecord = ReviewRecordSchema.parse({
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

    const learnerEvent = createLearnerEvent({
      type: "flashcard_review_ingested",
      sourceKind: "flashcard_review",
      sourceId: input.cardID,
      searchableText: `Flashcard review ${input.deckID}/${input.cardID}: rating ${input.rating}, ${card.state} -> ${result.newState}.`,
      payload: {
        deckID: input.deckID,
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

  await appendFlashcardReviewRecord(input.directory, input.deckID, mutation.record)
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
    artifactId: input.deckID,
    title: mutation.deckTitle,
    note: `Flashcard review recorded for card ${input.cardID} with rating ${input.rating}; ${mutation.previousState} -> ${mutation.newState}.`,
    tags: mutation.noteTags,
    payload: {
      deckID: input.deckID,
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

async function getNextFlashcardForReview(input: {
  directory: string
  deckID: string
}): Promise<FlashcardCard | undefined> {
  const deck = await readFlashcardDeck(input.directory, input.deckID)
  const config = DeckConfigSchema.parse(deck.config)
  const now = Date.now()
  const reviewedToday = await readFlashcardReviewedTodayCounts(input.directory, input.deckID)

  return selectNextDueCard({
    cards: deck.cards,
    config,
    now,
    reviewedToday,
  })
}

export { getNextFlashcardForReview, submitFlashcardReview }
