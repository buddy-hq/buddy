import { isAbortLikeError } from "@/state/chat-error"
import {
  normalizeProviderErrorDetails,
  normalizeUpstreamProviderErrorMessage,
} from "@/lib/upstream-provider-error"

import {
  parseTJsonObject,
  parseTJsonText,
  parseTString,
  readNonEmptyString,
} from "../tools/types"

function unwrapJsonPayload(value: string) {
  const first = parseTJsonText(value)
  const nestedText = parseTString(first)
  if (nestedText === undefined) return first
  return parseTJsonText(nestedText.trim())
}

export function unwrapError(message: string): string {
  const text = message.replace(/^Error:\s*/, "").trim()

  let json = unwrapJsonPayload(text)
  if (json === undefined) {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) {
      json = unwrapJsonPayload(text.slice(start, end + 1))
    }
  }

  const record = parseTJsonObject(json)
  if (!record) return normalizeUpstreamProviderErrorMessage(message)

  const error = parseTJsonObject(record.error)
  if (error) {
    const type = parseTString(error.type)
    const innerMessage = parseTString(error.message)
    if (type && innerMessage)
      return normalizeUpstreamProviderErrorMessage(`${type}: ${innerMessage}`)
    if (innerMessage) return normalizeUpstreamProviderErrorMessage(innerMessage)
    if (type) return normalizeUpstreamProviderErrorMessage(type)
    const code = parseTString(error.code)
    if (code) return normalizeUpstreamProviderErrorMessage(code)
  }

  const fallbackMessage = parseTString(record.message)
  if (fallbackMessage) return normalizeUpstreamProviderErrorMessage(fallbackMessage)

  const fallbackError = parseTString(record.error)
  if (fallbackError) return normalizeUpstreamProviderErrorMessage(fallbackError)

  return normalizeUpstreamProviderErrorMessage(message)
}

export function isMessageAbortError<TValue>(value: TValue): boolean {
  return isAbortLikeError(value)
}

export function formatMessageError<TValue>(value: TValue): string {
  const record = parseTJsonObject(value)
  if (!record) return ""

  const data = parseTJsonObject(record.data)
  const message =
    readNonEmptyString(record.message) ??
    (data ? readNonEmptyString(data.message) : undefined) ??
    readNonEmptyString(record.name)

  if (!message) return ""

  return normalizeProviderErrorDetails({
    message: unwrapError(message),
    responseBody: data ? readNonEmptyString(data.responseBody) : undefined,
  })
}
