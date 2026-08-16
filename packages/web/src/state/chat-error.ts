import { z } from "zod"
import { isRecord, parseString } from "./chat-types"

const ABORT_ERROR_NAMES = new Set(["MessageAbortedError", "AbortError", "Cancelled"])
const ABORT_ERROR_MESSAGES = new Set(["aborted", "cancelled", "interrupted"])
const ABORT_ERROR_MESSAGE_KEYWORDS = ["abort", "cancel", "interrupt"] as const

const abortErrorRecordSchema = z.looseObject({
  name: z.string().optional(),
  message: z.string().optional(),
  data: z.looseObject({ message: z.string().optional() }).optional(),
})

function messageLooksLikeAbort(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (ABORT_ERROR_MESSAGES.has(normalized)) return true
  return ABORT_ERROR_MESSAGE_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

export function isAbortLikeError<TValue>(value: TValue): boolean {
  const asString = parseString(value)
  if (asString !== undefined) {
    return messageLooksLikeAbort(asString)
  }

  const parsed = abortErrorRecordSchema.safeParse(value)
  if (!parsed.success) return false

  const name = parsed.data.name ?? ""
  const message = parsed.data.message ?? ""
  const dataMessage = isRecord(parsed.data.data) ? (parseString(parsed.data.data.message) ?? "") : ""

  return (
    ABORT_ERROR_NAMES.has(name) ||
    messageLooksLikeAbort(message) ||
    messageLooksLikeAbort(dataMessage)
  )
}
