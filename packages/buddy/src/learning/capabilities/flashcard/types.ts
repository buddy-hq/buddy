import z from "zod"

const nonEmptyString = z.string().trim().min(1)
const timestampMs = z.number().int().nonnegative()
const ulidString = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLASHCARD_DECK_KIND = "flashcard-deck.v1" as const
const FLASHCARD_SUBAGENT_ID = "flashcard-author" as const
const FLASHCARD_SURFACE = "flashcard" as const

// ---------------------------------------------------------------------------
// Card rating & state
// ---------------------------------------------------------------------------

const CardRatingSchema = z.enum(["again", "hard", "good", "easy"])
const CardStateSchema = z.enum(["new", "learning", "review", "relearning"])

// ---------------------------------------------------------------------------
// Deck config (SM-2 parameters)
// ---------------------------------------------------------------------------

const DECK_CONFIG_DEFAULTS = {
  newPerDay: 20,
  reviewsPerDay: 200,
  learnSteps: [1, 10],
  relearnSteps: [10],
  graduatingIntervalGood: 1,
  graduatingIntervalEasy: 4,
  initialEaseFactor: 2500,
  hardMultiplier: 1.2,
  easyMultiplier: 1.3,
  lapseMultiplier: 0,
  maxInterval: 36500,
  leechThreshold: 8,
} as const

const DeckConfigSchema = z.object({
  newPerDay: z.number().int().nonnegative().default(DECK_CONFIG_DEFAULTS.newPerDay),
  reviewsPerDay: z.number().int().nonnegative().default(DECK_CONFIG_DEFAULTS.reviewsPerDay),
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
  /** 0 means reset to learnSteps on lapse; >0 means interval * lapseMultiplier. */
  lapseMultiplier: z.number().nonnegative().default(DECK_CONFIG_DEFAULTS.lapseMultiplier),
  maxInterval: z.number().int().positive().default(DECK_CONFIG_DEFAULTS.maxInterval),
  leechThreshold: z.number().int().positive().default(DECK_CONFIG_DEFAULTS.leechThreshold),
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
  noteID: ulidString,
  deckID: ulidString,
  type: NoteTypeSchema,
  fields: z.union([BasicFieldsSchema, ClozeFieldsSchema]),
  tags: z.array(nonEmptyString).default([]),
  source: nonEmptyString.optional(),
})

// ---------------------------------------------------------------------------
// Card (reviewable unit)
// ---------------------------------------------------------------------------

