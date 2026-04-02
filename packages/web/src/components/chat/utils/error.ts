import { isRecord } from "../tools/types"
import { isAbortLikeError } from "@/state/chat-error"
import { normalizeUpstreamProviderErrorMessage } from "@/lib/upstream-provider-error"

function parseJsonValue(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

export function unwrapError(message: string): string {
  const text = message.replace(/^Error:\s*/, "").trim()

  const read = (value: string) => {
    const first = parseJsonValue(value)
    if (typeof first !== "string") return first
    return parseJsonValue(first.trim())
  }

  let json = read(text)
  if (json === undefined) {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) {
      json = read(text.slice(start, end + 1))
    }
  }

  if (!isRecord(json)) return normalizeUpstreamProviderErrorMessage(message)

  const error = isRecord(json.error) ? json.error : undefined
  if (error) {
    const type = typeof error.type === "string" ? error.type : undefined
    const innerMessage = typeof error.message === "string" ? error.message : undefined
    if (type && innerMessage)
      return normalizeUpstreamProviderErrorMessage(`${type}: ${innerMessage}`)
    if (innerMessage) return normalizeUpstreamProviderErrorMessage(innerMessage)
    if (type) return normalizeUpstreamProviderErrorMessage(type)
    const code = typeof error.code === "string" ? error.code : undefined
    if (code) return normalizeUpstreamProviderErrorMessage(code)
  }

  const fallbackMessage = typeof json.message === "string" ? json.message : undefined
  if (fallbackMessage) return normalizeUpstreamProviderErrorMessage(fallbackMessage)

  const fallbackError = typeof json.error === "string" ? json.error : undefined
  if (fallbackError) return normalizeUpstreamProviderErrorMessage(fallbackError)

  return normalizeUpstreamProviderErrorMessage(message)
}

export function isMessageAbortError(value: unknown): boolean {
  return isAbortLikeError(value)
}

export function formatMessageError(value: unknown): string {
  if (!isRecord(value)) return ""

  const data = isRecord(value.data) ? value.data : undefined
  const message =
    readNonEmptyString(value.message) ??
    (data ? readNonEmptyString(data.message) : undefined) ??
    readNonEmptyString(value.name)

  return message ? unwrapError(message) : ""
}

import { readNonEmptyString } from "../tools/types"
