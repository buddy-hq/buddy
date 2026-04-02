const ABORT_ERROR_NAMES = new Set(["MessageAbortedError", "AbortError", "Cancelled"])
const ABORT_ERROR_MESSAGES = new Set(["aborted", "cancelled", "interrupted"])
const ABORT_ERROR_MESSAGE_KEYWORDS = ["abort", "cancel", "interrupt"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function messageLooksLikeAbort(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (ABORT_ERROR_MESSAGES.has(normalized)) return true
  return ABORT_ERROR_MESSAGE_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

export function isAbortLikeError(value: unknown): boolean {
  if (typeof value === "string") {
    return messageLooksLikeAbort(value)
  }

  if (!isRecord(value)) return false

  const name = typeof value.name === "string" ? value.name : ""
  const message = typeof value.message === "string" ? value.message : ""
  const data = "data" in value && isRecord(value.data) ? value.data : undefined
  const dataMessage = typeof data?.message === "string" ? data.message : ""

  return (
    ABORT_ERROR_NAMES.has(name) ||
    messageLooksLikeAbort(message) ||
    messageLooksLikeAbort(dataMessage)
  )
}
