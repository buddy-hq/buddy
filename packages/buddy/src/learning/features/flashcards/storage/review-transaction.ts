import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import {
  ARTIFACT_CONTENT_DIRECTORIES,
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ArtifactPath,
  isNodeErrorCode,
  readJsonFile,
} from "../../../../artifacts"
import { writeJsonFileAtomic } from "../../../../storage/atomic-file"
import {
  FlashcardDeckSchema,
  ReviewRecordSchema,
  type FlashcardDeck,
  type ReviewRecord,
} from "../types"
import { writeFlashcardDeck } from "./save-deck"

const FlashcardReviewTransactionSchema = z.object({
  deck: FlashcardDeckSchema,
  record: ReviewRecordSchema,
})

type FlashcardReviewTransaction = z.infer<typeof FlashcardReviewTransactionSchema>

function flashcardReviewDirectory(directory: string, artifactID: string): string {
  return ArtifactPath.artifactFile(
    directory,
    ARTIFACT_KINDS.flashcardDeck,
    artifactID,
    ARTIFACT_CONTENT_DIRECTORIES.flashcardReviews,
  )
}

function pendingFlashcardReviewFile(directory: string, artifactID: string): string {
  return path.join(
    flashcardReviewDirectory(directory, artifactID),
    ARTIFACT_CONTENT_FILES.flashcardPendingReview,
  )
}

function committedFlashcardReviewFile(
  directory: string,
  artifactID: string,
  reviewID: string,
): string {
  return path.join(flashcardReviewDirectory(directory, artifactID), `${reviewID}.json`)
}

async function writePendingFlashcardReviewTransaction(input: {
  directory: string
  deck: FlashcardDeck
  record: ReviewRecord
}): Promise<FlashcardReviewTransaction> {
  const transaction = FlashcardReviewTransactionSchema.parse({
    deck: input.deck,
    record: input.record,
  })
  await writeJsonFileAtomic(
    pendingFlashcardReviewFile(input.directory, input.deck.artifactID),
    transaction,
  )
  return transaction
}

async function commitFlashcardReviewTransaction(
  directory: string,
  transaction: FlashcardReviewTransaction,
): Promise<void> {
  const pendingFile = pendingFlashcardReviewFile(directory, transaction.deck.artifactID)
  const committedFile = committedFlashcardReviewFile(
    directory,
    transaction.deck.artifactID,
    transaction.record.reviewID,
  )

  await writeFlashcardDeck({ directory, deck: transaction.deck })
  await fs.mkdir(path.dirname(committedFile), { recursive: true })
  await writeJsonFileAtomic(committedFile, transaction.record)
  await fs.rm(pendingFile, { force: true })
}

async function recoverPendingFlashcardReview(
  directory: string,
  artifactID: string,
): Promise<void> {
  let transaction: FlashcardReviewTransaction
  try {
    transaction = await readJsonFile(
      pendingFlashcardReviewFile(directory, artifactID),
      FlashcardReviewTransactionSchema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return
    }
    throw error
  }
  await commitFlashcardReviewTransaction(directory, transaction)
}

export {
  commitFlashcardReviewTransaction,
  recoverPendingFlashcardReview,
  writePendingFlashcardReviewTransaction,
}
