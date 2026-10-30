import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import { app } from "../../src/index"
import { BuddyObjectPath, generateObjectID } from "../../src/objects"
import { readFlashcardDeckObject } from "../../src/learning/features/flashcards/storage/read-deck"
import {
  buildFlashcardNotesAndCards,
  flashcardDeckObjectStatePath,
  saveFlashcardDeckObject,
} from "../../src/learning/features/flashcards/storage/save-deck"
import {
  DeckConfigSchema,
  FlashcardDeckSchema,
  FlashcardQueuedCardsSchema,
  SubmitReviewOutputSchema,
  type FlashcardDeck,
} from "../../src/learning/features/flashcards/types"
import { writePendingFlashcardObjectReviewTransaction } from "../../src/learning/features/flashcards/storage/review-transaction"
import { schedulingDayKey } from "../../src/learning/features/flashcards/storage/timing"
import { tmpdir } from "../helpers/tmpdir"

const FIRST_CARD_ID = "00000000000000000000000003"
const SECOND_CARD_ID = "00000000000000000000000002"
const THIRD_CARD_ID = "00000000000000000000000001"

async function storeCompletedDeck(
  directory: string,
  limits: { newPerDay: number; reviewsPerDay: number },
) {
  const objectID = generateObjectID()
  const config = DeckConfigSchema.parse({ ...limits, initialEaseFactor: 2700 })
  const { notes, cards } = buildFlashcardNotesAndCards(
    objectID,
    [
      { type: "cloze", fields: { text: "The capital is {{c1::Paris}} in {{c2::France}}." } },
      { type: "basic", fields: { front: "Second deck card", back: "Second answer" } },
    ],
    config,
  )
  const [paris, france, second] = cards
  if (!paris || !france || !second) throw new Error("Expected three fixture cards")
  const deck: FlashcardDeck = {
    objectID,
    kind: "flashcard-deck",
    title: "Deck order fixture",
    config,
    notes,
    cards: [
      { ...france, cardID: FIRST_CARD_ID },
      { ...second, cardID: SECOND_CARD_ID },
      { ...paris, cardID: THIRD_CARD_ID },
    ].map((card) =>
      Object.assign(card, {
        state: "review" as const,
        queue: "review" as const,
        due: Date.now() + 86_400_000,
        interval: 8,
        easeFactor: 1800,
        reps: 9,
        lapses: 2,
        remainingSteps: 1,
        lastReviewAt: Date.now(),
      }),
    ),
    dailyReviewCounts: {
      schedulingDay: schedulingDayKey(Date.now(), config.rolloverHour),
      newCount: 20,
      reviewCount: 200,
    },
    createdAt: "2026-08-09T00:00:00.000Z",
    createdBy: { kind: "app", reason: "test" },
  }
  return (await saveFlashcardDeckObject({ directory, deck })).deck
}

function deckURL(directory: string, objectID: string, action: string): string {
  return `/api/objects/flashcard-deck/${objectID}/${action}?directory=${encodeURIComponent(directory)}`
}

async function queued(directory: string, objectID: string, reviewMode = "scheduled") {
  const response = await app.request(
    `${deckURL(directory, objectID, "queued-cards")}&reviewMode=${reviewMode}&fetchLimit=3`,
  )
  expect(response.status).toBe(200)
  return FlashcardQueuedCardsSchema.parse(await response.json())
}

async function answer(
  directory: string,
  objectID: string,
  queue: Awaited<ReturnType<typeof queued>>,
) {
  const card = queue.cards[0]
  if (!card || !queue.queueLease) throw new Error("Expected a queued card and lease")
  return app.request(deckURL(directory, objectID, "reviews"), {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify({
      cardID: card.cardID,
      queueLease: queue.queueLease,
      rating: "easy",
      timeTakenMs: 500,
    }),
  })
}

