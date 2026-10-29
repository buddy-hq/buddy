import { t } from "@/i18n"
import {
  parseTJsonObject,
  parseTJsonText,
  parseTString,
  readNonEmptyString,
} from "@/components/chat/tools/types"

const ZEN_IP_RATE_LIMIT_TABLE_NAME = "ip_rate_limit"
const ZEN_QUERY_FAILURE_PREFIX = "Failed query:"
const GENERIC_PROVIDER_ERROR_MESSAGE = "Provider returned error"
const ZEN_NETWORK_RATE_LIMIT_MESSAGE_KEY = "errors.provider.zenNetworkRateLimit"
const GENERIC_PROVIDER_FAILURE_MESSAGE_KEY = "errors.provider.genericStreamFailure"
const MAX_JSON_UNWRAP_DEPTH = 3

export function normalizeUpstreamProviderErrorMessage(message: string): string {
  if (isZenNetworkRateLimitFailure(message)) {
    return t(ZEN_NETWORK_RATE_LIMIT_MESSAGE_KEY)
  }

  if (message.trim() === GENERIC_PROVIDER_ERROR_MESSAGE) {
    return t(GENERIC_PROVIDER_FAILURE_MESSAGE_KEY)
  }

  return message
}

function isZenNetworkRateLimitFailure(message: string): boolean {
  return (
    message.includes(ZEN_QUERY_FAILURE_PREFIX) && message.includes(ZEN_IP_RATE_LIMIT_TABLE_NAME)
  )
}

function unwrapJsonErrorMessage<TValue>(value: TValue, depth = 0): string | undefined {
  if (depth >= MAX_JSON_UNWRAP_DEPTH) return readNonEmptyString(value)

  const text = parseTString(value)
  if (text !== undefined) {
    const parsed = parseTJsonText(text)
    if (parsed !== undefined) return unwrapJsonErrorMessage(parsed, depth + 1)
    return readNonEmptyString(text)
  }

  const record = parseTJsonObject(value)
  if (!record) return undefined

  const error = record.error
  const nestedRecord = parseTJsonObject(error)
  if (nestedRecord) {
    const nested = unwrapJsonErrorMessage(nestedRecord, depth + 1)
    if (nested) return nested
  }

  return (
    readNonEmptyString(record.message) ??
    readNonEmptyString(record.error) ??
    readNonEmptyString(record.code) ??
    readNonEmptyString(record.type)
  )
}

export function normalizeProviderErrorDetails(input: {
  message: string
  responseBody?: string
}): string {
  const responseBodyMessage = input.responseBody
    ? unwrapJsonErrorMessage(input.responseBody)
    : undefined

  const trimmedMessage = input.message.trim()
  if (
    responseBodyMessage &&
    (trimmedMessage === GENERIC_PROVIDER_ERROR_MESSAGE ||
      trimmedMessage === t(GENERIC_PROVIDER_FAILURE_MESSAGE_KEY))
  ) {
    return normalizeUpstreamProviderErrorMessage(responseBodyMessage)
  }

  return normalizeUpstreamProviderErrorMessage(input.message)
}
