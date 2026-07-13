export const IDEMPOTENCY_KEY_PARAMETER = "idempotency-key" as const

export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}
