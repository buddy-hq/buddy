import { LEARNER_MEMORY_REDACTION_TUNING } from "./tuning"

const REDACTED_SECRET = LEARNER_MEMORY_REDACTION_TUNING.redactedSecretText

const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bBearer\s+[A-Za-z0-9._-]{16,}\b/giu,
  /\b(?:api[_-]?key|secret|token|password|credential)\s*[:=]\s*["']?[^"'\s]{8,}/giu,
]

function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, REDACTED_SECRET),
    value,
  )
}

export { redactSecrets }
