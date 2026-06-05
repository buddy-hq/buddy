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

class FlashcardDeckLoadError extends Error {
  constructor(deckID: string, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause)
    super(`Flashcard deck '${deckID}' could not be loaded: ${causeMessage}`)
    this.name = "FlashcardDeckLoadError"
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
  if (error instanceof FlashcardDeckLoadError) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (error instanceof FlashcardCardNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return undefined
}

export {
  FlashcardCardNotFoundError,
  FlashcardDeckLoadError,
  FlashcardDeckNotFoundError,
  FlashcardValidationError,
  mapFlashcardRouteError,
}
