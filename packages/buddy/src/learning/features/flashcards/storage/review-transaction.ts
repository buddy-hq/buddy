import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { BUDDY_OBJECT_KINDS, BuddyObjectPath } from "../../../../objects"
import { writeJsonFileAtomic } from "../../../../storage/atomic-file"
import {
  FlashcardDeckSchema,
  ReviewRecordSchema,
  type FlashcardDeck,
  type ReviewRecord,
} from "../types"
import { writeFlashcardDeckObjectState } from "./save-deck"

const FLASHCARD_PENDING_REVIEW_FILE_NAME = "pending-review.json"

const FlashcardReviewTransactionSchema = z.object({
  deck: FlashcardDeckSchema,
  record: ReviewRecordSchema,
})

type FlashcardReviewTransaction = z.infer<typeof FlashcardReviewTransactionSchema>

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

function flashcardObjectReviewDirectory(directory: string, objectID: string): string {
  return BuddyObjectPath.objectFile(
    directory,
    BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    "state",
    "reviews",
  )
}

function pendingFlashcardObjectReviewFile(directory: string, objectID: string): string {
  return path.join(
    flashcardObjectReviewDirectory(directory, objectID),
    FLASHCARD_PENDING_REVIEW_FILE_NAME,
  )
}

function committedFlashcardObjectReviewFile(
  directory: string,
  objectID: string,
  reviewID: string,
): string {
  return path.join(flashcardObjectReviewDirectory(directory, objectID), `${reviewID}.json`)
}

async function writePendingFlashcardObjectReviewTransaction(input: {
  directory: string
  deck: FlashcardDeck
  record: ReviewRecord
}): Promise<FlashcardReviewTransaction> {
  const transaction = FlashcardReviewTransactionSchema.parse({
    deck: input.deck,
    record: input.record,
  })
  await writeJsonFileAtomic(
    pendingFlashcardObjectReviewFile(input.directory, input.deck.objectID),
    transaction,
  )
  return transaction
}

async function commitFlashcardObjectReviewTransaction(
  directory: string,
  transaction: FlashcardReviewTransaction,
): Promise<void> {
  const pendingFile = pendingFlashcardObjectReviewFile(directory, transaction.deck.objectID)
  const committedFile = committedFlashcardObjectReviewFile(
    directory,
    transaction.deck.objectID,
    transaction.record.reviewID,
  )

  await writeFlashcardDeckObjectState({ directory, deck: transaction.deck })
  await fs.mkdir(path.dirname(committedFile), { recursive: true })
  await writeJsonFileAtomic(committedFile, transaction.record)
  await fs.rm(pendingFile, { force: true })
}

async function recoverPendingFlashcardObjectReview(
  directory: string,
  objectID: string,
): Promise<void> {
  let transaction: FlashcardReviewTransaction
  try {
    transaction = await readJsonFile(
      pendingFlashcardObjectReviewFile(directory, objectID),
      FlashcardReviewTransactionSchema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return
    }
    throw error
  }
  await commitFlashcardObjectReviewTransaction(directory, transaction)
}

export {
  commitFlashcardObjectReviewTransaction,
  recoverPendingFlashcardObjectReview,
  writePendingFlashcardObjectReviewTransaction,
}
