import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectOriginSchema,
  nonEmptyString,
} from "../../../objects"

const timestampMs = z.number().int().nonnegative()

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLASHCARD_DECK_KIND = BUDDY_OBJECT_KINDS.flashcardDeck
const FLASHCARD_SUBAGENT_ID = "flashcard-author"

// ---------------------------------------------------------------------------
// Card rating & state
// ---------------------------------------------------------------------------

const CardRatingSchema = z.enum(["again", "hard", "good", "easy"])
const CardStateSchema = z.enum(["new", "learning", "review", "relearning"])
const CardQueueSchema = z.enum(["new", "learning", "day-learning", "review"])

// ---------------------------------------------------------------------------
// Deck config (Anki legacy scheduler parameters)
// ---------------------------------------------------------------------------

const DECK_CONFIG_DEFAULTS = {
  newPerDay: 20,
  reviewsPerDay: 200,
  newCardsIgnoreReviewLimit: false,
  learnAheadMinutes: 20,
  rolloverHour: 4,
  learnSteps: [1, 10],
  relearnSteps: [10],
  graduatingIntervalGood: 1,
  graduatingIntervalEasy: 4,
  initialEaseFactor: 2500,
  hardMultiplier: 1.2,
  easyMultiplier: 1.3,
  intervalMultiplier: 1,
  lapseMultiplier: 0,
  minimumLapseInterval: 1,
  maxInterval: 36500,
  leechThreshold: 8,
}

const DeckConfigSchema = z.object({
  newPerDay: z.number().int().nonnegative().default(DECK_CONFIG_DEFAULTS.newPerDay),
  reviewsPerDay: z.number().int().nonnegative().default(DECK_CONFIG_DEFAULTS.reviewsPerDay),
  newCardsIgnoreReviewLimit: z.boolean().default(DECK_CONFIG_DEFAULTS.newCardsIgnoreReviewLimit),
  /** Minutes to make short learning cards available before their exact due time. */
  learnAheadMinutes: z.number().int().nonnegative().default(DECK_CONFIG_DEFAULTS.learnAheadMinutes),
  /** Local hour at which the scheduling day rolls over. */
  rolloverHour: z.number().int().min(0).max(23).default(DECK_CONFIG_DEFAULTS.rolloverHour),
  /** Minutes between learning steps, e.g. [1, 10]. */
  learnSteps: z.array(z.number().positive()).default([...DECK_CONFIG_DEFAULTS.learnSteps]),
  /** Minutes between relearning steps. */
  relearnSteps: z.array(z.number().positive()).default([...DECK_CONFIG_DEFAULTS.relearnSteps]),
  /** Days – interval assigned when a learning card graduates via Good. */
  graduatingIntervalGood: z
    .number()
    .int()
    .positive()
    .default(DECK_CONFIG_DEFAULTS.graduatingIntervalGood),
  /** Days – interval assigned when a learning card graduates via Easy. */
  graduatingIntervalEasy: z
    .number()
    .int()
    .positive()
    .default(DECK_CONFIG_DEFAULTS.graduatingIntervalEasy),
  /** Permille (‰) – starting ease factor, e.g. 2500 = 250%. */
  initialEaseFactor: z.number().int().min(1300).default(DECK_CONFIG_DEFAULTS.initialEaseFactor),
  hardMultiplier: z.number().positive().default(DECK_CONFIG_DEFAULTS.hardMultiplier),
  easyMultiplier: z.number().positive().default(DECK_CONFIG_DEFAULTS.easyMultiplier),
  intervalMultiplier: z.number().positive().default(DECK_CONFIG_DEFAULTS.intervalMultiplier),
  /** 0 means use the minimum lapse interval; >0 scales the previous interval. */
  lapseMultiplier: z.number().nonnegative().default(DECK_CONFIG_DEFAULTS.lapseMultiplier),
  minimumLapseInterval: z
    .number()
    .int()
    .positive()
    .default(DECK_CONFIG_DEFAULTS.minimumLapseInterval),
  maxInterval: z.number().int().positive().default(DECK_CONFIG_DEFAULTS.maxInterval),
  /** 0 disables leech notifications. */
  leechThreshold: z.number().int().nonnegative().default(DECK_CONFIG_DEFAULTS.leechThreshold),
})

// ---------------------------------------------------------------------------
// Note (content unit – one note produces one or more cards)
// ---------------------------------------------------------------------------

const NoteTypeSchema = z.enum(["basic", "cloze"])

const BasicFieldsSchema = z.object({
  front: nonEmptyString.describe("The question or prompt shown on the front of the card."),
  back: nonEmptyString.describe("The answer shown on the back of the card."),
})

const ClozeFieldsSchema = z.object({
  text: nonEmptyString.describe(
    'Text with cloze deletions using {{c1::answer}} syntax. Example: "The {{c1::mitochondria}} is the powerhouse of the {{c2::cell}}."',
  ),
})

