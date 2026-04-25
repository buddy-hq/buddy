import fs from "node:fs/promises"
import { ulid } from "ulid"
import { FlashcardPath } from "./path"
import { listClozeOrdinals } from "./scheduler"
import {
  DECK_CONFIG_DEFAULTS,
  FlashcardDeckSchema,
  type FlashcardCard,
  type FlashcardDeck,
  type FlashcardNote,
} from "./types"
import { FlashcardValidationError } from "./errors"

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

type SaveFlashcardNoteInput = {
  type: "basic" | "cloze"
  fields: { front: string; back: string } | { text: string }
  tags?: string[]
  source?: string
}

function buildFlashcardNotesAndCards(
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
    cards.push(...generateFlashcardCardsForNote(note, config))
  }

  return { notes, cards }
}

async function writeFlashcardDeck(input: {
  directory: string
  deck: FlashcardDeck
}): Promise<void> {
  const deckPath = FlashcardPath.deckFile(input.directory, input.deck.deckID)
  await fs.mkdir(FlashcardPath.deckDirectory(input.directory, input.deck.deckID), {
    recursive: true,
  })
  await fs.writeFile(deckPath, JSON.stringify(input.deck, null, 2), "utf8")
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
