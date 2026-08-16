import type { BuddyObjectKind } from "./kinds"

class BuddyObjectValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BuddyObjectValidationError"
  }
}

class BuddyObjectNotFoundError extends Error {
  constructor(objectID: string) {
    super(`Buddy object '${objectID}' was not found.`)
    this.name = "BuddyObjectNotFoundError"
  }
}

class BuddyObjectUnavailableError extends Error {
  constructor(objectID: string) {
    super(`Buddy object '${objectID}' is unavailable.`)
    this.name = "BuddyObjectUnavailableError"
  }
}

class BuddyObjectLoadException extends Error {
  constructor(kind: BuddyObjectKind | null, objectID: string | null, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause)
    const label = kind && objectID ? `${kind}/${objectID}` : (objectID ?? "unknown")
    super(`Buddy object '${label}' could not be loaded: ${causeMessage}`)
    this.name = "BuddyObjectLoadException"
  }
}

class BuddyObjectDuplicateIDError extends Error {
  constructor(objectID: string) {
    super(`Buddy object id '${objectID}' is claimed by multiple live manifests.`)
    this.name = "BuddyObjectDuplicateIDError"
  }
}

function mapBuddyObjectRouteError<TError>(error: TError): Response | undefined {
  if (error instanceof BuddyObjectValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof BuddyObjectNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof BuddyObjectUnavailableError) {
    return Response.json({ error: error.message }, { status: 410 })
  }
  if (error instanceof BuddyObjectDuplicateIDError || error instanceof BuddyObjectLoadException) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  return undefined
}

export {
  BuddyObjectDuplicateIDError,
  BuddyObjectLoadException,
  BuddyObjectNotFoundError,
  BuddyObjectUnavailableError,
  BuddyObjectValidationError,
  mapBuddyObjectRouteError,
}
