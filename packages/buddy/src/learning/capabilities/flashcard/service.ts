import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import { ulid } from "ulid"
import { FlashcardPath, InvalidFlashcardDeckIDError } from "./path"
import { computeDueCounts, listClozeOrdinals, scheduleReview, selectNextDueCard } from "./scheduler"
import {
  DECK_CONFIG_DEFAULTS,
  DeckConfigSchema,
  FLASHCARD_DECK_KIND,
  FlashcardDeckSchema,
  ReviewRecordSchema,
  type CardRating,
  type DueCounts,
  type FlashcardCard,
  type FlashcardDeck,
  type FlashcardNote,
  type ReviewRecord,
  type SaveFlashcardNoteInput,
  type SubmitReviewOutput,
} from "./types"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLASHCARD_API_PATH = "/api/flashcard-decks"

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class FlashcardDeckNotFoundError extends Error {
  constructor(deckID: string) {
    super(`Flashcard deck '${deckID}' was not found.`)
    this.name = "FlashcardDeckNotFoundError"
  }
}

class FlashcardValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FlashcardValidationError"
  }
}

class FlashcardCardNotFoundError extends Error {
  constructor(cardID: string) {
    super(`Flashcard card '${cardID}' was not found.`)
    this.name = "FlashcardCardNotFoundError"
  }
}

// ---------------------------------------------------------------------------
// Route error mapping
// ---------------------------------------------------------------------------

function mapFlashcardRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidFlashcardDeckIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof FlashcardDeckNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof FlashcardValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof FlashcardCardNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return undefined
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildDeckUrl(directory: string, deckID: string): string {
  return `${FLASHCARD_API_PATH}/${deckID}?directory=${encodeURIComponent(directory)}`
}

// ---------------------------------------------------------------------------
// Note → Card generation
// ---------------------------------------------------------------------------

function generateCardsForNote(
  note: FlashcardNote,
  config: typeof DECK_CONFIG_DEFAULTS,
): FlashcardCard[] {
  const cards: FlashcardCard[] = []

  if (note.type === "basic") {
    cards.push({
      cardID: ulid(),
      noteID: note.noteID,
      templateIdx: 0,
      state: "new",
      due: 0,
      interval: 0,
      easeFactor: config.initialEaseFactor,
      reps: 0,
      lapses: 0,
      remainingSteps: 0,
    })
  } else {
    // Cloze: one card per unique {{cN::...}} index
    const fields = note.fields
    const text = "text" in fields ? fields.text : ""
    const ordinals = listClozeOrdinals(text)
    if (ordinals.length === 0) {
      throw new FlashcardValidationError(
        `Cloze note '${note.noteID}' must contain at least one {{cN::...}} deletion.`,
      )
    }
    for (const ordinal of ordinals) {
      cards.push({
        cardID: ulid(),
        noteID: note.noteID,
        templateIdx: ordinal - 1,
        state: "new",
        due: 0,
        interval: 0,
        easeFactor: config.initialEaseFactor,
        reps: 0,
        lapses: 0,
        remainingSteps: 0,
      })
    }
  }

  return cards
}

function buildNotesAndCards(
  deckID: string,
  inputs: SaveFlashcardNoteInput[],
  config: typeof DECK_CONFIG_DEFAULTS,
): { notes: FlashcardNote[]; cards: FlashcardCard[] } {
  const notes: FlashcardNote[] = []
  const cards: FlashcardCard[] = []

  for (const input of inputs) {
    const noteID = ulid()
    const note: FlashcardNote = {
      noteID,
      deckID,
      type: input.type,
      fields: input.fields,
      tags: input.tags ?? [],
      ...(input.source ? { source: input.source } : {}),
    }
    notes.push(note)
    cards.push(...generateCardsForNote(note, config))
  }

  return { notes, cards }
}

// ---------------------------------------------------------------------------
// CRUD: write / read / list
// ---------------------------------------------------------------------------

async function writeDeck(input: { directory: string; deck: FlashcardDeck }): Promise<void> {
  const deckPath = FlashcardPath.deckFile(input.directory, input.deck.deckID)
  await fs.mkdir(FlashcardPath.deckDirectory(input.directory, input.deck.deckID), {
    recursive: true,
  })
  await fs.writeFile(deckPath, JSON.stringify(input.deck, null, 2), "utf8")
}

async function save(input: { directory: string; deck: FlashcardDeck }): Promise<FlashcardDeck> {
  const parsed = FlashcardDeckSchema.parse(input.deck)
  await writeDeck({ directory: input.directory, deck: parsed })
  return parsed
}

