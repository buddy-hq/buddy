import { ulid } from "ulid"
import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ARTIFACT_MANIFEST_VERSION,
  ArtifactValidationError,
  writeArtifactRecord,
} from "../../../../artifacts"
import { listClozeOrdinals } from "./scheduler"
import {
  DECK_CONFIG_DEFAULTS,
  FlashcardDeckManifestSchema,
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
      throw new ArtifactValidationError(
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

type SaveFlashcardNoteInput = {
  type: "basic" | "cloze"
  fields: { front: string; back: string } | { text: string }
  tags?: string[]
  source?: string
}

function buildFlashcardNotesAndCards(
  artifactID: string,
  inputs: SaveFlashcardNoteInput[],
  config: typeof DECK_CONFIG_DEFAULTS,
): { notes: FlashcardNote[]; cards: FlashcardCard[] } {
  const notes: FlashcardNote[] = []
  const cards: FlashcardCard[] = []

  for (const input of inputs) {
    const noteID = ulid()
    const note: FlashcardNote = {
      noteID,
      artifactID,
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

async function writeFlashcardDeck(input: {
  directory: string
  deck: FlashcardDeck
}): Promise<void> {
  const manifest = FlashcardDeckManifestSchema.parse({
    version: ARTIFACT_MANIFEST_VERSION,
    artifactID: input.deck.artifactID,
    kind: ARTIFACT_KINDS.flashcardDeck,
    title: input.deck.title,
    origin: input.deck.createdBy,
    createdAt: input.deck.createdAt,
    updatedAt: new Date().toISOString(),
    summary: {
      noteCount: input.deck.notes.length,
      cardCount: input.deck.cards.length,
      ...(input.deck.source ? { source: input.deck.source } : {}),
    },
  })
  await writeArtifactRecord({
    directory: input.directory,
    kind: ARTIFACT_KINDS.flashcardDeck,
    artifactID: input.deck.artifactID,
    manifest,
    files: [
      {
        relativePath: ARTIFACT_CONTENT_FILES.flashcardDeck,
        format: "json",
        content: input.deck,
      },
    ],
  })
}

async function saveFlashcardDeck(input: {
  directory: string
  deck: FlashcardDeck
}): Promise<FlashcardDeck> {
  const parsed = FlashcardDeckSchema.parse(input.deck)
  await writeFlashcardDeck({ directory: input.directory, deck: parsed })
  return parsed
}

export {
  buildFlashcardNotesAndCards,
  generateFlashcardCardsForNote,
  saveFlashcardDeck,
  writeFlashcardDeck,
}
