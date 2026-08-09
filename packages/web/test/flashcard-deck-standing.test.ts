import { describe, expect, test } from "bun:test"
import { resolveFlashcardStanding } from "../src/components/flashcard/flashcard-deck-standing"
import { isFlashcardLeech } from "../src/lib/flashcard"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
} from "@buddy/sdk/types"

const NOW = Date.UTC(2026, 7, 9, 12)
const MINUTE_MS = 60_000

function createDeck(reps = 1): ObjectFlashcardDeckReadDeckResponse {
  return {
    objectID: "deck-1",
    kind: "flashcard-deck",
    title: "Western education",
    config: {},
    notes: [
      {
        noteID: "note-1",
        objectID: "deck-1",
        type: "basic",
        fields: { front: "Question", back: "Answer" },
      },
    ],
    cards: [
      {
        cardID: "card-1",
        noteID: "note-1",
        templateIdx: 0,
        state: reps === 0 ? "new" : "review",
        due: NOW,
        interval: 1,
        easeFactor: 2_500,
        reps,
        lapses: 0,
        remainingSteps: 0,
      },
    ],
    createdAt: "2026-08-09T00:00:00.000Z",
    createdBy: { kind: "app", reason: "test" },
  }
}

function createQueue(
  patch: Partial<ObjectFlashcardDeckQueuedCardsResponse> = {},
): ObjectFlashcardDeckQueuedCardsResponse {
  return {
    queuedCardIDs: [],
    cards: [],
    queueLease: null,
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    resolvedConfig: { newPerDay: 5, reviewsPerDay: 20, leechThreshold: 8 },
    completion: {
      nextLearningAt: null,
      nextDueAt: null,
      nextQueueAt: null,
      newLimitReached: false,
      reviewLimitReached: false,
      newHeldBack: 0,
      reviewHeldBack: 0,
      learningLaterToday: 0,
      returningLater: 0,
      reviewedToday: { newCount: 0, reviewCount: 0 },
    },
    ...patch,
  }
}

describe("flashcard deck standing", () => {
  test("treats a zero leech threshold as disabled", () => {
    expect(isFlashcardLeech(12, 0)).toBe(false)
    expect(isFlashcardLeech(7, 8)).toBe(false)
    expect(isFlashcardLeech(8, 8)).toBe(true)
  })

  test("maps every Easel deck state from the authoritative queue payload", () => {
    const due = resolveFlashcardStanding({
      deck: createDeck(),
      queue: createQueue({ newCount: 1, learningCount: 2, reviewCount: 3 }),
      now: NOW,
    })
    const fresh = resolveFlashcardStanding({
      deck: createDeck(0),
      queue: createQueue({ newCount: 1 }),
      now: NOW,
    })
    const learningWait = resolveFlashcardStanding({
      deck: createDeck(),
      queue: createQueue({
        completion: {
          ...createQueue().completion,
          nextLearningAt: NOW + 6 * MINUTE_MS,
          learningLaterToday: 2,
        },
      }),
      now: NOW,
    })
    const reviewLimit = resolveFlashcardStanding({
      deck: createDeck(),
      queue: createQueue({
        completion: {
          ...createQueue().completion,
          reviewLimitReached: true,
          reviewHeldBack: 4,
          reviewedToday: { newCount: 0, reviewCount: 20 },
        },
      }),
      now: NOW,
    })
    const newLimit = resolveFlashcardStanding({
      deck: createDeck(),
      queue: createQueue({
        completion: {
          ...createQueue().completion,
          newLimitReached: true,
          newHeldBack: 7,
          reviewedToday: { newCount: 5, reviewCount: 0 },
        },
      }),
      now: NOW,
    })
    const clear = resolveFlashcardStanding({
      deck: createDeck(),
      queue: createQueue({
        completion: { ...createQueue().completion, returningLater: 3 },
      }),
      now: NOW,
    })

    expect([due.id, fresh.id, learningWait.id, reviewLimit.id, newLimit.id, clear.id]).toEqual([
      "due",
      "fresh",
      "learning-wait",
      "limit-review",
      "limit-new",
      "clear",
    ])
    expect([due.action.mode, fresh.action.mode]).toEqual(["study", "study"])
    expect(fresh.detail).toBe("At 5 new a day, that's 1 day to meet them all.")
    expect([learningWait, reviewLimit, newLimit, clear].map((entry) => entry.action.mode)).toEqual([
      "practice",
      "practice",
      "practice",
      "practice",
    ])
  })

  test("shows a holding limit before a shorter learning wait", () => {
    const standing = resolveFlashcardStanding({
      deck: createDeck(),
      queue: createQueue({
        completion: {
          ...createQueue().completion,
          nextLearningAt: NOW + 6 * MINUTE_MS,
          reviewLimitReached: true,
          reviewHeldBack: 2,
          reviewedToday: { newCount: 0, reviewCount: 20 },
        },
      }),
      now: NOW,
    })

    expect(standing.id).toBe("limit-review")
  })

  test("reports interday learning as returning later instead of an empty intraday wait", () => {
    const returningAt = NOW + 24 * 60 * MINUTE_MS
    const standing = resolveFlashcardStanding({
      deck: createDeck(),
      queue: createQueue({
        completion: {
          ...createQueue().completion,
          nextLearningAt: returningAt,
          nextDueAt: returningAt,
          nextQueueAt: returningAt,
          learningLaterToday: 0,
          returningLater: 1,
        },
      }),
      now: NOW,
    })

    expect(standing.id).toBe("clear")
    expect(standing.detail).toContain("1")
  })
})