async function read(directory: string, deckID: string): Promise<FlashcardDeck> {
  const safeDeckID = FlashcardPath.sanitizeDeckID(deckID)

  let deckText: string
  try {
    deckText = await fs.readFile(FlashcardPath.deckFile(directory, safeDeckID), "utf8")
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new FlashcardDeckNotFoundError(safeDeckID)
    }
    throw error
  }

  return FlashcardDeckSchema.parse(JSON.parse(deckText))
}

type FlashcardDeckListItem = {
  deckID: string
  kind: typeof FLASHCARD_DECK_KIND
  title: string
  noteCount: number
  cardCount: number
  dueCounts: DueCounts
  reviewAvailable: boolean
  createdAt: string
  createdBy: FlashcardDeck["createdBy"]
}

type ReviewedTodayCounts = {
  newCount: number
  reviewCount: number
}

function countReviewedToday(records: ReviewRecord[]): ReviewedTodayCounts {
  let newCount = 0
  let reviewCount = 0

  for (const record of records) {
    if (record.previousState === "new") newCount++
    if (record.previousState === "review") reviewCount++
  }

  return { newCount, reviewCount }
}

async function list(directory: string): Promise<FlashcardDeckListItem[]> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(FlashcardPath.root(directory), { withFileTypes: true })
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return []
    }
    throw error
  }

  const now = Date.now()
  const decks = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const deck = await read(directory, entry.name)
          const config = DeckConfigSchema.parse(deck.config)
          const reviewedToday = countReviewedToday(
            await readTodayReviewRecords(directory, deck.deckID),
          )
          return {
            deckID: deck.deckID,
            kind: deck.kind,
            title: deck.title,
            noteCount: deck.notes.length,
            cardCount: deck.cards.length,
            dueCounts: computeDueCounts(deck.cards, now),
            reviewAvailable:
              selectNextDueCard({
                cards: deck.cards,
                config,
                now,
                reviewedToday,
              }) !== undefined,
            createdAt: deck.createdAt,
            createdBy: {
              ...deck.createdBy,
            },
          }
        } catch {
          return undefined
        }
      }),
  )

  return decks
    .filter((deck): deck is FlashcardDeckListItem => deck !== undefined)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
}

// ---------------------------------------------------------------------------
// Review operations
// ---------------------------------------------------------------------------

function todayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, "0")
  const day = `${now.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

async function appendReviewRecord(
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

async function readTodayReviewRecords(directory: string, deckID: string): Promise<ReviewRecord[]> {
  const filePath = FlashcardPath.reviewFile(directory, deckID, todayISO())
  let content: string
  try {
    content = await fs.readFile(filePath, "utf8")
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") return []
    throw error
  }

  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => ReviewRecordSchema.parse(JSON.parse(line)))
}

async function readReviewedTodayCounts(
  directory: string,
  deckID: string,
): Promise<ReviewedTodayCounts> {
  return countReviewedToday(await readTodayReviewRecords(directory, deckID))
}

async function submitReview(input: {
  directory: string
  deckID: string
  cardID: string
  rating: CardRating
  timeTakenMs: number
}): Promise<SubmitReviewOutput> {
  const deck = await read(input.directory, input.deckID)
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

  // Update the deck in place
  deck.cards[cardIndex] = updatedCard
  await writeDeck({ directory: input.directory, deck })

  // Append review record
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

  await appendReviewRecord(input.directory, input.deckID, record)

  return {
    cardID: input.cardID,
    newState: result.newState,
    newInterval: result.newInterval,
    newEaseFactor: result.newEaseFactor,
    nextDue: result.nextDue,
    isLeech: result.isLeech,
  }
}

// ---------------------------------------------------------------------------
// Get next card for review session
// ---------------------------------------------------------------------------

async function getNextCard(input: {
  directory: string
  deckID: string
}): Promise<FlashcardCard | undefined> {
  const deck = await read(input.directory, input.deckID)
  const config = DeckConfigSchema.parse(deck.config)
  const now = Date.now()
  const reviewedToday = await readReviewedTodayCounts(input.directory, input.deckID)

  return selectNextDueCard({
    cards: deck.cards,
    config,
    now,
    reviewedToday,
  })
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

const FlashcardService = {
  buildDeckUrl,
  buildNotesAndCards,
  getNextCard,
  list,
  read,
  save,
  submitReview,
}

export {
  FlashcardCardNotFoundError,
  FlashcardDeckNotFoundError,
  FlashcardService,
  FlashcardValidationError,
  mapFlashcardRouteError,
}

export type { FlashcardDeckListItem }
