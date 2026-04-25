import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import { FlashcardPath } from "./path"
import { computeDueCounts, selectNextDueCard } from "./scheduler"
import {
  DeckConfigSchema,
  FLASHCARD_DECK_KIND,
  FlashcardDeckSchema,
  ReviewRecordSchema,
  type DueCounts,
  type FlashcardDeck,
  type ReviewRecord,
} from "./types"
import { FlashcardDeckNotFoundError } from "./errors"

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

function todayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, "0")
  const day = `${now.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
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

async function readFlashcardReviewedTodayCounts(
  directory: string,
  deckID: string,
): Promise<ReviewedTodayCounts> {
  return countReviewedToday(await readTodayReviewRecords(directory, deckID))
}

async function readFlashcardDeck(directory: string, deckID: string): Promise<FlashcardDeck> {
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

async function listFlashcardDecks(directory: string): Promise<FlashcardDeckListItem[]> {
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
          const deck = await readFlashcardDeck(directory, entry.name)
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

export { listFlashcardDecks, readFlashcardDeck, readFlashcardReviewedTodayCounts, todayISO }

export type { FlashcardDeckListItem }
