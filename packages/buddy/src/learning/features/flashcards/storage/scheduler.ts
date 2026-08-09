import type {
  CardQueue,
  CardRating,
  CardState,
  DeckConfig,
  FlashcardCard,
} from "../types"
import {
  DAYS_TO_MS,
  learningIntervalCrossesRollover,
  learningIntervalDays,
  scheduleDayInterval,
  schedulerTiming,
  schedulingDaysLate,
  type SchedulerTiming,
} from "./timing"

const MIN_EASE_FACTOR = 1300
const EASE_AGAIN_PENALTY = 200
const EASE_HARD_PENALTY = 150
const EASE_EASY_BONUS = 150
const LEARNING_FUZZ_FRACTION = 0.25
const LEARNING_FUZZ_MAX_SECONDS = 5 * 60
const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_DAY = DAYS_TO_MS / MILLISECONDS_PER_SECOND
const FNV_OFFSET_BASIS = 2_166_136_261
const FNV_PRIME = 16_777_619
const UINT32_RANGE = 4_294_967_296

const REVIEW_FUZZ_RANGES: readonly {
  start: number
  end: number
  factor: number
}[] = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Number.POSITIVE_INFINITY, factor: 0.05 },
]

type ScheduleResult = {
  newState: CardState
  newQueue: CardQueue
  newInterval: number
  newEaseFactor: number
  nextDue: number
  remainingSteps: number
  reps: number
  lapses: number
  isLeech: boolean
}

type LearningDelay = {
  queue: Extract<CardQueue, "learning" | "day-learning">
  due: number
}

function clampEaseFactor(easeFactor: number): number {
  return Math.max(MIN_EASE_FACTOR, Math.round(easeFactor))
}

function minAndMaxReviewIntervals(config: DeckConfig, minimum: number): [number, number] {
  const maximum = Math.max(1, config.maxInterval)
  return [Math.min(Math.max(1, Math.round(minimum)), maximum), maximum]
}

function stableFuzzFactor(cardID: string, reps: number): number {
  let hash = FNV_OFFSET_BASIS
  for (const character of cardID) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, FNV_PRIME)
  }
  hash ^= reps
  hash = Math.imul(hash, FNV_PRIME)
  return (hash >>> 0) / UINT32_RANGE
}

function reviewFuzzDelta(interval: number): number {
  if (interval < REVIEW_FUZZ_RANGES[0].start) return 0
  return REVIEW_FUZZ_RANGES.reduce(
    (delta, range) =>
      delta + range.factor * Math.max(0, Math.min(interval, range.end) - range.start),
    1,
  )
}

function constrainedReviewFuzzBounds(
  interval: number,
  minimum: number,
  maximum: number,
): [number, number] {
  const boundedMinimum = Math.min(minimum, maximum)
  const boundedInterval = Math.min(maximum, Math.max(boundedMinimum, interval))
  const delta = reviewFuzzDelta(boundedInterval)
  let lower = Math.min(maximum, Math.max(boundedMinimum, Math.round(boundedInterval - delta)))
  let upper = Math.min(maximum, Math.max(boundedMinimum, Math.round(boundedInterval + delta)))

  if (upper === lower && upper > 2 && upper < maximum) {
    upper = lower + 1
  }
  return [lower, upper]
}

function withReviewFuzz(input: {
  interval: number
  minimum: number
  maximum: number
  fuzzFactor: number
}): number {
  const [lower, upper] = constrainedReviewFuzzBounds(
    input.interval,
    input.minimum,
    input.maximum,
  )
  return Math.floor(lower + input.fuzzFactor * (upper - lower + 1))
}

