import path from "node:path"

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u

class InvalidFlashcardDeckIDError extends Error {
  constructor(deckID: string) {
    super(`Invalid flashcard deck id '${deckID}'.`)
    this.name = "InvalidFlashcardDeckIDError"
  }
}

function root(directory: string): string {
  return path.join(directory, ".buddy", "flashcard-decks")
}

function sanitizeDeckID(deckID: string): string {
  if (!ULID_PATTERN.test(deckID)) {
    throw new InvalidFlashcardDeckIDError(deckID)
  }
  return deckID
}

function deckDirectory(directory: string, deckID: string): string {
  return path.join(root(directory), sanitizeDeckID(deckID))
}

function deckFile(directory: string, deckID: string): string {
  return path.join(deckDirectory(directory, deckID), "deck.json")
}

function reviewsDirectory(directory: string, deckID: string): string {
  return path.join(deckDirectory(directory, deckID), "reviews")
}

/** JSONL file for a given day, e.g. `reviews/2025-04-19.jsonl`. */
function reviewFile(directory: string, deckID: string, dateISO: string): string {
  return path.join(reviewsDirectory(directory, deckID), `${dateISO}.jsonl`)
}

const FlashcardPath = {
  root,
  sanitizeDeckID,
  deckDirectory,
  deckFile,
  reviewsDirectory,
  reviewFile,
}

export { FlashcardPath, InvalidFlashcardDeckIDError }