const FlashcardNoteSchema = z.object({
  noteID: BuddyObjectIDSchema,
  objectID: BuddyObjectIDSchema,
  type: NoteTypeSchema,
  fields: z.union([BasicFieldsSchema, ClozeFieldsSchema]),
  tags: z.array(nonEmptyString).default([]),
  source: nonEmptyString.optional(),
})

// ---------------------------------------------------------------------------
// Card (reviewable unit)
// ---------------------------------------------------------------------------

const FlashcardCardSchema = z.object({
  cardID: BuddyObjectIDSchema,
  noteID: BuddyObjectIDSchema,
  templateIdx: z.number().int().nonnegative(),
  state: CardStateSchema,
  /**
   * Queue placement is distinct from card state, following Anki. Optional only
   * so pre-port decks can be normalized from `state` when read.
   */
  queue: CardQueueSchema.optional(),
  /** Timestamp ms – when this card is next due. */
  due: timestampMs,
  /** Review interval in days (0 while learning). */
  interval: z.number().int().nonnegative(),
  /** Ease factor in permille, e.g. 2500 = 250%. */
  easeFactor: z.number().int().min(1300),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  /** Number of configured learning or relearning steps still active. */
  remainingSteps: z.number().int().nonnegative(),
  /** Timestamp of the most recent persisted answer. */
  lastReviewAt: timestampMs.optional(),
})

/**
 * Scheduler state captured when the backend dealt a card.
 *
 * The reviewer returns this with its answer so the backend can validate the
 * card against the queue that actually served it, even if wall-clock queue
 * ordering changes while the user is reading.
 */
const FlashcardQueueCardSnapshotSchema = FlashcardCardSchema.pick({
  cardID: true,
  state: true,
  queue: true,
  due: true,
  interval: true,
  easeFactor: true,
  reps: true,
  lapses: true,
  remainingSteps: true,
  lastReviewAt: true,
})

const FlashcardQueueLeaseSchema = z.object({
  queuedAt: timestampMs,
  card: FlashcardQueueCardSnapshotSchema,
})

