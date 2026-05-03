import {
  type CardRating,
  type CardState,
  type DeckConfig,
  type DueCounts,
  type FlashcardCard,
} from "../types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MINUTES_TO_MS = 60_000
const DAYS_TO_MS = 86_400_000
const MIN_EASE_FACTOR = 1300
const EASE_AGAIN_PENALTY = 200
const EASE_HARD_PENALTY = 150
const EASE_EASY_BONUS = 150
const FUZZ_RANGE_FRACTION = 0.05

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Add a small random fuzz to prevent review clustering. */
function fuzzInterval(interval: number): number {
  if (interval < 3) return interval
  const fuzz = Math.max(1, Math.round(interval * FUZZ_RANGE_FRACTION))
  return interval + Math.floor(Math.random() * (fuzz * 2 + 1)) - fuzz
}

function clampInterval(interval: number, maxInterval: number): number {
  return Math.max(1, Math.min(Math.round(interval), maxInterval))
}

function clampEaseFactor(easeFactor: number): number {
  return Math.max(MIN_EASE_FACTOR, Math.round(easeFactor))
}

function listClozeOrdinals(text: string): number[] {
  const ordinals = new Set<number>()
  const regex = /\{\{c(\d+)::/gu
  let match = regex.exec(text)
  while (match) {
    const ordinal = Number.parseInt(match[1], 10)
    if (ordinal > 0) {
      ordinals.add(ordinal)
    }
    match = regex.exec(text)
  }

  return [...ordinals].toSorted((left, right) => left - right)
}

/** Count cloze deletions like {{c1::...}}, {{c2::...}} in a text string. */
function countClozeDeletions(text: string): number {
  return listClozeOrdinals(text).length
}

// ---------------------------------------------------------------------------
// Schedule a single review answer
// ---------------------------------------------------------------------------

type ScheduleResult = {
  newState: CardState
  newInterval: number
  newEaseFactor: number
  nextDue: number
  remainingSteps: number
  reps: number
  lapses: number
  isLeech: boolean
}

function scheduleReview(input: {
  card: FlashcardCard
  rating: CardRating
  config: DeckConfig
  now: number
}): ScheduleResult {
  const { card, rating, config, now } = input
  const maxInterval = config.maxInterval

  switch (card.state) {
    case "new":
      return scheduleNewCard({ card, rating, config, now })
    case "learning":
      return scheduleLearningCard({ card, rating, config, now, steps: config.learnSteps })
    case "review":
      return scheduleReviewCard({ card, rating, config, now, maxInterval })
    case "relearning":
      return scheduleLearningCard({ card, rating, config, now, steps: config.relearnSteps })
  }
}

// ---------------------------------------------------------------------------
// New card → enters learning
// ---------------------------------------------------------------------------

function scheduleNewCard(input: {
  card: FlashcardCard
  rating: CardRating
  config: DeckConfig
  now: number
}): ScheduleResult {
  const { card, rating, config, now } = input
  const steps = config.learnSteps
  const base: ScheduleResult = {
    newState: "learning",
    newInterval: 0,
    newEaseFactor: config.initialEaseFactor,
    nextDue: now,
    remainingSteps: steps.length > 0 ? steps.length - 1 : 0,
    reps: card.reps + 1,
    lapses: card.lapses,
    isLeech: false,
  }

  if (steps.length === 0) {
    // No learning steps → graduate immediately
    const interval =
      rating === "easy" ? config.graduatingIntervalEasy : config.graduatingIntervalGood
    return {
      ...base,
      newState: "review",
      newInterval: interval,
      nextDue: now + interval * DAYS_TO_MS,
      remainingSteps: 0,
    }
  }

  switch (rating) {
    case "again":
      return {
        ...base,
        remainingSteps: steps.length - 1,
        nextDue: now + steps[0] * MINUTES_TO_MS,
      }
    case "hard":
      return {
        ...base,
        remainingSteps: steps.length - 1,
        nextDue: now + steps[0] * MINUTES_TO_MS,
      }
    case "good": {
      if (steps.length <= 1) {
        // Graduate
        return {
          ...base,
          newState: "review",
          newInterval: config.graduatingIntervalGood,
          nextDue: now + config.graduatingIntervalGood * DAYS_TO_MS,
          remainingSteps: 0,
        }
      }
      return {
        ...base,
        remainingSteps: steps.length - 2,
        nextDue: now + steps[1] * MINUTES_TO_MS,
      }
    }
    case "easy": {
      // Graduate immediately
      return {
        ...base,
        newState: "review",
        newInterval: config.graduatingIntervalEasy,
        newEaseFactor: clampEaseFactor(config.initialEaseFactor + EASE_EASY_BONUS),
        nextDue: now + config.graduatingIntervalEasy * DAYS_TO_MS,
        remainingSteps: 0,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Learning / Relearning card → step through or graduate
// ---------------------------------------------------------------------------

function scheduleLearningCard(input: {
  card: FlashcardCard
  rating: CardRating
  config: DeckConfig
  now: number
  steps: number[]
}): ScheduleResult {
  const { card, rating, config, now, steps } = input
  const isRelearning = card.state === "relearning"
  const currentStepIdx = steps.length - 1 - card.remainingSteps

  const base: ScheduleResult = {
    newState: card.state,
    newInterval: card.interval,
    newEaseFactor: card.easeFactor,
    nextDue: now,
    remainingSteps: card.remainingSteps,
    reps: card.reps + 1,
    lapses: card.lapses,
    isLeech: false,
  }

  if (steps.length === 0) {
    // Graduate immediately
    const interval = isRelearning ? Math.max(1, card.interval) : config.graduatingIntervalGood
    return {
      ...base,
      newState: "review",
      newInterval: interval,
      nextDue: now + interval * DAYS_TO_MS,
      remainingSteps: 0,
    }
  }

  switch (rating) {
    case "again": {
      // Reset to first step
      const stepMs = steps[0] * MINUTES_TO_MS
      return {
        ...base,
        remainingSteps: steps.length - 1,
        nextDue: now + stepMs,
      }
    }
    case "hard": {
      // Repeat current step
      const stepIdx = Math.min(currentStepIdx, steps.length - 1)
      return {
        ...base,
        nextDue: now + steps[stepIdx] * MINUTES_TO_MS,
      }
    }
    case "good": {
      const nextStepIdx = currentStepIdx + 1
      if (nextStepIdx >= steps.length) {
        // Graduate
        const interval = isRelearning ? Math.max(1, card.interval) : config.graduatingIntervalGood
        return {
          ...base,
          newState: "review",
          newInterval: interval,
          nextDue: now + interval * DAYS_TO_MS,
          remainingSteps: 0,
        }
      }
      return {
        ...base,
        remainingSteps: steps.length - 1 - nextStepIdx,
        nextDue: now + steps[nextStepIdx] * MINUTES_TO_MS,
      }
    }
    case "easy": {
      // Graduate immediately
      const interval = isRelearning
        ? Math.max(config.graduatingIntervalEasy, card.interval)
        : config.graduatingIntervalEasy
      return {
        ...base,
        newState: "review",
        newInterval: interval,
        newEaseFactor: clampEaseFactor(card.easeFactor + EASE_EASY_BONUS),
        nextDue: now + interval * DAYS_TO_MS,
        remainingSteps: 0,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Review card → reschedule or lapse
// ---------------------------------------------------------------------------

function scheduleReviewCard(input: {
  card: FlashcardCard
  rating: CardRating
  config: DeckConfig
  now: number
  maxInterval: number
}): ScheduleResult {
  const { card, rating, config, now, maxInterval } = input

  const base: ScheduleResult = {
    newState: "review",
    newInterval: card.interval,
    newEaseFactor: card.easeFactor,
    nextDue: now,
    remainingSteps: 0,
    reps: card.reps + 1,
    lapses: card.lapses,
    isLeech: false,
  }

  switch (rating) {
    case "again": {
      // Lapse
      const newLapses = card.lapses + 1
      const newEaseFactor = clampEaseFactor(card.easeFactor - EASE_AGAIN_PENALTY)
      const isLeech = newLapses >= config.leechThreshold && newLapses % config.leechThreshold === 0

      if (config.relearnSteps.length === 0) {
        // No relearning steps → stay in review with reduced interval
        const newInterval =
          config.lapseMultiplier > 0
            ? clampInterval(card.interval * config.lapseMultiplier, maxInterval)
            : 1
        return {
          ...base,
          newState: "review",
          newInterval,
          newEaseFactor,
          nextDue: now + newInterval * DAYS_TO_MS,
          lapses: newLapses,
          isLeech,
        }
      }

      return {
        ...base,
        newState: "relearning",
        newInterval:
          config.lapseMultiplier > 0
            ? clampInterval(card.interval * config.lapseMultiplier, maxInterval)
            : 1,
        newEaseFactor,
        nextDue: now + config.relearnSteps[0] * MINUTES_TO_MS,
        remainingSteps: config.relearnSteps.length - 1,
        lapses: newLapses,
        isLeech,
      }
    }
    case "hard": {
      const newEaseFactor = clampEaseFactor(card.easeFactor - EASE_HARD_PENALTY)
      const rawInterval = card.interval * config.hardMultiplier
      const newInterval = clampInterval(fuzzInterval(rawInterval), maxInterval)
      return {
        ...base,
        newInterval,
        newEaseFactor,
        nextDue: now + newInterval * DAYS_TO_MS,
      }
    }
    case "good": {
      const rawInterval = card.interval * (card.easeFactor / 1000)
      const newInterval = clampInterval(
        fuzzInterval(Math.max(rawInterval, card.interval + 1)),
        maxInterval,
      )
      return {
        ...base,
        newInterval,
        nextDue: now + newInterval * DAYS_TO_MS,
      }
    }
    case "easy": {
      const newEaseFactor = clampEaseFactor(card.easeFactor + EASE_EASY_BONUS)
      const rawInterval = card.interval * (card.easeFactor / 1000) * config.easyMultiplier
      const newInterval = clampInterval(
        fuzzInterval(Math.max(rawInterval, card.interval + 1)),
        maxInterval,
      )
      return {
        ...base,
        newInterval,
        newEaseFactor,
        nextDue: now + newInterval * DAYS_TO_MS,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Due counts
// ---------------------------------------------------------------------------

function computeDueCounts(cards: FlashcardCard[], now: number): DueCounts {
  let newCount = 0
  let learningCount = 0
  let reviewCount = 0

  for (const card of cards) {
    switch (card.state) {
      case "new":
        newCount++
        break
      case "learning":
      case "relearning":
        if (card.due <= now) learningCount++
        break
      case "review":
        if (card.due <= now) reviewCount++
        break
    }
  }

  return { new: newCount, learning: learningCount, review: reviewCount }
}

// ---------------------------------------------------------------------------
// Select next due card (learning first, then review, then new)
// ---------------------------------------------------------------------------

function selectNextDueCard(input: {
  cards: FlashcardCard[]
  config: DeckConfig
  now: number
  reviewedToday: { newCount: number; reviewCount: number }
}): FlashcardCard | undefined {
  const { cards, config, now, reviewedToday } = input

  // 1. Learning/relearning cards that are due (sorted by due time)
  const learningDue = cards
    .filter((card) => (card.state === "learning" || card.state === "relearning") && card.due <= now)
    .toSorted((a, b) => a.due - b.due)

  if (learningDue.length > 0) return learningDue[0]

  // 2. Review cards that are due (sorted by due time)
  if (reviewedToday.reviewCount < config.reviewsPerDay) {
    const reviewDue = cards
      .filter((card) => card.state === "review" && card.due <= now)
      .toSorted((a, b) => a.due - b.due)

    if (reviewDue.length > 0) return reviewDue[0]
  }

  // 3. New cards (FIFO order by cardID which is a ULID = creation order)
  if (reviewedToday.newCount < config.newPerDay) {
    const newCards = cards
      .filter((card) => card.state === "new")
      .toSorted((a, b) => a.cardID.localeCompare(b.cardID))

    if (newCards.length > 0) return newCards[0]
  }

  return undefined
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  computeDueCounts,
  countClozeDeletions,
  listClozeOrdinals,
  scheduleReview,
  selectNextDueCard,
}
export type { ScheduleResult }
