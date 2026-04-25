import { t } from "@/i18n"

const ZEN_IP_RATE_LIMIT_TABLE_NAME = "ip_rate_limit"
const ZEN_QUERY_FAILURE_PREFIX = "Failed query:"
const GENERIC_PROVIDER_ERROR_MESSAGE = "Provider returned error"
const ZEN_NETWORK_RATE_LIMIT_MESSAGE_KEY = "errors.provider.zenNetworkRateLimit"
const GENERIC_PROVIDER_FAILURE_MESSAGE_KEY = "errors.provider.genericStreamFailure"

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

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function unwrapJsonErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    const parsed = parseJsonValue(value)
    if (parsed !== undefined) return unwrapJsonErrorMessage(parsed)
    return readNonEmptyString(value)
  }

  if (!isRecord(value)) return undefined

  const error = value.error
  if (isRecord(error)) {
    const nested = unwrapJsonErrorMessage(error)
    if (nested) return nested
  }

  return (
    readNonEmptyString(value.message) ??
    readNonEmptyString(value.error) ??
    readNonEmptyString(value.code) ??
    readNonEmptyString(value.type)
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
