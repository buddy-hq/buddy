import { describe, expect, test } from "bun:test"
import {
  buildFlashcardQueue,
  intersperseCards,
  learningRequeueDue,
} from "../../src/learning/features/flashcards/storage/queue"
import {
  constrainedReviewFuzzBounds,
  leechThresholdMet,
  scheduleReview,
} from "../../src/learning/features/flashcards/storage/scheduler"
import {
  DAYS_TO_MS,
  MINUTES_TO_MS,
  schedulerTiming,
  schedulingDayKey,
} from "../../src/learning/features/flashcards/storage/timing"
import { DeckConfigSchema, type FlashcardCard } from "../../src/learning/features/flashcards/types"

const CARD_IDS: readonly [string, string, string, string, string, string, string, string] = [
  "01H00000000000000000000001",
  "01H00000000000000000000002",
  "01H00000000000000000000003",
  "01H00000000000000000000004",
  "01H00000000000000000000005",
  "01H00000000000000000000006",
  "01H00000000000000000000007",
  "01H00000000000000000000008",
]
const NOTE_ID = "01H00000000000000000000009"
const NOW = new Date(2026, 7, 9, 12, 0, 0, 0).getTime()
const FRESH_DECK_CARD_COUNT = 24
const DEFAULT_NEW_CARD_LIMIT = 20

function card(
  cardID: string,
  input: Partial<Omit<FlashcardCard, "cardID" | "noteID">> = {},
): FlashcardCard {
  return {
    cardID,
    noteID: NOTE_ID,
    templateIdx: 0,
    state: "new",
    queue: "new",
    due: 0,
    interval: 0,
    easeFactor: 2500,
    reps: 0,
    lapses: 0,
    remainingSteps: 0,
    ...input,
  }
}

