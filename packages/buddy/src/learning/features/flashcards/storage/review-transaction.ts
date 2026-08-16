import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import {
  createIdempotencyKeyDigest,
  createIdempotencyRequestHash,
  createIdempotentEventID,
  IdempotencyRequestHashSchema,
} from "../../../../http/idempotency"
import { BUDDY_OBJECT_KINDS, BuddyObjectIDSchema, BuddyObjectPath } from "../../../../objects"
import { writeJsonFileAtomic } from "../../../../storage/atomic-file"
import {
  CardRatingSchema,
  CardStateSchema,
  FlashcardDeckSchema,
  ReviewRecordSchema,
  SubmitReviewOutputSchema,
  type FlashcardDeck,
  type FlashcardQueueLease,
  type ReviewRecord,
  type SubmitReviewOutput,
} from "../types"
import { writeFlashcardDeckObjectState } from "./save-deck"

const FLASHCARD_PENDING_REVIEW_FILE_NAME = "pending-review.json"
const FLASHCARD_REVIEW_IDEMPOTENCY_DIRECTORY_NAME = "idempotency"
const FLASHCARD_REVIEW_PENDING_INGESTION_DIRECTORY_NAME = "pending-ingestion"
const FLASHCARD_REVIEW_EVENT_NAMESPACE = "flashcard_review"

const FlashcardReviewIngestionSchema = z.object({
  completed: z.boolean(),
  eventID: z.string().min(1),
  eventCreatedAt: z.string().datetime(),
  objectID: BuddyObjectIDSchema,
  cardID: BuddyObjectIDSchema,
  deckTitle: z.string().min(1),
  tags: z.array(z.string().min(1)),
  rating: CardRatingSchema,
  previousState: CardStateSchema,
  newState: CardStateSchema,
  isLeech: z.boolean(),
  nextDue: z.number().int().nonnegative(),
})

const CommittedFlashcardReviewSchema = z.object({
  submissionID: z.string().uuid(),
  requestHash: IdempotencyRequestHashSchema,
  output: SubmitReviewOutputSchema,
  ingestion: FlashcardReviewIngestionSchema,
})

const FlashcardReviewTransactionSchema = z.object({
  deck: FlashcardDeckSchema,
  record: ReviewRecordSchema,
  committed: CommittedFlashcardReviewSchema,
})

type CommittedFlashcardReview = z.infer<typeof CommittedFlashcardReviewSchema>
type FlashcardReviewTransaction = z.infer<typeof FlashcardReviewTransactionSchema>

