export class SessionLookupError extends Error {
  constructor(readonly response: Response) {
    super("Session lookup failed")
    this.name = "SessionLookupError"
  }
}

export class SessionTransformValidationError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "SessionTransformValidationError"
    this.status = status
  }
}
