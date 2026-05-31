import { InvalidWhiteboardSessionIDError } from "./service/path"

class WhiteboardSceneNotFoundError extends Error {
  constructor(sceneID: string) {
    super(`Whiteboard scene '${sceneID}' was not found.`)
    this.name = "WhiteboardSceneNotFoundError"
  }
}

class WhiteboardRevisionNotFoundError extends Error {
  constructor(revisionID: string) {
    super(`Whiteboard revision '${revisionID}' was not found.`)
    this.name = "WhiteboardRevisionNotFoundError"
  }
}

class WhiteboardRevisionConflictError extends Error {
  constructor() {
    super("The whiteboard changed before this learner edit was saved. Reload the latest revision.")
    this.name = "WhiteboardRevisionConflictError"
  }
}

class WhiteboardPayloadTooLargeError extends Error {
  constructor(label: string, maxBytes: number) {
    super(`${label} exceeds ${maxBytes} bytes.`)
    this.name = "WhiteboardPayloadTooLargeError"
  }
}

class WhiteboardElementValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhiteboardElementValidationError"
  }
}

class WhiteboardShareUploadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "WhiteboardShareUploadError"
  }
}

function mapWhiteboardRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidWhiteboardSessionIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof WhiteboardPayloadTooLargeError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof WhiteboardElementValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (
    error instanceof WhiteboardSceneNotFoundError ||
    error instanceof WhiteboardRevisionNotFoundError
  ) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof WhiteboardRevisionConflictError) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof WhiteboardShareUploadError) {
    return Response.json({ error: error.message }, { status: 502 })
  }
  return undefined
}

export {
  WhiteboardElementValidationError,
  WhiteboardPayloadTooLargeError,
  WhiteboardRevisionConflictError,
  WhiteboardRevisionNotFoundError,
  WhiteboardSceneNotFoundError,
  WhiteboardShareUploadError,
  mapWhiteboardRouteError,
}
