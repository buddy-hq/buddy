import { InvalidFlashcardDeckIDError } from "./storage/path"

class FlashcardDeckNotFoundError extends Error {
  constructor(deckID: string) {
    super(`Flashcard deck '${deckID}' was not found.`)
    this.name = "FlashcardDeckNotFoundError"
  }
}

class FlashcardValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FlashcardValidationError"
  }
}

class FlashcardCardNotFoundError extends Error {
  constructor(cardID: string) {
    super(`Flashcard card '${cardID}' was not found.`)
    this.name = "FlashcardCardNotFoundError"
  }
}

function mapFlashcardRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidFlashcardDeckIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof FlashcardDeckNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof FlashcardValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof FlashcardCardNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return undefined
}

export {
  FlashcardCardNotFoundError,
  FlashcardDeckNotFoundError,
  FlashcardValidationError,
  mapFlashcardRouteError,
}