function isNodeErrorCode<TError>(error: TError, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

async function readJsonFile<T>(filePath: string, schema: z.ZodSchema<T>): Promise<T> {
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"))
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

function flashcardReviewIdempotencyDirectory(directory: string, objectID: string): string {
  return path.join(
    flashcardObjectReviewDirectory(directory, objectID),
    FLASHCARD_REVIEW_IDEMPOTENCY_DIRECTORY_NAME,
  )
}

function flashcardReviewIdempotencyFile(
  directory: string,
  objectID: string,
  submissionID: string,
): string {
  return path.join(
    flashcardReviewIdempotencyDirectory(directory, objectID),
    `${createIdempotencyKeyDigest(submissionID)}.json`,
  )
}

function flashcardReviewPendingIngestionDirectory(directory: string, objectID: string): string {
  return path.join(
    flashcardObjectReviewDirectory(directory, objectID),
    FLASHCARD_REVIEW_PENDING_INGESTION_DIRECTORY_NAME,
  )
}

function flashcardReviewPendingIngestionFile(
  directory: string,
  objectID: string,
  submissionID: string,
): string {
  return path.join(
    flashcardReviewPendingIngestionDirectory(directory, objectID),
    `${createIdempotencyKeyDigest(submissionID)}.json`,
  )
}

function flashcardReviewRequestHash(input: {
  cardID: string
  queueLease: FlashcardQueueLease
  rating: string
  timeTakenMs: number
}): string {
  return createIdempotencyRequestHash({
    cardID: input.cardID,
    queueLease: input.queueLease,
    rating: input.rating,
    timeTakenMs: input.timeTakenMs,
  })
}

async function readCommittedFlashcardObjectReview(
  directory: string,
  objectID: string,
  submissionID: string,
): Promise<CommittedFlashcardReview | undefined> {
  try {
    return await readJsonFile(
      flashcardReviewIdempotencyFile(directory, objectID, submissionID),
      CommittedFlashcardReviewSchema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return undefined
    throw error
  }
}

async function listPendingFlashcardReviewIngestions(
  directory: string,
  objectID: string,
): Promise<CommittedFlashcardReview[]> {
  const pendingIngestionDirectory = flashcardReviewPendingIngestionDirectory(directory, objectID)
  const entries = await fs
    .readdir(pendingIngestionDirectory, { withFileTypes: true })
    .catch((error) => {
      if (isNodeErrorCode(error, "ENOENT")) return []
      throw error
    })
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        readJsonFile(
          path.join(pendingIngestionDirectory, entry.name),
          CommittedFlashcardReviewSchema,
        ),
      ),
  )
  return records.filter((record) => !record.ingestion.completed)
}

async function writePendingFlashcardObjectReviewTransaction(input: {
  directory: string
  deck: FlashcardDeck
  record: ReviewRecord
  queueLease: FlashcardQueueLease
  submissionID: string
  output: SubmitReviewOutput
}): Promise<FlashcardReviewTransaction> {
  const card = input.deck.cards.find((candidate) => candidate.cardID === input.record.cardID)
  if (!card) {
    throw new Error(`Cannot persist review ingestion for missing card '${input.record.cardID}'.`)
  }
  const note = input.deck.notes.find((candidate) => candidate.noteID === card.noteID)
  const committed = CommittedFlashcardReviewSchema.parse({
    submissionID: input.submissionID,
    requestHash: flashcardReviewRequestHash({
      cardID: input.record.cardID,
      queueLease: input.queueLease,
      rating: input.record.rating,
      timeTakenMs: input.record.timeTakenMs,
    }),
    output: input.output,
    ingestion: {
      completed: false,
      eventID: createIdempotentEventID({
        namespace: FLASHCARD_REVIEW_EVENT_NAMESPACE,
        objectID: input.deck.objectID,
        submissionID: input.submissionID,
      }),
      eventCreatedAt: new Date(input.record.answeredAt).toISOString(),
      objectID: input.deck.objectID,
      cardID: input.record.cardID,
      deckTitle: input.deck.title,
      tags: note?.tags ?? [],
      rating: input.record.rating,
      previousState: input.record.previousState,
      newState: input.record.newState,
      isLeech: input.output.isLeech,
      nextDue: input.output.nextDue,
    },
  })
  const transaction = FlashcardReviewTransactionSchema.parse({
    deck: input.deck,
    record: input.record,
    committed,
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
  await writeJsonFileAtomic(
    flashcardReviewIdempotencyFile(
      directory,
      transaction.deck.objectID,
      transaction.committed.submissionID,
    ),
    transaction.committed,
  )
  await writeJsonFileAtomic(
    flashcardReviewPendingIngestionFile(
      directory,
      transaction.deck.objectID,
      transaction.committed.submissionID,
    ),
    transaction.committed,
  )
  await fs.rm(pendingFile, { force: true })
}

async function markFlashcardReviewIngestionCompleted(input: {
  directory: string
  record: CommittedFlashcardReview
}): Promise<void> {
  const completed = CommittedFlashcardReviewSchema.parse({
    ...input.record,
    ingestion: { ...input.record.ingestion, completed: true },
  })
  await writeJsonFileAtomic(
    flashcardReviewIdempotencyFile(
      input.directory,
      completed.ingestion.objectID,
      completed.submissionID,
    ),
    completed,
  )
  await fs.rm(
    flashcardReviewPendingIngestionFile(
      input.directory,
      completed.ingestion.objectID,
      completed.submissionID,
    ),
    { force: true },
  )
}

async function recoverPendingFlashcardObjectReview(
  directory: string,
  objectID: string,
): Promise<CommittedFlashcardReview | undefined> {
  let transaction: FlashcardReviewTransaction
  try {
    transaction = await readJsonFile(
      pendingFlashcardObjectReviewFile(directory, objectID),
      FlashcardReviewTransactionSchema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return
    throw error
  }
  await commitFlashcardObjectReviewTransaction(directory, transaction)
  return transaction.committed
}

async function writeRecoveredFlashcardReviewAlias(input: {
  directory: string
  objectID: string
  submissionID: string
  recovered: CommittedFlashcardReview
}): Promise<SubmitReviewOutput> {
  const latest =
    (await readCommittedFlashcardObjectReview(
      input.directory,
      input.objectID,
      input.recovered.submissionID,
    )) ?? input.recovered
  const alias = CommittedFlashcardReviewSchema.parse({
    ...latest,
    submissionID: input.submissionID,
  })
  await writeJsonFileAtomic(
    flashcardReviewIdempotencyFile(input.directory, input.objectID, input.submissionID),
    alias,
  )
  return alias.output
}

export {
  commitFlashcardObjectReviewTransaction,
  flashcardReviewRequestHash,
  listPendingFlashcardReviewIngestions,
  markFlashcardReviewIngestionCompleted,
  readCommittedFlashcardObjectReview,
  recoverPendingFlashcardObjectReview,
  writeRecoveredFlashcardReviewAlias,
  writePendingFlashcardObjectReviewTransaction,
}

export type { CommittedFlashcardReview }
