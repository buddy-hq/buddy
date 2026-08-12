import { t } from "@/i18n"

const ZEN_IP_RATE_LIMIT_TABLE_NAME = "ip_rate_limit"
const ZEN_QUERY_FAILURE_PREFIX = "Failed query:"
const GENERIC_PROVIDER_ERROR_MESSAGE = "Provider returned error"
const ZEN_NETWORK_RATE_LIMIT_MESSAGE_KEY = "errors.provider.zenNetworkRateLimit"
const GENERIC_PROVIDER_FAILURE_MESSAGE_KEY = "errors.provider.genericStreamFailure"
const MAX_JSON_UNWRAP_DEPTH = 3

export type UpstreamProviderErrorPayload = {
  type?: string
  code?: string
  message?: string
  planType?: string
  resetsAt?: number
  resetsInSeconds?: number
}

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

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function unwrapJsonErrorMessage(value: unknown, depth = 0): string | undefined {
  if (depth >= MAX_JSON_UNWRAP_DEPTH) return readNonEmptyString(value)

  if (typeof value === "string") {
    const parsed = parseJsonValue(value)
    if (parsed !== undefined) return unwrapJsonErrorMessage(parsed, depth + 1)
    return readNonEmptyString(value)
  }

  if (!isRecord(value)) return undefined

  const error = value.error
  if (isRecord(error)) {
    const nested = unwrapJsonErrorMessage(error, depth + 1)
    if (nested) return nested
  }

  return (
    readNonEmptyString(value.message) ??
    readNonEmptyString(value.error) ??
    readNonEmptyString(value.code) ??
    readNonEmptyString(value.type)
  )
}

function readErrorRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== "string") return undefined
  const parsed = parseJsonValue(value)
  return isRecord(parsed) ? parsed : undefined
}

export function readUpstreamProviderErrorPayload(
  responseBody: string | undefined,
): UpstreamProviderErrorPayload | undefined {
  if (!responseBody) return undefined
  const root = readErrorRecord(responseBody)
  if (!root) return undefined
  const nested = readErrorRecord(root.error)
  const source = nested ?? root
  const type = readNonEmptyString(source.type)
  const code = readNonEmptyString(source.code)
  const message = readNonEmptyString(source.message)
  const planType = readNonEmptyString(source.plan_type)
  const resetsAt = readFiniteNumber(source.resets_at)
  const resetsInSeconds = readFiniteNumber(source.resets_in_seconds)
  if (
    !type &&
    !code &&
    !message &&
    !planType &&
    resetsAt === undefined &&
    resetsInSeconds === undefined
  ) {
    return undefined
  }

  return {
    ...(type ? { type } : {}),
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(planType ? { planType } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
    ...(resetsInSeconds !== undefined ? { resetsInSeconds } : {}),
  }
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
