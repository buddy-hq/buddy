import { SessionLookupError, SessionTransformValidationError } from "./errors"

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