const FlashcardCardSchema = z.object({
  cardID: ulidString,
  noteID: ulidString,
  templateIdx: z.number().int().nonnegative(),
  state: CardStateSchema,
  /** Timestamp ms – when this card is next due. */
  due: timestampMs,
  /** Review interval in days (0 while learning). */
  interval: z.number().nonnegative(),
  /** Ease factor in permille, e.g. 2500 = 250%. */
  easeFactor: z.number().int().min(1300),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  /** Index into learnSteps / relearnSteps. */
  remainingSteps: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------
// Deck (top-level artifact)
// ---------------------------------------------------------------------------

const FlashcardDeckSchema = z.object({
  deckID: ulidString,
  kind: z.literal(FLASHCARD_DECK_KIND),
  title: nonEmptyString,
  config: DeckConfigSchema,
  notes: z.array(FlashcardNoteSchema),
  cards: z.array(FlashcardCardSchema),
  source: nonEmptyString.optional(),
  createdAt: z.string().datetime(),
  createdBy: z.object({
    sessionID: nonEmptyString,
    messageID: nonEmptyString,
    callID: nonEmptyString,
    subagent: z.literal(FLASHCARD_SUBAGENT_ID),
  }),
})

// ---------------------------------------------------------------------------
// Review record (append-only log entry)
// ---------------------------------------------------------------------------

const ReviewRecordSchema = z.object({
  cardID: ulidString,
  rating: CardRatingSchema,
  answeredAt: timestampMs,
  timeTakenMs: z.number().int().nonnegative(),
  previousState: CardStateSchema,
  newState: CardStateSchema,
  previousInterval: z.number().nonnegative(),
  newInterval: z.number().nonnegative(),
  previousEaseFactor: z.number().int().min(1300),
  newEaseFactor: z.number().int().min(1300),
})

// ---------------------------------------------------------------------------
// Tool I/O schemas
// ---------------------------------------------------------------------------

const SaveFlashcardNoteInputSchema = z.object({
  type: NoteTypeSchema.describe(
    'Card type. "basic" = front/back pair. "cloze" = fill-in-the-blank with {{c1::answer}} syntax.',
  ),
  fields: z
    .union([BasicFieldsSchema, ClozeFieldsSchema])
    .describe(
      'For type "basic": { "front": "question text", "back": "answer text" }. For type "cloze": { "text": "The {{c1::mitochondria}} is the powerhouse of the cell." }.',
    ),
  tags: z.array(nonEmptyString).default([]).describe("Optional tags for the note."),
  source: nonEmptyString.optional().describe("Optional source reference for this note."),
})

const SaveFlashcardDeckInputSchema = z.object({
  title: nonEmptyString.describe("Human-readable deck title."),
  notes: z
    .array(SaveFlashcardNoteInputSchema)
    .min(1)
    .describe(
      "Array of note objects. Each note is an object with type, fields, and optional tags/source. One note produces one or more review cards.",
    ),
  source: nonEmptyString
    .optional()
    .describe("Optional source reference for the entire deck (e.g. file name or URL)."),
})

const SaveFlashcardDeckOutputSchema = z.object({
  deckID: ulidString,
  kind: z.literal(FLASHCARD_DECK_KIND),
  title: nonEmptyString,
  noteCount: z.number().int().positive(),
  cardCount: z.number().int().positive(),
  deckUrl: nonEmptyString,
})

const SubmitReviewInputSchema = z.object({
  deckID: ulidString,
  cardID: ulidString,
  rating: CardRatingSchema,
  timeTakenMs: z.number().int().nonnegative(),
})

const SubmitReviewOutputSchema = z.object({
  cardID: ulidString,
  newState: CardStateSchema,
  newInterval: z.number().nonnegative(),
  newEaseFactor: z.number().int().min(1300),
  nextDue: timestampMs,
  isLeech: z.boolean(),
})

const DueCountsSchema = z.object({
  new: z.number().int().nonnegative(),
  learning: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

type CardRating = z.infer<typeof CardRatingSchema>
type CardState = z.infer<typeof CardStateSchema>
type NoteType = z.infer<typeof NoteTypeSchema>
type BasicFields = z.infer<typeof BasicFieldsSchema>
type ClozeFields = z.infer<typeof ClozeFieldsSchema>
type DeckConfig = z.infer<typeof DeckConfigSchema>
type FlashcardNote = z.infer<typeof FlashcardNoteSchema>
type FlashcardCard = z.infer<typeof FlashcardCardSchema>
type FlashcardDeck = z.infer<typeof FlashcardDeckSchema>
type ReviewRecord = z.infer<typeof ReviewRecordSchema>
type DueCounts = z.infer<typeof DueCountsSchema>
type SaveFlashcardNoteInput = z.infer<typeof SaveFlashcardNoteInputSchema>
type SaveFlashcardDeckInput = z.infer<typeof SaveFlashcardDeckInputSchema>
type SaveFlashcardDeckOutput = z.infer<typeof SaveFlashcardDeckOutputSchema>
type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>
type SubmitReviewOutput = z.infer<typeof SubmitReviewOutputSchema>

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  BasicFieldsSchema,
  CardRatingSchema,
  CardStateSchema,
  ClozeFieldsSchema,
  DECK_CONFIG_DEFAULTS,
  DeckConfigSchema,
  DueCountsSchema,
  FLASHCARD_DECK_KIND,
  FLASHCARD_SUBAGENT_ID,
  FLASHCARD_SURFACE,
  FlashcardCardSchema,
  FlashcardDeckSchema,
  FlashcardNoteSchema,
  NoteTypeSchema,
  ReviewRecordSchema,
  SaveFlashcardDeckInputSchema,
  SaveFlashcardDeckOutputSchema,
  SaveFlashcardNoteInputSchema,
  SubmitReviewInputSchema,
  SubmitReviewOutputSchema,
}

export type {
  BasicFields,
  CardRating,
  CardState,
  ClozeFields,
  DeckConfig,
  DueCounts,
  FlashcardCard,
  FlashcardDeck,
  FlashcardNote,
  NoteType,
  ReviewRecord,
  SaveFlashcardDeckInput,
  SaveFlashcardDeckOutput,
  SaveFlashcardNoteInput,
  SubmitReviewInput,
  SubmitReviewOutput,
}
