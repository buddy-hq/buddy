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

type TSessionErrorJsonBody = {
  error: string
}

type TSessionErrorJsonContext = {
  json: (body: TSessionErrorJsonBody, status?: number) => Response
}

export function mapSessionTransformError(
  c: TSessionErrorJsonContext,
  cause: unknown,
): Response | undefined {
  if (cause instanceof SessionLookupError) {
    return cause.response
  }

  if (cause instanceof SessionTransformValidationError) {
    return c.json({ error: cause.message }, cause.status)
  }

  return undefined
}