function constrainPassingInterval(input: {
  interval: number
  minimum: number
  config: DeckConfig
  fuzzFactor: number
}): number {
  const [minimum, maximum] = minAndMaxReviewIntervals(input.config, input.minimum)
  return withReviewFuzz({
    interval: input.interval * input.config.intervalMultiplier,
    minimum,
    maximum,
    fuzzFactor: input.fuzzFactor,
  })
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

function learningStepIndex(steps: readonly number[], remainingSteps: number): number {
  return Math.min(
    Math.max(0, steps.length - remainingSteps),
    Math.max(0, steps.length - 1),
  )
}

function learningStepSeconds(delayMinutes: number): number {
  return Math.floor(delayMinutes * SECONDS_PER_MINUTE)
}

function learningHardDelaySeconds(
  steps: readonly number[],
  remainingSteps: number,
): number | null {
  if (steps.length === 0) return null
  const index = learningStepIndex(steps, remainingSteps)
  const currentMinutes = steps[index] ?? steps[0]
  const current = learningStepSeconds(currentMinutes)
  if (index > 0) return current

  const next = steps[1]
  if (next !== undefined) {
    return roundLongLearningDelaySeconds(
      Math.floor((current + learningStepSeconds(next)) / 2),
    )
  }

  return roundLongLearningDelaySeconds(
    Math.min(Math.floor((current * 3) / 2), current + SECONDS_PER_DAY),
  )
}

function roundLongLearningDelaySeconds(delaySeconds: number): number {
  return delaySeconds > SECONDS_PER_DAY
    ? Math.round(delaySeconds / SECONDS_PER_DAY) * SECONDS_PER_DAY
    : delaySeconds
}

function learningGoodDelaySeconds(
  steps: readonly number[],
  remainingSteps: number,
): number | null {
  const index = learningStepIndex(steps, remainingSteps)
  const next = steps[index + 1]
  return next === undefined ? null : learningStepSeconds(next)
}

function remainingLearningStepsAfterGood(
  steps: readonly number[],
  remainingSteps: number,
): number {
  const index = learningStepIndex(steps, remainingSteps)
  return Math.max(0, steps.length - (index + 1))
}

function learningDelay(input: {
  delaySeconds: number
  timing: SchedulerTiming
  rolloverHour: number
  fuzzFactor: number
}): LearningDelay {
  const delayMs = input.delaySeconds * MILLISECONDS_PER_SECOND
  if (learningIntervalCrossesRollover(input.timing, delayMs)) {
    return {
      queue: "day-learning",
      due: scheduleDayInterval(
        input.timing,
        learningIntervalDays(input.timing, delayMs),
        input.rolloverHour,
      ),
    }
  }

  const fuzzWindowSeconds = Math.floor(
    Math.min(input.delaySeconds * LEARNING_FUZZ_FRACTION, LEARNING_FUZZ_MAX_SECONDS),
  )
  const fuzzSeconds = Math.floor(input.fuzzFactor * fuzzWindowSeconds)
  return {
    queue: "learning",
    due:
      input.timing.now +
      (input.delaySeconds + fuzzSeconds) * MILLISECONDS_PER_SECOND,
  }
}

function graduationResult(input: {
  card: FlashcardCard
  config: DeckConfig
  timing: SchedulerTiming
  interval: number
  easeFactor: number
  lapses?: number
}): ScheduleResult {
  const fuzzFactor = stableFuzzFactor(input.card.cardID, input.card.reps)
  const [minimum, maximum] = minAndMaxReviewIntervals(input.config, 1)
  const interval = withReviewFuzz({
    interval: input.interval,
    minimum,
    maximum,
    fuzzFactor,
  })
  return {
    newState: "review",
    newQueue: "review",
    newInterval: interval,
    newEaseFactor: input.easeFactor,
    nextDue: scheduleDayInterval(input.timing, interval, input.config.rolloverHour),
    remainingSteps: 0,
    reps: input.card.reps + 1,
    lapses: input.lapses ?? input.card.lapses,
    isLeech: false,
  }
}

function scheduleLearningCard(input: {
  card: FlashcardCard
  rating: CardRating
  config: DeckConfig
  timing: SchedulerTiming
  steps: readonly number[]
  relearning: boolean
}): ScheduleResult {
  const { card, config, steps, timing } = input
  const fuzzFactor = stableFuzzFactor(card.cardID, card.reps)
  const currentRemaining = card.state === "new" ? steps.length : card.remainingSteps
  const learningState: Extract<CardState, "learning" | "relearning"> = input.relearning
    ? "relearning"
    : "learning"
  const base = {
    newState: learningState,
    newInterval: card.interval,
    newEaseFactor: input.relearning ? card.easeFactor : config.initialEaseFactor,
    reps: card.reps + 1,
    lapses: card.lapses,
    isLeech: false,
  }

  const graduateGood = (): ScheduleResult => {
    if (input.relearning) {
      const interval = Math.max(1, card.interval)
      return {
        ...base,
        newState: "review",
        newQueue: "review",
        newInterval: interval,
        nextDue: scheduleDayInterval(timing, interval, config.rolloverHour),
        remainingSteps: 0,
      }
    }
    return graduationResult({
      card,
      config,
      timing,
      interval: config.graduatingIntervalGood,
      easeFactor: base.newEaseFactor,
    })
  }

  switch (input.rating) {
    case "again": {
      const firstStep = steps[0]
      if (firstStep === undefined) return graduateGood()
      const delay = learningDelay({
        delaySeconds: learningStepSeconds(firstStep),
        timing,
        rolloverHour: config.rolloverHour,
        fuzzFactor,
      })
      return {
        ...base,
        newQueue: delay.queue,
        newInterval: input.relearning ? failingReviewInterval({ card, config }) : base.newInterval,
        nextDue: delay.due,
        remainingSteps: steps.length,
      }
    }
    case "hard": {
      const delaySeconds = learningHardDelaySeconds(steps, currentRemaining)
      if (delaySeconds === null) return graduateGood()
      const delay = learningDelay({
        delaySeconds,
        timing,
        rolloverHour: config.rolloverHour,
        fuzzFactor,
      })
      return {
        ...base,
        newQueue: delay.queue,
        nextDue: delay.due,
        remainingSteps: currentRemaining,
      }
    }
    case "good": {
      const delaySeconds = learningGoodDelaySeconds(steps, currentRemaining)
      if (delaySeconds === null) return graduateGood()
      const delay = learningDelay({
        delaySeconds,
        timing,
        rolloverHour: config.rolloverHour,
        fuzzFactor,
      })
      return {
        ...base,
        newQueue: delay.queue,
        nextDue: delay.due,
        remainingSteps: remainingLearningStepsAfterGood(steps, currentRemaining),
      }
    }
    case "easy": {
      if (input.relearning) {
        const interval = Math.max(1, card.interval) + 1
        return {
          ...base,
          newState: "review",
          newQueue: "review",
          newInterval: interval,
          nextDue: scheduleDayInterval(timing, interval, config.rolloverHour),
          remainingSteps: 0,
        }
      }

      const [minimum, maximum] = minAndMaxReviewIntervals(config, 1)
      const goodInterval = withReviewFuzz({
        interval: config.graduatingIntervalGood,
        minimum,
        maximum,
        fuzzFactor,
      })
      const easyInterval = withReviewFuzz({
        interval: config.graduatingIntervalEasy,
        minimum: Math.min(maximum, goodInterval + 1),
        maximum,
        fuzzFactor,
      })
      return {
        ...base,
        newState: "review",
        newQueue: "review",
        newInterval: easyInterval,
        nextDue: scheduleDayInterval(timing, easyInterval, config.rolloverHour),
        remainingSteps: 0,
      }
    }
  }
}

function leechThresholdMet(lapses: number, threshold: number): boolean {
  if (threshold <= 0) return false
  const halfThreshold = Math.max(1, Math.ceil(threshold / 2))
  return lapses >= threshold && (lapses - threshold) % halfThreshold === 0
}

function passingReviewIntervals(input: {
  card: FlashcardCard
  config: DeckConfig
  timing: SchedulerTiming
}): { hard: number; good: number; easy: number } {
  const currentInterval = Math.max(1, input.card.interval)
  const daysLate = schedulingDaysLate(
    input.card.due,
    input.timing.now,
    input.config.rolloverHour,
  )
  const fuzzFactor = stableFuzzFactor(input.card.cardID, input.card.reps)
  const hardMinimum =
    input.config.hardMultiplier <= 1 ? 1 : Math.round(input.card.interval) + 1
  const hard = constrainPassingInterval({
    interval: currentInterval * input.config.hardMultiplier,
    minimum: hardMinimum,
    config: input.config,
    fuzzFactor,
  })
  const goodMinimum =
    input.config.hardMultiplier <= 1 ? Math.round(input.card.interval) + 1 : hard + 1
  const good = constrainPassingInterval({
    interval: (currentInterval + daysLate / 2) * (input.card.easeFactor / 1000),
    minimum: goodMinimum,
    config: input.config,
    fuzzFactor,
  })
  const easy = constrainPassingInterval({
    interval:
      (currentInterval + daysLate) *
      (input.card.easeFactor / 1000) *
      input.config.easyMultiplier,
    minimum: good + 1,
    config: input.config,
    fuzzFactor,
  })
  return { hard, good, easy }
}

function failingReviewInterval(input: {
  card: FlashcardCard
  config: DeckConfig
}): number {
  const [minimum, maximum] = minAndMaxReviewIntervals(
    input.config,
    input.config.minimumLapseInterval,
  )
  return withReviewFuzz({
    interval: Math.max(1, input.card.interval) * input.config.lapseMultiplier,
    minimum,
    maximum,
    fuzzFactor: stableFuzzFactor(input.card.cardID, input.card.reps),
  })
}

function scheduleReviewCard(input: {
  card: FlashcardCard
  rating: CardRating
  config: DeckConfig
  timing: SchedulerTiming
}): ScheduleResult {
  const { card, config, timing } = input
  const intervals = passingReviewIntervals(input)
  const base: Omit<ScheduleResult, "newInterval" | "nextDue"> = {
    newState: "review",
    newQueue: "review",
    newEaseFactor: card.easeFactor,
    remainingSteps: 0,
    reps: card.reps + 1,
    lapses: card.lapses,
    isLeech: false,
  }

  switch (input.rating) {
    case "again": {
      const lapses = card.lapses + 1
      const lapseInterval = failingReviewInterval({ card, config })
      const newEaseFactor = clampEaseFactor(card.easeFactor - EASE_AGAIN_PENALTY)
      const isLeech = leechThresholdMet(lapses, config.leechThreshold)
      const firstRelearnStep = config.relearnSteps[0]
      if (firstRelearnStep === undefined) {
        return {
          ...base,
          newInterval: lapseInterval,
          newEaseFactor,
          nextDue: scheduleDayInterval(timing, lapseInterval, config.rolloverHour),
          lapses,
          isLeech,
        }
      }

      const delay = learningDelay({
        delaySeconds: learningStepSeconds(firstRelearnStep),
        timing,
        rolloverHour: config.rolloverHour,
        fuzzFactor: stableFuzzFactor(card.cardID, card.reps),
      })
      return {
        ...base,
        newState: "relearning",
        newQueue: delay.queue,
        newInterval: lapseInterval,
        newEaseFactor,
        nextDue: delay.due,
        remainingSteps: config.relearnSteps.length,
        lapses,
        isLeech,
      }
    }
    case "hard":
      return {
        ...base,
        newInterval: intervals.hard,
        newEaseFactor: clampEaseFactor(card.easeFactor - EASE_HARD_PENALTY),
        nextDue: scheduleDayInterval(timing, intervals.hard, config.rolloverHour),
      }
    case "good":
      return {
        ...base,
        newInterval: intervals.good,
        nextDue: scheduleDayInterval(timing, intervals.good, config.rolloverHour),
      }
    case "easy":
      return {
        ...base,
        newInterval: intervals.easy,
        newEaseFactor: card.easeFactor + EASE_EASY_BONUS,
        nextDue: scheduleDayInterval(timing, intervals.easy, config.rolloverHour),
      }
  }
}

/**
 * Apply one rating using the applicable subset of Anki's legacy scheduling
 * states. Queue eligibility and counts are deliberately owned by queue.ts.
 */
function scheduleReview(input: {
  card: FlashcardCard
  rating: CardRating
  config: DeckConfig
  now: number
}): ScheduleResult {
  const timing = schedulerTiming(input.now, input.config.rolloverHour)
  switch (input.card.state) {
    case "new":
    case "learning":
      return scheduleLearningCard({
        ...input,
        timing,
        steps: input.config.learnSteps,
        relearning: false,
      })
    case "relearning":
      return scheduleLearningCard({
        ...input,
        timing,
        steps: input.config.relearnSteps,
        relearning: true,
      })
    case "review":
      return scheduleReviewCard({ ...input, timing })
  }
}

export {
  constrainedReviewFuzzBounds,
  leechThresholdMet,
  listClozeOrdinals,
  scheduleReview,
}
export type { ScheduleResult }
