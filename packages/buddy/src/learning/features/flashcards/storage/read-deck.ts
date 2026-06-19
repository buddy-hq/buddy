import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  BuddyObjectPath,
  BuddyObjectValidationError,
  FlashcardDeckObjectSummarySchema,
  readObjectJsonFile,
  readObjectManifest,
  registerBuddyObjectKind,
  type BuddyObjectViewResponse,
} from "../../../../objects"
import {
  FlashcardDeckSchema,
  ReviewRecordSchema,
  type FlashcardDeck,
  type ReviewRecord,
} from "../types"
import { FLASHCARD_DECK_OBJECT_VIEW_ID, flashcardDeckObjectStatePath } from "./save-deck"

type ReviewedTodayCounts = {
  newCount: number
  reviewCount: number
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === code
  )
}

async function readJsonFile<T>(filePath: string, schema: z.ZodSchema<T>): Promise<T> {
  const parsed: unknown = JSON.parse(await fs.readFile(filePath, "utf8"))
  return schema.parse(parsed)
}

function todayISO(timestamp = Date.now()): string {
  const now = new Date(timestamp)
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

async function readTodayObjectReviewRecords(
  directory: string,
  objectID: string,
): Promise<ReviewRecord[]> {
  const reviewDirectory = BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    "state",
    "reviews",
  )
  let entries
  try {
    entries = await fs.readdir(reviewDirectory, { withFileTypes: true })
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return []
    throw error
  }

  const records = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() && entry.name.endsWith(".json") && entry.name !== "pending-review.json",
      )
      .map((entry) => readJsonFile(path.join(reviewDirectory, entry.name), ReviewRecordSchema)),
  )
  const today = todayISO()
  return records.filter((record) => todayISO(record.answeredAt) === today)
}

async function readFlashcardObjectReviewedTodayCounts(
  directory: string,
  objectID: string,
): Promise<ReviewedTodayCounts> {
  return countReviewedToday(await readTodayObjectReviewRecords(directory, objectID))
}

async function readFlashcardDeckObject(
  directory: string,
  objectID: string,
): Promise<FlashcardDeck> {
  return readObjectJsonFile({
    directory,
    kind: BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    relativePath: flashcardDeckObjectStatePath(),
    schema: FlashcardDeckSchema,
  })
}

export { readFlashcardDeckObject, readFlashcardObjectReviewedTodayCounts, todayISO }

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.flashcardDeck,
  manifestSchema: BuddyObjectManifestSchema.safeExtend({
    summary: FlashcardDeckObjectSummarySchema,
  }),
  async readManifest(input) {
    return BuddyObjectManifestSchema.safeExtend({
      summary: FlashcardDeckObjectSummarySchema,
    }).parse(
      await readObjectManifest({
        directory: input.directory,
        kind: BUDDY_OBJECT_KINDS.flashcardDeck,
        objectID: input.ref.objectID,
      }),
    )
  },
  async readView(input): Promise<BuddyObjectViewResponse> {
    if (input.viewID !== FLASHCARD_DECK_OBJECT_VIEW_ID) {
      throw new BuddyObjectValidationError(`Unsupported flashcard deck view: ${input.viewID}`)
    }
    const deck = await readFlashcardDeckObject(input.directory, input.ref.objectID)
    return {
      ref: input.ref,
      viewID: FLASHCARD_DECK_OBJECT_VIEW_ID,
      title: deck.title,
      data: {
        renderer: "flashcard-deck",
        title: deck.title,
        noteCount: deck.notes.length,
        cardCount: deck.cards.length,
      },
    }
  },
  async resolveBenchView(input) {
    if (input.viewID !== FLASHCARD_DECK_OBJECT_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_flashcard_deck_view",
        message: `Unsupported flashcard deck Bench view: ${input.viewID}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: input.ref,
        viewID: FLASHCARD_DECK_OBJECT_VIEW_ID,
      },
    }
  },
})
