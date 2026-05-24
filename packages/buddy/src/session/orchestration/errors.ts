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

export function mapSessionTransformError(
  c: { json: (body: unknown, status?: number) => Response },
  error: unknown,
): Response | undefined {
  if (error instanceof SessionLookupError) {
    return error.response
  }

  if (error instanceof SessionTransformValidationError) {
    return c.json({ error: error.message }, error.status)
  }

  return undefined
}