describe("Anki-aligned flashcard queue", () => {
  test("admits only the daily new-card limit from a fresh deck", () => {
    const config = DeckConfigSchema.parse({ newPerDay: DEFAULT_NEW_CARD_LIMIT })
    const cards = Array.from({ length: FRESH_DECK_CARD_COUNT }, (_, index) =>
      card(`01H${String(index + 10).padStart(23, "0")}`),
    )
    const queue = buildFlashcardQueue({
      cards,
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 1,
    })

    expect(queue.newCount).toBe(DEFAULT_NEW_CARD_LIMIT)
    expect(queue.queuedCardIDs).toHaveLength(DEFAULT_NEW_CARD_LIMIT)
    expect(queue.completion.newHeldBack).toBe(
      FRESH_DECK_CARD_COUNT - DEFAULT_NEW_CARD_LIMIT,
    )
    expect(queue.cards).toHaveLength(1)
  })

  test("applies review limits before counts and lets intraday learning bypass them", () => {
    const config = DeckConfigSchema.parse({ newPerDay: 3, reviewsPerDay: 3 })
    const queue = buildFlashcardQueue({
      cards: [
        card(CARD_IDS[0], { state: "learning", queue: "learning", due: NOW - 1 }),
        card(CARD_IDS[1], { state: "learning", queue: "day-learning", due: NOW - 1 }),
        card(CARD_IDS[2], { state: "review", queue: "review", due: NOW - 1, interval: 5 }),
        card(CARD_IDS[3], { state: "review", queue: "review", due: NOW - 1, interval: 5 }),
        card(CARD_IDS[4]),
        card(CARD_IDS[5]),
        card(CARD_IDS[6]),
      ],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 1,
    })

    expect(queue.cards.map((entry) => entry.cardID)).toEqual([CARD_IDS[0]])
    expect(queue.learningCount).toBe(2)
    expect(queue.reviewCount).toBe(2)
    expect(queue.newCount).toBe(0)
    expect(queue.completion.newLimitReached).toBe(true)
  })

  test("subtracts today's answers and caps new cards to remaining review capacity", () => {
    const config = DeckConfigSchema.parse({ newPerDay: 4, reviewsPerDay: 5 })
    const queue = buildFlashcardQueue({
      cards: [
        card(CARD_IDS[0], { state: "review", queue: "review", due: NOW - 1, interval: 5 }),
        card(CARD_IDS[1]),
        card(CARD_IDS[2]),
        card(CARD_IDS[3]),
      ],
      config,
      reviewedToday: { newCount: 1, reviewCount: 1 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 100,
    })

    expect(queue.reviewCount).toBe(1)
    expect(queue.newCount).toBe(2)
    expect(queue.cards).toHaveLength(3)
  })

  test("allows new cards to ignore an exhausted review limit when configured", () => {
    const config = DeckConfigSchema.parse({
      newPerDay: 1,
      reviewsPerDay: 0,
      newCardsIgnoreReviewLimit: true,
    })
    const queue = buildFlashcardQueue({
      cards: [card(CARD_IDS[0])],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 1,
    })

    expect(queue.newCount).toBe(1)
    expect(queue.cards[0]?.cardID).toBe(CARD_IDS[0])
  })

  test("keeps deferred learning out of counts and reports when it becomes available", () => {
    const config = DeckConfigSchema.parse({ learnAheadMinutes: 20 })
    const later = NOW + 30 * MINUTES_TO_MS
    const ahead = NOW + 10 * MINUTES_TO_MS
    const queue = buildFlashcardQueue({
      cards: [
        card(CARD_IDS[0], { state: "learning", queue: "learning", due: NOW - 1 }),
        card(CARD_IDS[1], { state: "learning", queue: "learning", due: ahead }),
        card(CARD_IDS[2], { state: "learning", queue: "learning", due: later }),
      ],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 100,
    })

    expect(queue.cards.map((entry) => entry.cardID)).toEqual([CARD_IDS[0], CARD_IDS[1]])
    expect(queue.learningCount).toBe(2)
    expect(queue.completion.nextLearningAt).toBe(later)
    expect(queue.completion.nextQueueAt).toBe(later - config.learnAheadMinutes * MINUTES_TO_MS)
  })

  test("uses Anki's attempted-first learning and template-first new ordering", () => {
    const config = DeckConfigSchema.parse({})
    const queue = buildFlashcardQueue({
      cards: [
        card(CARD_IDS[0], {
          state: "learning",
          queue: "learning",
          due: NOW - 10_000,
          reps: 0,
        }),
        card(CARD_IDS[1], {
          state: "learning",
          queue: "learning",
          due: NOW - 1_000,
          reps: 1,
        }),
        card(CARD_IDS[2], { templateIdx: 1 }),
        card(CARD_IDS[3], { templateIdx: 0 }),
      ],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 100,
    })

    expect(queue.cards.map((entry) => entry.cardID)).toEqual([
      CARD_IDS[1],
      CARD_IDS[0],
      CARD_IDS[3],
      CARD_IDS[2],
    ])
  })

  test("ports Anki's default even interspersing", () => {
    const first = CARD_IDS.slice(0, 3).map((cardID) => card(cardID))
    const second = CARD_IDS.slice(3).map((cardID) => card(cardID))

    expect(intersperseCards(first, second).map((entry) => entry.cardID)).toEqual([
      CARD_IDS[3],
      CARD_IDS[0],
      CARD_IDS[4],
      CARD_IDS[1],
      CARD_IDS[5],
      CARD_IDS[6],
      CARD_IDS[2],
      CARD_IDS[7],
    ])
  })

  test("places a repeated learning card behind the next ahead-learning card", () => {
    const scheduledDue = NOW + MINUTES_TO_MS
    const nextCard = card(CARD_IDS[1], {
      state: "learning",
      queue: "learning",
      due: NOW + 5 * MINUTES_TO_MS,
      reps: 1,
    })

    expect(
      learningRequeueDue({
        scheduledQueue: "learning",
        scheduledDue,
        nextQueuedCard: nextCard,
        learnAheadCutoff: NOW + 20 * MINUTES_TO_MS,
      }),
    ).toBe(nextCard.due + 1000)
    expect(
      learningRequeueDue({
        scheduledQueue: "learning",
        scheduledDue,
        nextQueuedCard: undefined,
        learnAheadCutoff: NOW + 20 * MINUTES_TO_MS,
      }),
    ).toBe(scheduledDue)
  })
})

describe("Anki-aligned legacy scheduling states", () => {
  test("uses the midpoint of the first two learning steps for Hard", () => {
    const config = DeckConfigSchema.parse({ learnSteps: [1, 10] })
    const result = scheduleReview({
      card: card(CARD_IDS[0]),
      rating: "hard",
      config,
      now: NOW,
    })
    const baseDelay = 5.5 * MINUTES_TO_MS

    expect(result.newState).toBe("learning")
    expect(result.newQueue).toBe("learning")
    expect(result.remainingSteps).toBe(2)
    expect(result.nextDue).toBeGreaterThanOrEqual(NOW + baseDelay)
    expect(result.nextDue).toBeLessThan(NOW + baseDelay * 1.25)
  })

  test("truncates learning steps to seconds before calculating Hard", () => {
    const config = DeckConfigSchema.parse({ learnSteps: [0.026, 0.042] })
    const result = scheduleReview({
      card: card(CARD_IDS[0]),
      rating: "hard",
      config,
      now: NOW,
    })

    expect(result.nextDue).toBe(NOW + 1000)
  })

  test("rounds Hard delays longer than a day before converting them to day learning", () => {
    const beforeRollover = new Date(2026, 7, 9, 3, 0, 0, 0).getTime()
    const config = DeckConfigSchema.parse({ learnSteps: [1800, 2400] })
    const timing = schedulerTiming(beforeRollover, config.rolloverHour)
    const result = scheduleReview({
      card: card(CARD_IDS[0]),
      rating: "hard",
      config,
      now: beforeRollover,
    })

    expect(result.newQueue).toBe("day-learning")
    expect(result.nextDue).toBe(timing.nextDayAt)
  })

  test("keeps Hard, Good, and Easy review intervals ordered and rewards overdue reviews", () => {
    const config = DeckConfigSchema.parse({})
    const timing = schedulerTiming(NOW, config.rolloverHour)
    const onTime = card(CARD_IDS[0], {
      state: "review",
      queue: "review",
      due: timing.currentDayStartAt,
      interval: 10,
      reps: 5,
    })
    const overdue = {
      ...onTime,
      due: timing.currentDayStartAt - 10 * 86_400_000,
    }
    const hard = scheduleReview({ card: overdue, rating: "hard", config, now: NOW })
    const good = scheduleReview({ card: overdue, rating: "good", config, now: NOW })
    const easy = scheduleReview({ card: overdue, rating: "easy", config, now: NOW })
    const onTimeGood = scheduleReview({ card: onTime, rating: "good", config, now: NOW })

    expect(hard.newInterval).toBeLessThan(good.newInterval)
    expect(good.newInterval).toBeLessThan(easy.newInterval)
    expect(good.newInterval).toBeGreaterThan(onTimeGood.newInterval)
  })

  test("enters relearning on Again and repeats leech notices at half-threshold intervals", () => {
    const config = DeckConfigSchema.parse({ leechThreshold: 8, relearnSteps: [10] })
    const result = scheduleReview({
      card: card(CARD_IDS[0], {
        state: "review",
        queue: "review",
        due: NOW,
        interval: 30,
        reps: 12,
        lapses: 7,
      }),
      rating: "again",
      config,
      now: NOW,
    })

    expect(result.newState).toBe("relearning")
    expect(result.newQueue).toBe("learning")
    expect(result.newInterval).toBe(1)
    expect(result.newEaseFactor).toBe(2300)
    expect(result.lapses).toBe(8)
    expect(result.isLeech).toBe(true)
    expect(leechThresholdMet(11, 8)).toBe(false)
    expect(leechThresholdMet(12, 8)).toBe(true)
    expect(leechThresholdMet(5, 3)).toBe(true)
    expect(leechThresholdMet(1, 0)).toBe(false)
  })

  test("ports Anki's one-day Easy exit from relearning", () => {
    const config = DeckConfigSchema.parse({ maxInterval: 10 })
    const result = scheduleReview({
      card: card(CARD_IDS[0], {
        state: "relearning",
        queue: "learning",
        interval: 10,
        remainingSteps: 1,
        reps: 5,
      }),
      rating: "easy",
      config,
      now: NOW,
    })

    expect(result.newState).toBe("review")
    expect(result.newInterval).toBe(11)
  })

  test("uses Anki's legacy fuzz bounds", () => {
    expect(constrainedReviewFuzzBounds(2.5, 1, 1000)).toEqual([2, 4])
    expect(constrainedReviewFuzzBounds(7, 1, 1000)).toEqual([5, 9])
    expect(constrainedReviewFuzzBounds(17, 1, 1000)).toEqual([14, 20])
    expect(constrainedReviewFuzzBounds(37, 1, 1000)).toEqual([33, 41])
  })

  test("rolls scheduling days over at the configured local hour", () => {
    const beforeRollover = new Date(2026, 7, 9, 3, 59, 59).getTime()
    const afterRollover = new Date(2026, 7, 9, 4, 0, 0).getTime()

    expect(schedulingDayKey(beforeRollover, 4)).toBe("2026-08-08")
    expect(schedulingDayKey(afterRollover, 4)).toBe("2026-08-09")
  })
})

describe("flashcard queue completion counts", () => {
  test("reports every admitted card ID independently of the payload fetch limit", () => {
    const config = DeckConfigSchema.parse({ newPerDay: 3, reviewsPerDay: 3 })
    const queue = buildFlashcardQueue({
      cards: [card(CARD_IDS[0]), card(CARD_IDS[1]), card(CARD_IDS[2])],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 1,
    })

    expect(queue.cards).toHaveLength(1)
    expect(queue.queuedCardIDs).toEqual([CARD_IDS[0], CARD_IDS[1], CARD_IDS[2]])
    expect(queue.queuedCardIDs).toHaveLength(
      queue.newCount + queue.learningCount + queue.reviewCount,
    )
    expect(queue.cards.map((entry) => entry.cardID)).toEqual(queue.queuedCardIDs.slice(0, 1))
  })

  test("reports how many cards each daily limit is holding back", () => {
    const config = DeckConfigSchema.parse({ newPerDay: 1, reviewsPerDay: 1 })
    const queue = buildFlashcardQueue({
      cards: [
        card(CARD_IDS[0], { state: "review", queue: "review", due: NOW - 1, interval: 5 }),
        card(CARD_IDS[1], { state: "review", queue: "review", due: NOW - 1, interval: 5 }),
        card(CARD_IDS[2], { state: "review", queue: "review", due: NOW - 1, interval: 5 }),
        card(CARD_IDS[3]),
        card(CARD_IDS[4]),
        card(CARD_IDS[5]),
      ],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 100,
    })

    expect(queue.reviewCount).toBe(1)
    expect(queue.newCount).toBe(0)
    expect(queue.completion.reviewHeldBack).toBe(2)
    expect(queue.completion.newHeldBack).toBe(3)
    // The flags must stay in step with the numbers they are thresholded from.
    expect(queue.completion.reviewLimitReached).toBe(true)
    expect(queue.completion.newLimitReached).toBe(true)
  })

  test("counts intraday learning cards waiting past the learn-ahead cutoff", () => {
    const config = DeckConfigSchema.parse({ learnAheadMinutes: 20 })
    const queue = buildFlashcardQueue({
      cards: [
        card(CARD_IDS[0], { state: "learning", queue: "learning", due: NOW + 10 * MINUTES_TO_MS }),
        card(CARD_IDS[1], { state: "learning", queue: "learning", due: NOW + 30 * MINUTES_TO_MS }),
        card(CARD_IDS[2], { state: "learning", queue: "learning", due: NOW + 45 * MINUTES_TO_MS }),
      ],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 100,
    })

    // The card inside the cutoff is available now, so it is not "later today".
    expect(queue.learningCount).toBe(1)
    expect(queue.completion.learningLaterToday).toBe(2)
  })

  test("counts review and inter-day learning cards returning on a later day", () => {
    const config = DeckConfigSchema.parse({})
    const timing = schedulerTiming(NOW, config.rolloverHour)
    const queue = buildFlashcardQueue({
      cards: [
        card(CARD_IDS[0], {
          state: "review",
          queue: "review",
          due: timing.nextDayAt + 1,
          interval: 5,
        }),
        card(CARD_IDS[1], {
          state: "review",
          queue: "review",
          due: timing.nextDayAt + DAYS_TO_MS,
          interval: 9,
        }),
        card(CARD_IDS[2], {
          state: "learning",
          queue: "day-learning",
          due: timing.nextDayAt + 1,
        }),
      ],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing,
      fetchLimit: 100,
    })

    expect(queue.cards).toHaveLength(0)
    expect(queue.completion.returningLater).toBe(3)
    expect(queue.completion.nextDueAt).toBe(timing.nextDayAt + 1)
    expect(queue.completion.nextQueueAt).toBe(timing.nextDayAt)
    expect(queue.completion.reviewHeldBack).toBe(0)
  })

  test("echoes today's answered counts so limits can be shown as n of N", () => {
    const config = DeckConfigSchema.parse({ newPerDay: 4, reviewsPerDay: 5 })
    const queue = buildFlashcardQueue({
      cards: [card(CARD_IDS[0])],
      config,
      reviewedToday: { newCount: 2, reviewCount: 3 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 100,
    })

    expect(queue.completion.reviewedToday).toEqual({ newCount: 2, reviewCount: 3 })
  })

  test("holds nothing back when every due card fits inside the limits", () => {
    const config = DeckConfigSchema.parse({ newPerDay: 10, reviewsPerDay: 10 })
    const queue = buildFlashcardQueue({
      cards: [
        card(CARD_IDS[0], { state: "review", queue: "review", due: NOW - 1, interval: 5 }),
        card(CARD_IDS[1]),
      ],
      config,
      reviewedToday: { newCount: 0, reviewCount: 0 },
      timing: schedulerTiming(NOW, config.rolloverHour),
      fetchLimit: 100,
    })

    expect(queue.completion.newHeldBack).toBe(0)
    expect(queue.completion.reviewHeldBack).toBe(0)
    expect(queue.completion.learningLaterToday).toBe(0)
    expect(queue.completion.returningLater).toBe(0)
    expect(queue.completion.newLimitReached).toBe(false)
    expect(queue.completion.reviewLimitReached).toBe(false)
  })
})
