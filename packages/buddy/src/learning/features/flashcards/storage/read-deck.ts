import fs from "node:fs/promises"
import path from "node:path"
import {
  ARTIFACT_CONTENT_DIRECTORIES,
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ArtifactLoadError,
  ArtifactPath,
  type ArtifactLoadErrorRecord,
  isNodeErrorCode,
  listArtifactManifests,
  readArtifactJsonFile,
  readJsonFile,
} from "../../../../artifacts"
import { computeDueCounts, selectNextDueCard } from "./scheduler"
import {
  DeckConfigSchema,
  FLASHCARD_DECK_KIND,
  FlashcardDeckManifestSchema,
  FlashcardDeckSchema,
  ReviewRecordSchema,
  type DueCounts,
  type FlashcardDeck,
  type FlashcardDeckManifest,
  type ReviewRecord,
} from "../types"

type FlashcardDeckIndexItem = {
  artifactID: string
  kind: typeof FLASHCARD_DECK_KIND
  title: string
  noteCount: number
  cardCount: number
  dueCounts: DueCounts
  reviewAvailable: boolean
  createdAt: string
  createdBy: FlashcardDeck["createdBy"]
}

type FlashcardDeckIndexLoadError = {
  artifactID: string
  message: string
}

type FlashcardDeckIndexListResult = {
  items: FlashcardDeckIndexItem[]
  loadErrors: FlashcardDeckIndexLoadError[]
}

type FlashcardDeckSummaryListResult = {
  artifacts: FlashcardDeckManifest[]
  loadErrors: ArtifactLoadErrorRecord[]
}

type FlashcardDeckIndexEntryResult =
  | {
      item: FlashcardDeckIndexItem
      loadError?: never
    }
  | {
      item?: never
      loadError: FlashcardDeckIndexLoadError
    }

type ReviewedTodayCounts = {
  newCount: number
  reviewCount: number
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

async function readTodayReviewRecords(
  directory: string,
  artifactID: string,
): Promise<ReviewRecord[]> {
  const safeArtifactID = ArtifactPath.sanitizeArtifactID(artifactID)
  const reviewDirectory = ArtifactPath.artifactFile(
    directory,
    ARTIFACT_KINDS.flashcardDeck,
    safeArtifactID,
    ARTIFACT_CONTENT_DIRECTORIES.flashcardReviews,
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
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          entry.name !== ARTIFACT_CONTENT_FILES.flashcardPendingReview,
      )
      .map((entry) => readJsonFile(path.join(reviewDirectory, entry.name), ReviewRecordSchema)),
  )
  const today = todayISO()
  return records.filter((record) => todayISO(record.answeredAt) === today)
}

async function readFlashcardReviewedTodayCounts(
  directory: string,
  artifactID: string,
): Promise<ReviewedTodayCounts> {
  return countReviewedToday(await readTodayReviewRecords(directory, artifactID))
}

async function readFlashcardDeck(directory: string, artifactID: string): Promise<FlashcardDeck> {
  const safeArtifactID = ArtifactPath.sanitizeArtifactID(artifactID)
  return readArtifactJsonFile({
    directory,
    kind: ARTIFACT_KINDS.flashcardDeck,
    artifactID: safeArtifactID,
    relativePath: ARTIFACT_CONTENT_FILES.flashcardDeck,
    schema: FlashcardDeckSchema,
  })
}

async function listFlashcardDeckIndexItems(
  directory: string,
): Promise<FlashcardDeckIndexListResult> {
  const summaryResult = await listFlashcardDeckSummaries(directory)
  const artifactIDs = summaryResult.artifacts.map((artifact) => artifact.artifactID)

  const now = Date.now()
  const results = await Promise.all(
    artifactIDs.map(async (artifactID): Promise<FlashcardDeckIndexEntryResult> => {
      try {
        const deck = await readFlashcardDeck(directory, artifactID)
        const config = DeckConfigSchema.parse(deck.config)
        const reviewedToday = countReviewedToday(
          await readTodayReviewRecords(directory, deck.artifactID),
        )
        return {
          item: {
            artifactID: deck.artifactID,
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
          },
        }
      } catch (error) {
        return {
          loadError: {
            artifactID,
            message: new ArtifactLoadError(ARTIFACT_KINDS.flashcardDeck, artifactID, error).message,
          },
        }
      }
    }),
  )

  const items: FlashcardDeckIndexItem[] = []
  const loadErrors: FlashcardDeckIndexLoadError[] = summaryResult.loadErrors.map((loadError) => ({
    artifactID: loadError.artifactID,
    message: loadError.message,
  }))
  for (const result of results) {
    if (result.loadError) {
      loadErrors.push(result.loadError)
    } else {
      items.push(result.item)
    }
  }

  return {
    items: items.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt)),
    loadErrors: loadErrors.toSorted((left, right) =>
      left.artifactID.localeCompare(right.artifactID),
    ),
  }
}

async function listFlashcardDeckSummaries(
  directory: string,
): Promise<FlashcardDeckSummaryListResult> {
  const result = await listArtifactManifests({
    directory,
    kind: ARTIFACT_KINDS.flashcardDeck,
    schema: FlashcardDeckManifestSchema,
  })
  return {
    artifacts: result.items,
    loadErrors: result.loadErrors,
  }
}

export {
  listFlashcardDeckIndexItems,
  listFlashcardDeckSummaries,
  readFlashcardDeck,
  readFlashcardReviewedTodayCounts,
  todayISO,
}

export type {
  FlashcardDeckIndexItem,
  FlashcardDeckIndexListResult,
  FlashcardDeckIndexLoadError,
  FlashcardDeckSummaryListResult,
}
