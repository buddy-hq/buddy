import { createHash } from "node:crypto"
import z from "zod"

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key" as const
const IDEMPOTENCY_REQUEST_HASH_LENGTH = 64

export const IdempotencyRequestHashSchema = z.string().length(IDEMPOTENCY_REQUEST_HASH_LENGTH)

export class IdempotencyPayloadConflictError extends Error {
  constructor() {
    super("This idempotency key was already used with a different request payload.")
    this.name = "IdempotencyPayloadConflictError"
  }
}

export const idempotencyHeaderSchema = z.object({
  [IDEMPOTENCY_KEY_HEADER]: z.string().uuid(),
})

export function createIdempotencyRequestHash<TPayload>(payload: TPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

export function createIdempotencyKeyDigest(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export function assertIdempotencyRequestHash(expected: string, actual: string): void {
  if (expected !== actual) {
    throw new IdempotencyPayloadConflictError()
  }
}

export function createIdempotentEventID(input: {
  namespace: string
  objectID: string
  submissionID: string
}): string {
  const digest = createHash("sha256")
    .update(`${input.namespace}\u0000${input.objectID}\u0000${input.submissionID}`)
    .digest("hex")
  return `evt_${input.namespace}_${digest}`
}

export function mapIdempotencyRouteError<TError>(error: TError): Response | undefined {
  if (error instanceof IdempotencyPayloadConflictError) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  return undefined
}