describe("flashcard reset progress route", () => {
  for (const limits of [
    { newPerDay: 1, reviewsPerDay: 1 },
    { newPerDay: 0, reviewsPerDay: 200 },
    { newPerDay: 20, reviewsPerDay: 0 },
    { newPerDay: 0, reviewsPerDay: 0 },
  ]) {
    test(`resets and studies the whole deck in deck order with limits ${limits.newPerDay}/${limits.reviewsPerDay}`, async () => {
      await using project = await tmpdir({ git: true })
      const original = await storeCompletedDeck(project.path, limits)
      expect((await queued(project.path, original.objectID)).cards).toEqual([])
      const response = await app.request(
        deckURL(project.path, original.objectID, "reset-progress"),
        { method: "POST" },
      )
      expect(response.status).toBe(200)
      const reset = FlashcardDeckSchema.parse(await response.json())
      const persisted = await readFlashcardDeckObject(project.path, original.objectID)
      expect(persisted).toEqual(reset)
      expect(reset.config).toEqual(original.config)
      expect(reset.notes).toEqual(original.notes)
      expect(reset.cards).toEqual(
        original.cards.map(({ lastReviewAt: _lastReviewAt, ...card }) => ({
          ...card,
          state: "new",
          queue: "new",
          due: 0,
          interval: 0,
          reps: 0,
          lapses: 0,
          remainingSteps: 0,
          easeFactor: 2700,
        })),
      )
      expect(reset.dailyReviewCounts).toEqual({
        schedulingDay: schedulingDayKey(Date.now(), reset.config.rolloverHour),
        newCount: 0,
        reviewCount: 0,
      })
      let queue = await queued(project.path, original.objectID, "study-again")
      expect(queue.queuedCardIDs).toEqual([FIRST_CARD_ID, SECOND_CARD_ID, THIRD_CARD_ID])
      expect(queue.cards[0]?.templateIdx).toBe(1)
      const firstNote = reset.notes.find((note) => note.noteID === queue.cards[0]?.noteID)
      expect(firstNote?.fields).toEqual({ text: "The capital is {{c1::Paris}} in {{c2::France}}." })
      for (const cardID of [FIRST_CARD_ID, SECOND_CARD_ID, THIRD_CARD_ID]) {
        expect(queue.cards[0]?.cardID).toBe(cardID)
        const review = await answer(project.path, original.objectID, queue)
        expect(review.status).toBe(200)
        expect(SubmitReviewOutputSchema.parse(await review.json()).newState).toBe("review")
        queue = await queued(project.path, original.objectID, "study-again")
      }
      expect(queue.cards).toEqual([])
      expect(queue.completion.newLimitReached).toBe(false)
      const stored = await readFlashcardDeckObject(project.path, original.objectID)
      const statePath = BuddyObjectPath.objectFile(
        project.path,
        "flashcard-deck",
        original.objectID,
        flashcardDeckObjectStatePath(),
      )
      await fs.writeFile(
        statePath,
        JSON.stringify({
          ...stored,
          cards: stored.cards.map((card) => Object.assign(card, { due: 0 })),
        }),
      )
      const normalQueue = await queued(project.path, original.objectID)
      expect(normalQueue.cards).toHaveLength(limits.reviewsPerDay === 200 ? 3 : 0)
      expect(normalQueue.completion.reviewLimitReached).toBe(limits.reviewsPerDay < 3)
      expect(normalQueue.resolvedConfig.reviewsPerDay).toBe(limits.reviewsPerDay)
    })
  }

  test("accepts a legacy lease without a generation for a deck that has never been reset", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await storeCompletedDeck(project.path, { newPerDay: 20, reviewsPerDay: 200 })
    const statePath = BuddyObjectPath.objectFile(
      project.path,
      "flashcard-deck",
      deck.objectID,
      flashcardDeckObjectStatePath(),
    )
    await fs.writeFile(
      statePath,
      JSON.stringify({
        ...deck,
        dailyReviewCounts: { ...deck.dailyReviewCounts, newCount: 0, reviewCount: 0 },
        cards: deck.cards.map((card) => Object.assign(card, { due: 0 })),
      }),
    )
    const queue = await queued(project.path, deck.objectID)
    if (!queue.queueLease) throw new Error("Expected a scheduled queue lease")
    const { progressGeneration: _generation, ...legacyLease } = queue.queueLease
    const response = await answer(project.path, deck.objectID, {
      ...queue,
      queueLease: legacyLease,
    })
    expect(response.status).toBe(200)
    expect(
      (await readFlashcardDeckObject(project.path, deck.objectID)).dailyReviewCounts?.reviewCount,
    ).toBe(1)
  })

  test("rejects an unanswered lease from before a second reset without changing reset progress", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await storeCompletedDeck(project.path, { newPerDay: 20, reviewsPerDay: 200 })
    const firstReset = await app.request(deckURL(project.path, deck.objectID, "reset-progress"), {
      method: "POST",
    })
    expect(firstReset.status).toBe(200)
    const oldQueue = await queued(project.path, deck.objectID, "study-again")
    expect(oldQueue.cards[0]?.cardID).toBe(FIRST_CARD_ID)

    const secondReset = await app.request(deckURL(project.path, deck.objectID, "reset-progress"), {
      method: "POST",
    })
    expect(secondReset.status).toBe(200)
    const resetDeck = FlashcardDeckSchema.parse(await secondReset.json())
    const rejected = await answer(project.path, deck.objectID, oldQueue)
    expect(rejected.status).toBe(409)
    expect(await rejected.json()).toMatchObject({
      code: "flashcard.not_queued",
      error: `Flashcard card '${FIRST_CARD_ID}' is not the next queued card.`,
    })
    expect(await readFlashcardDeckObject(project.path, deck.objectID)).toEqual(resetDeck)
    expect(resetDeck.dailyReviewCounts?.newCount).toBe(0)
    expect(resetDeck.dailyReviewCounts?.reviewCount).toBe(0)

    if (!oldQueue.queueLease) throw new Error("Expected the first reset's queue lease")
    const { progressGeneration: _generation, ...legacyLease } = oldQueue.queueLease
    const missingGeneration = await answer(project.path, deck.objectID, {
      ...oldQueue,
      queueLease: legacyLease,
    })
    expect(missingGeneration.status).toBe(409)
    expect(await readFlashcardDeckObject(project.path, deck.objectID)).toEqual(resetDeck)

    const currentQueue = await queued(project.path, deck.objectID, "study-again")
    expect(currentQueue.cards[0]?.cardID).toBe(FIRST_CARD_ID)
    expect(currentQueue.queueLease?.progressGeneration).toBe(2)
    expect(resetDeck.progressGeneration).toBe(2)
    const accepted = await answer(project.path, deck.objectID, currentQueue)
    expect(accepted.status).toBe(200)
  })

  test("recovers a pending review before resetting so queue recovery cannot restore old progress", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await storeCompletedDeck(project.path, { newPerDay: 20, reviewsPerDay: 200 })
    const card = deck.cards[0]
    if (!card) throw new Error("Expected France as the first fixture card")
    const answeredAt = Date.now()
    const reviewID = generateObjectID()
    await writePendingFlashcardObjectReviewTransaction({
      directory: project.path,
      deck: {
        ...deck,
        cards: deck.cards.map((candidate) =>
          candidate.cardID === card.cardID ? { ...candidate, reps: 10 } : candidate,
        ),
      },
      record: {
        reviewID,
        cardID: card.cardID,
        rating: "easy",
        answeredAt,
        timeTakenMs: 500,
        previousState: "review",
        newState: "review",
        previousQueue: "review",
        newQueue: "review",
        previousInterval: 8,
        newInterval: 8,
        previousEaseFactor: 1800,
        newEaseFactor: 1800,
      },
      queueLease: { queuedAt: answeredAt, card },
      submissionID: crypto.randomUUID(),
      output: {
        cardID: card.cardID,
        newState: "review",
        newInterval: 8,
        newEaseFactor: 1800,
        nextDue: card.due,
        isLeech: false,
      },
    })
    const reset = await app.request(deckURL(project.path, deck.objectID, "reset-progress"), {
      method: "POST",
    })
    expect(reset.status).toBe(200)
    expect((await queued(project.path, deck.objectID, "study-again")).queuedCardIDs).toEqual([
      FIRST_CARD_ID,
      SECOND_CARD_ID,
      THIRD_CARD_ID,
    ])
    const persisted = await readFlashcardDeckObject(project.path, deck.objectID)
    expect(persisted.cards.map((candidate) => [candidate.state, candidate.reps])).toEqual([
      ["new", 0],
      ["new", 0],
      ["new", 0],
    ])
    const reviewRoot = BuddyObjectPath.objectFile(
      project.path,
      "flashcard-deck",
      deck.objectID,
      "state",
      "reviews",
    )
    await expect(fs.access(`${reviewRoot}/pending-review.json`)).rejects.toMatchObject({
      code: "ENOENT",
    })
    expect(JSON.parse(await fs.readFile(`${reviewRoot}/${reviewID}.json`, "utf8"))).toMatchObject({
      reviewID,
      cardID: FIRST_CARD_ID,
    })
  })

  test("keeps a concurrent review from restoring pre-reset progress", async () => {
    await using project = await tmpdir({ git: true })
    const deck = await storeCompletedDeck(project.path, { newPerDay: 20, reviewsPerDay: 200 })
    const statePath = BuddyObjectPath.objectFile(
      project.path,
      "flashcard-deck",
      deck.objectID,
      flashcardDeckObjectStatePath(),
    )
    await fs.writeFile(
      statePath,
      JSON.stringify({
        ...deck,
        dailyReviewCounts: { ...deck.dailyReviewCounts, newCount: 0, reviewCount: 0 },
        cards: deck.cards.map((card) => ({ ...card, due: 0 })),
      }),
    )
    const queue = await queued(project.path, deck.objectID)
    const reviewRequest = answer(project.path, deck.objectID, queue)
    const resetRequest = app.request(deckURL(project.path, deck.objectID, "reset-progress"), {
      method: "POST",
    })
    const [review, reset] = await Promise.all([reviewRequest, resetRequest])
    expect([200, 409]).toContain(review.status)
    expect(reset.status).toBe(200)
    const persisted = await readFlashcardDeckObject(project.path, deck.objectID)
    expect(persisted.cards.map((card) => [card.state, card.reps])).toEqual([
      ["new", 0],
      ["new", 0],
      ["new", 0],
    ])
    expect(persisted.dailyReviewCounts?.reviewCount).toBe(0)
    expect(persisted.dailyReviewCounts?.newCount).toBe(0)
  })
})
