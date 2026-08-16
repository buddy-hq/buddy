import { ulid } from "ulid"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  BuddyObjectPath,
  BuddyObjectValidationError,
  FlashcardDeckObjectSummarySchema,
  generateObjectID,
  writeObjectRecord,
  type BuddyObjectManifest,
} from "../../../../objects"
import { writeJsonFileAtomic } from "../../../../storage/atomic-file"
import { listClozeOrdinals } from "./scheduler"
import {
  DECK_CONFIG_DEFAULTS,
  FlashcardDeckSchema,
  type FlashcardCard,
  type FlashcardDeck,
  type FlashcardNote,
} from "../types"

function generateFlashcardCardsForNote(
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
      queue: "new",
      due: 0,
      interval: 0,
      easeFactor: config.initialEaseFactor,
      reps: 0,
      lapses: 0,
      remainingSteps: 0,
    })
  } else {
    const fields = note.fields
    const text = "text" in fields ? fields.text : ""
    const ordinals = listClozeOrdinals(text)
    if (ordinals.length === 0) {
      throw new BuddyObjectValidationError(
        `Cloze note '${note.noteID}' must contain at least one {{cN::...}} deletion.`,
      )
    }
    for (const ordinal of ordinals) {
      cards.push({
        cardID: ulid(),
        noteID: note.noteID,
        templateIdx: ordinal - 1,
        state: "new",
        queue: "new",
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

type SaveFlashcardNoteInput = {
  type: "basic" | "cloze"
  fields: { front: string; back: string } | { text: string }
  tags?: string[]
  source?: string
}

function buildFlashcardNotesAndCards(
  objectID: string,
  inputs: SaveFlashcardNoteInput[],
  config: typeof DECK_CONFIG_DEFAULTS,
) {
  const notes: FlashcardNote[] = []
  const cards: FlashcardCard[] = []

  for (const input of inputs) {
    const noteID = ulid()
    const note: FlashcardNote = {
      noteID,
      objectID,
      type: input.type,
      fields: input.fields,
      tags: input.tags ?? [],
      ...(input.source ? { source: input.source } : {}),
    }
    notes.push(note)
    cards.push(...generateFlashcardCardsForNote(note, config))
  }

  return { notes, cards }
}

const FLASHCARD_DECK_OBJECT_VIEW_ID = "review" as const
const FLASHCARD_DECK_OBJECT_PAYLOAD_FILE_NAME = "deck.json" as const

type SaveFlashcardDeckObjectResult = {
  objectID: string
  revisionID: string
  deck: FlashcardDeck
  manifest: BuddyObjectManifest & {
    summary: ReturnType<typeof FlashcardDeckObjectSummarySchema.parse>
  }
}

function flashcardDeckObjectRevisionPath(revisionID: string): string {
  return `revisions/${revisionID}/${FLASHCARD_DECK_OBJECT_PAYLOAD_FILE_NAME}`
}

function flashcardDeckObjectStatePath(): string {
  return `state/${FLASHCARD_DECK_OBJECT_PAYLOAD_FILE_NAME}`
}

function buildFlashcardDeckObjectViews(): BuddyObjectManifest["views"] {
  return [
    {
      viewID: FLASHCARD_DECK_OBJECT_VIEW_ID,
      label: "Flashcards",
      surfaces: ["inline", "bench", "library"],
      availability: { status: "available" },
      inline: {
        renderer: "flashcard-deck",
        params: {
          renderer: "flashcard-deck",
          noteCount: 0,
        },
      },
      bench: { resolver: "object-view" },
      library: { section: "flashcards" },
    },
  ]
}

async function saveFlashcardDeckObject(input: {
  directory: string
  deck: FlashcardDeck
}): Promise<SaveFlashcardDeckObjectResult> {
  const parsed = FlashcardDeckSchema.parse(input.deck)
  const objectID = parsed.objectID
  const revisionID = generateObjectID()
  const now = new Date().toISOString()
  const manifest = BuddyObjectManifestSchema.safeExtend({
    summary: FlashcardDeckObjectSummarySchema,
  }).parse({
    version: 1,
    kind: BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    title: parsed.title,
    status: "ready",
    lifecycle: "revisioned",
    currentRevisionID: revisionID,
    origin: parsed.createdBy,
    createdAt: parsed.createdAt,
    updatedAt: now,
    sourceRefs: [],
    views: buildFlashcardDeckObjectViews(),
    summary: {
      kind: BUDDY_OBJECT_KINDS.flashcardDeck,
      noteCount: parsed.notes.length,
      cardCount: parsed.cards.length,
    },
  })
  await writeObjectRecord({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.flashcardDeck,
    objectID,
    manifest,
    files: [
      {
        relativePath: flashcardDeckObjectRevisionPath(revisionID),
        format: "json",
        content: parsed,
      },
      {
        relativePath: flashcardDeckObjectStatePath(),
        format: "json",
        content: parsed,
      },
    ],
  })
  return {
    objectID,
    revisionID,
    deck: parsed,
    manifest,
  }
}

async function writeFlashcardDeckObjectState(input: {
  directory: string
  deck: FlashcardDeck
}): Promise<void> {
  const parsed = FlashcardDeckSchema.parse(input.deck)
  await writeJsonFileAtomic(
    BuddyObjectPath.objectFile(
      input.directory,
      BUDDY_OBJECT_KINDS.flashcardDeck,
      parsed.objectID,
      flashcardDeckObjectStatePath(),
    ),
    parsed,
  )
}

export {
  buildFlashcardNotesAndCards,
  FLASHCARD_DECK_OBJECT_VIEW_ID,
  flashcardDeckObjectRevisionPath,
  flashcardDeckObjectStatePath,
  generateFlashcardCardsForNote,
  saveFlashcardDeckObject,
  writeFlashcardDeckObjectState,
}
