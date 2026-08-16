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

class WhiteboardStaleWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhiteboardStaleWriteError"
  }
}

class WhiteboardStaleLearnerEditError extends Error {
  constructor() {
    super("The whiteboard changed before this learner edit saved. Reload the latest board.")
    this.name = "WhiteboardStaleLearnerEditError"
  }
}

function mapWhiteboardRouteError<TError>(error: TError): Response | undefined {
  if (error instanceof WhiteboardPayloadTooLargeError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof WhiteboardElementValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof WhiteboardShareUploadError) {
    return Response.json({ error: error.message }, { status: 502 })
  }
  if (error instanceof WhiteboardStaleWriteError) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof WhiteboardStaleLearnerEditError) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  return undefined
}

export {
  WhiteboardElementValidationError,
  WhiteboardPayloadTooLargeError,
  WhiteboardShareUploadError,
  WhiteboardStaleLearnerEditError,
  WhiteboardStaleWriteError,
  mapWhiteboardRouteError,
}
