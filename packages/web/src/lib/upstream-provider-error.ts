import { t } from "@/i18n"
import {
  parseTJsonObject,
  parseTJsonText,
  parseTNumber,
  parseTString,
  readNonEmptyString,
  type TJsonObject,
} from "@/components/chat/tools/types"

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

function parseFiniteNumber<TValue>(value: TValue): number | undefined {
  const numeric = parseTNumber(value)
  if (numeric === undefined || !Number.isFinite(numeric)) return undefined
  return numeric
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

function readErrorRecord<TValue>(value: TValue): TJsonObject | undefined {
  const record = parseTJsonObject(value)
  if (record) return record
  const text = parseTString(value)
  if (text === undefined) return undefined
  return parseTJsonObject(parseTJsonText(text))
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
  const resetsAt = parseFiniteNumber(source.resets_at)
  const resetsInSeconds = parseFiniteNumber(source.resets_in_seconds)
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

  return Object.assign(
    Object.assign(
      {},
      type ? { type } : undefined,
      code ? { code } : undefined,
      message ? { message } : undefined,
    ),
    planType ? { planType } : undefined,
    resetsAt !== undefined ? { resetsAt } : undefined,
    resetsInSeconds !== undefined ? { resetsInSeconds } : undefined,
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