const FlashcardDailyReviewCountsSchema = z.object({
  schedulingDay: nonEmptyString,
  newCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------
// Deck (top-level object)
// ---------------------------------------------------------------------------

const FlashcardDeckSchema = z.object({
  objectID: BuddyObjectIDSchema,
  kind: z.literal(FLASHCARD_DECK_KIND),
  title: nonEmptyString,
  config: DeckConfigSchema,
  notes: z.array(FlashcardNoteSchema),
  cards: z.array(FlashcardCardSchema),
  /** Anki-style persisted daily counters; review logs remain the event history. */
  dailyReviewCounts: FlashcardDailyReviewCountsSchema.optional(),
  source: nonEmptyString.optional(),
  createdAt: z.string().datetime(),
  createdBy: BuddyObjectOriginSchema,
})

// ---------------------------------------------------------------------------
// Review record (append-only log entry)
// ---------------------------------------------------------------------------

const ReviewRecordSchema = z.object({
  reviewID: BuddyObjectIDSchema,
  cardID: BuddyObjectIDSchema,
  rating: CardRatingSchema,
  answeredAt: timestampMs,
  timeTakenMs: z.number().int().nonnegative(),
  previousState: CardStateSchema,
  newState: CardStateSchema,
  previousQueue: CardQueueSchema.optional(),
  newQueue: CardQueueSchema.optional(),
  previousInterval: z.number().int().nonnegative(),
  newInterval: z.number().int().nonnegative(),
  previousEaseFactor: z.number().int().min(1300),
  newEaseFactor: z.number().int().min(1300),
})

// ---------------------------------------------------------------------------
// Tool I/O schemas
// ---------------------------------------------------------------------------

const SubmitReviewInputSchema = z.object({
  objectID: BuddyObjectIDSchema,
  cardID: BuddyObjectIDSchema,
  queueLease: FlashcardQueueLeaseSchema,
  rating: CardRatingSchema,
  timeTakenMs: z.number().int().nonnegative(),
})

const SubmitReviewOutputSchema = z.object({
  cardID: BuddyObjectIDSchema,
  newState: CardStateSchema,
  newInterval: z.number().int().nonnegative(),
  newEaseFactor: z.number().int().min(1300),
  nextDue: timestampMs,
  isLeech: z.boolean(),
})

/**
 * Why the queue is empty, and by how much.
 *
 * The booleans say which limit stopped the session; the counts say what is
 * sitting behind it. Both come out of the same queue build, because a client
 * cannot recompute either without duplicating the limit and rollover maths —
 * see the contract note on `buildFlashcardQueue`.
 */
const FlashcardQueueCompletionSchema = z.object({
  nextLearningAt: timestampMs.nullable(),
  /** Earliest actual due timestamp among cards scheduled after the current queue. */
  nextDueAt: timestampMs.nullable(),
  /** Earliest time this queue must be checked again without a review answer. */
  nextQueueAt: timestampMs.nullable(),
  newLimitReached: z.boolean(),
  reviewLimitReached: z.boolean(),
  /** New cards excluded today by the new-card limit. */
  newHeldBack: z.number().int().nonnegative(),
  /** Due review and inter-day learning cards excluded today by the review limit. */
  reviewHeldBack: z.number().int().nonnegative(),
  /** Intra-day learning cards due later today, past the learn-ahead cutoff. */
  learningLaterToday: z.number().int().nonnegative(),
  /** Review and inter-day learning cards that come back on a later day. */
  returningLater: z.number().int().nonnegative(),
  /** Answers already counted against today's limits, after the rollover check. */
  reviewedToday: z.object({
    newCount: z.number().int().nonnegative(),
    reviewCount: z.number().int().nonnegative(),
  }),
})

/**
 * Deck settings a client needs to render, already resolved through their
 * defaults.
 *
 * `DeckConfigSchema` defaults every field, which makes each one optional on the
 * way in and therefore optional in the generated client types — even though a
 * parsed deck always has them. Rather than have every caller guess a fallback
 * (and drift from the real default), the queue reports the values it actually
 * used.
 */
const FlashcardResolvedConfigSchema = z.object({
  newPerDay: z.number().int().nonnegative(),
  reviewsPerDay: z.number().int().nonnegative(),
  leechThreshold: z.number().int().nonnegative(),
})

const FlashcardQueuedCardsSchema = z.object({
  /** Every card admitted to the current queue, independent of the payload fetch limit. */
  queuedCardIDs: z.array(BuddyObjectIDSchema),
  cards: z.array(FlashcardCardSchema),
  /** Snapshot for the first admitted card, or null when the queue is empty. */
  queueLease: FlashcardQueueLeaseSchema.nullable(),
  newCount: z.number().int().nonnegative(),
  learningCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  resolvedConfig: FlashcardResolvedConfigSchema,
  completion: FlashcardQueueCompletionSchema,
})

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

type CardRating = z.infer<typeof CardRatingSchema>
type CardState = z.infer<typeof CardStateSchema>
type CardQueue = z.infer<typeof CardQueueSchema>
type NoteType = z.infer<typeof NoteTypeSchema>
type BasicFields = z.infer<typeof BasicFieldsSchema>
type ClozeFields = z.infer<typeof ClozeFieldsSchema>
type DeckConfig = z.infer<typeof DeckConfigSchema>
type FlashcardNote = z.infer<typeof FlashcardNoteSchema>
type FlashcardCard = z.infer<typeof FlashcardCardSchema>
type FlashcardDeck = z.infer<typeof FlashcardDeckSchema>
type FlashcardDailyReviewCounts = z.infer<typeof FlashcardDailyReviewCountsSchema>
type FlashcardQueueCardSnapshot = z.infer<typeof FlashcardQueueCardSnapshotSchema>
type FlashcardQueueLease = z.infer<typeof FlashcardQueueLeaseSchema>
type ReviewRecord = z.infer<typeof ReviewRecordSchema>
type FlashcardQueueCompletion = z.infer<typeof FlashcardQueueCompletionSchema>
type FlashcardQueuedCards = z.infer<typeof FlashcardQueuedCardsSchema>
type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>
type SubmitReviewOutput = z.infer<typeof SubmitReviewOutputSchema>

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  BasicFieldsSchema,
  CardRatingSchema,
  CardQueueSchema,
  CardStateSchema,
  ClozeFieldsSchema,
  DECK_CONFIG_DEFAULTS,
  DeckConfigSchema,
  FLASHCARD_DECK_KIND,
  FLASHCARD_SUBAGENT_ID,
  FlashcardCardSchema,
  FlashcardDeckSchema,
  FlashcardDailyReviewCountsSchema,
  FlashcardNoteSchema,
  FlashcardQueueCardSnapshotSchema,
  FlashcardQueueCompletionSchema,
  FlashcardQueueLeaseSchema,
  FlashcardQueuedCardsSchema,
  NoteTypeSchema,
  ReviewRecordSchema,
  SubmitReviewInputSchema,
  SubmitReviewOutputSchema,
}

export type {
  BasicFields,
  CardRating,
  CardQueue,
  CardState,
  ClozeFields,
  DeckConfig,
  FlashcardCard,
  FlashcardDeck,
  FlashcardDailyReviewCounts,
  FlashcardNote,
  FlashcardQueueCardSnapshot,
  FlashcardQueueCompletion,
  FlashcardQueueLease,
  FlashcardQueuedCards,
  NoteType,
  ReviewRecord,
  SubmitReviewInput,
  SubmitReviewOutput,
}
