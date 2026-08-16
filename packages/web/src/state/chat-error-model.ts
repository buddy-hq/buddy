import { readUpstreamProviderErrorPayload } from "@/lib/upstream-provider-error"
import { OPENCODE_PROVIDER_ID } from "@/lib/provider-ids"
import type { UpstreamProviderErrorPayload } from "@/lib/upstream-provider-error"
import type { MessageError, MessageWithParts, ProviderInfo, SessionStatusInfo } from "./chat-types"

const PROVIDER_AUTH_ERROR_NAME = "ProviderAuthError"
const UNKNOWN_ERROR_NAME = "UnknownError"
const OUTPUT_LENGTH_ERROR_NAME = "MessageOutputLengthError"
const ABORTED_ERROR_NAME = "MessageAbortedError"
const STRUCTURED_OUTPUT_ERROR_NAME = "StructuredOutputError"
const CONTEXT_OVERFLOW_ERROR_NAME = "ContextOverflowError"
const CONTENT_FILTER_ERROR_NAME = "ContentFilterError"
const API_ERROR_NAME = "APIError"

const HTTP_UNAUTHORIZED = 401
const HTTP_PAYMENT_REQUIRED = 402
const HTTP_FORBIDDEN = 403
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR_MIN = 500

export const RETRY_NOTICE_MIN_ATTEMPT = 3
export const RETRY_PERSISTENT_MIN_ATTEMPT = 5

const RATE_LIMIT_PATTERN = /rate[\s_-]*limit|too many requests|resource[\s_-]*exhausted|quota/iu
const USAGE_LIMIT_PATTERN =
  /insufficient (?:balance|credits)|monthly (?:spending |usage )?limit|usage limit (?:has been )?reached|no payment method/iu
const OVERLOADED_PATTERN =
  /overload|capacity|no provider available|provider is busy|internal server error|service unavailable/iu
const NETWORK_PATTERN =
  /network|connection|econn|socket|timeout|timed out|unreachable|dns|fetch failed/iu
const MODEL_UNAVAILABLE_PATTERN =
  /model .*(?:not supported|unsupported|disabled|not found|no longer available)|provider .*not supported|promotion has ended/iu
const ACCESS_RESTRICTED_PATTERN =
  /not available (?:for your account|in your region)|region not allowed|permission denied|access denied/iu
const AUTH_PATTERN =
  /invalid api key|missing api key|authentication failed|unauthorized|sign-in expired|token expired/iu

const ZEN_AUTH_ERROR_TYPE = "AuthError"
const ZEN_CREDITS_ERROR_TYPE = "CreditsError"
const ZEN_MONTHLY_LIMIT_ERROR_TYPE = "MonthlyLimitError"
const ZEN_USER_LIMIT_ERROR_TYPE = "UserLimitError"
const ZEN_MODEL_ERROR_TYPE = "ModelError"
const ZEN_REGION_ERROR_TYPE = "RegionError"
const ZEN_RATE_LIMIT_ERROR_TYPE = "RateLimitError"
const ZEN_FREE_USAGE_LIMIT_ERROR_TYPE = "FreeUsageLimitError"
const ZEN_GO_USAGE_LIMIT_ERROR_TYPE = "GoUsageLimitError"
const ZEN_BLACK_USAGE_LIMIT_ERROR_TYPE = "BlackUsageLimitError"

const GENERIC_AUTH_IDENTIFIERS = new Set([
  "authentication_error",
  "invalid_api_key",
  "unauthorized",
])
const GENERIC_USAGE_LIMIT_IDENTIFIERS = new Set([
  "billing_error",
  "insufficient_credits",
  "insufficient_quota",
  "usage_limit",
  "usage_limit_reached",
])
const GENERIC_RATE_LIMIT_IDENTIFIERS = new Set([
  "rate_limit_error",
  "rate_limited",
  "too_many_requests",
])
const GENERIC_TEMPORARILY_UNAVAILABLE_IDENTIFIERS = new Set([
  "overloaded_error",
  "server_error",
  "server_is_overloaded",
  "service_unavailable",
])
const GENERIC_MODEL_UNAVAILABLE_IDENTIFIERS = new Set([
  "model_disabled",
  "model_not_found",
  "model_not_supported",
  "unsupported_model",
])
const GENERIC_ACCESS_RESTRICTED_IDENTIFIERS = new Set([
  "forbidden",
  "permission_denied",
  "region_not_allowed",
])
const GENERIC_CONTENT_RESTRICTED_IDENTIFIERS = new Set([
  "content_filter",
  "content_policy_violation",
])
const GENERIC_CONTEXT_LIMIT_IDENTIFIERS = new Set([
  "context_length_exceeded",
  "context_window_exceeded",
])

type RetryStatus = Extract<SessionStatusInfo, { type: "retry" }>

export type RetryStage = "quiet" | "notice" | "persistent" | "actionable"
export type RetryCategory = "rate-limit" | "overloaded" | "network" | "unknown"

export type RetryStateModel = {
  stage: RetryStage
  category: RetryCategory
  attempt: number
  next: number
  rawMessage: string
  action: RetryStatus["action"]
}

export type AssistantErrorCategory =
  | "auth"
  | "usage-limit"
  | "rate-limit"
  | "temporarily-unavailable"
  | "model-unavailable"
  | "network"
  | "context"
  | "content"
  | "format"
  | "access-restricted"
  | "output-length"
  | "unknown"
  | "stopped"

export type AssistantErrorDisposition = "terminal" | "caveat" | "stopped"

export type AssistantErrorDetails = {
  name: string
  message?: string
  providerID?: string
  statusCode?: number
  isRetryable?: boolean
  responseBody?: string
  providerError?: UpstreamProviderErrorPayload
}

export type AssistantErrorModel = {
  category: AssistantErrorCategory
  disposition: AssistantErrorDisposition
  details: AssistantErrorDetails
}

export type TerminalAssistantError = {
  assistantMessageID: string
  userMessageID: string
  providerID: string
  modelID: string
  error: MessageError
  model: AssistantErrorModel
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function retryCategory(message: string): RetryCategory {
  if (RATE_LIMIT_PATTERN.test(message)) return "rate-limit"
  if (OVERLOADED_PATTERN.test(message)) return "overloaded"
  if (NETWORK_PATTERN.test(message)) return "network"
  return "unknown"
}

export function retryStage(status: RetryStatus): RetryStage {
  if (status.action) return "actionable"
  if (status.attempt >= RETRY_PERSISTENT_MIN_ATTEMPT) return "persistent"
  if (status.attempt >= RETRY_NOTICE_MIN_ATTEMPT) return "notice"
  return "quiet"
}

export function buildRetryStateModel(status: RetryStatus): RetryStateModel {
  return {
    stage: retryStage(status),
    category: retryCategory(status.message),
    attempt: status.attempt,
    next: status.next,
    rawMessage: status.message,
    action: status.action,
  }
}

export function readAssistantErrorDetails(error: MessageError): AssistantErrorDetails {
  const data = isRecord(error.data) ? error.data : undefined
  const message = readNonEmptyString(error.message) ?? readNonEmptyString(data?.message)
  const providerID = readNonEmptyString(data?.providerID)
  const statusCode = readFiniteNumber(data?.statusCode)
  const isRetryable = readBoolean(data?.isRetryable)
  const responseBody = readNonEmptyString(data?.responseBody)
  const providerError = readUpstreamProviderErrorPayload(responseBody)

  return Object.assign(
    Object.assign(
      { name: error.name },
      message ? { message } : undefined,
      providerID ? { providerID } : undefined,
      statusCode !== undefined ? { statusCode } : undefined,
    ),
    isRetryable !== undefined ? { isRetryable } : undefined,
    responseBody ? { responseBody } : undefined,
    providerError ? { providerError } : undefined,
  )
}

function normalizedProviderErrorIdentifiers(
  providerError: UpstreamProviderErrorPayload | undefined,
) {
  return [providerError?.type, providerError?.code]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase())
}

function genericProviderErrorCategory(
  providerError: UpstreamProviderErrorPayload | undefined,
): AssistantErrorCategory | undefined {
  const identifiers = normalizedProviderErrorIdentifiers(providerError)
  if (identifiers.some((value) => GENERIC_AUTH_IDENTIFIERS.has(value))) return "auth"
  if (identifiers.some((value) => GENERIC_USAGE_LIMIT_IDENTIFIERS.has(value))) {
    return "usage-limit"
  }
  if (identifiers.some((value) => GENERIC_RATE_LIMIT_IDENTIFIERS.has(value))) {
    return "rate-limit"
  }
  if (identifiers.some((value) => GENERIC_TEMPORARILY_UNAVAILABLE_IDENTIFIERS.has(value))) {
    return "temporarily-unavailable"
  }
  if (identifiers.some((value) => GENERIC_MODEL_UNAVAILABLE_IDENTIFIERS.has(value))) {
    return "model-unavailable"
  }
  if (identifiers.some((value) => GENERIC_ACCESS_RESTRICTED_IDENTIFIERS.has(value))) {
    return "access-restricted"
  }
  if (identifiers.some((value) => GENERIC_CONTENT_RESTRICTED_IDENTIFIERS.has(value))) {
    return "content"
  }
  if (identifiers.some((value) => GENERIC_CONTEXT_LIMIT_IDENTIFIERS.has(value))) {
    return "context"
  }
  return undefined
}

function zenProviderErrorCategory(input: {
  providerError: UpstreamProviderErrorPayload | undefined
  anonymous: boolean
}): AssistantErrorCategory | undefined {
  switch (input.providerError?.type) {
    case ZEN_AUTH_ERROR_TYPE:
      if (MODEL_UNAVAILABLE_PATTERN.test(input.providerError.message ?? "")) {
        return "model-unavailable"
      }
      return input.anonymous ? "model-unavailable" : "auth"
    case ZEN_CREDITS_ERROR_TYPE:
    case ZEN_MONTHLY_LIMIT_ERROR_TYPE:
    case ZEN_USER_LIMIT_ERROR_TYPE:
      return "usage-limit"
    case ZEN_RATE_LIMIT_ERROR_TYPE:
    case ZEN_FREE_USAGE_LIMIT_ERROR_TYPE:
    case ZEN_GO_USAGE_LIMIT_ERROR_TYPE:
    case ZEN_BLACK_USAGE_LIMIT_ERROR_TYPE:
      return "rate-limit"
    case ZEN_MODEL_ERROR_TYPE:
      return OVERLOADED_PATTERN.test(input.providerError.message ?? "")
        ? "temporarily-unavailable"
        : "model-unavailable"
    case ZEN_REGION_ERROR_TYPE:
      return "access-restricted"
    default:
      return undefined
  }
}

function apiErrorCategory(
  details: AssistantErrorDetails,
  input: { providerID?: string; providerConnected?: boolean },
): AssistantErrorCategory {
  const providerID = details.providerID ?? input.providerID
  const anonymousOpenCode = providerID === OPENCODE_PROVIDER_ID && input.providerConnected === false
  const structured =
    (providerID === OPENCODE_PROVIDER_ID
      ? zenProviderErrorCategory({
          providerError: details.providerError,
          anonymous: anonymousOpenCode,
        })
      : undefined) ?? genericProviderErrorCategory(details.providerError)
  if (structured) return structured

  const searchable = `${details.providerError?.message ?? ""}\n${details.message ?? ""}\n${details.responseBody ?? ""}`
  if (OVERLOADED_PATTERN.test(searchable)) return "temporarily-unavailable"
  if (MODEL_UNAVAILABLE_PATTERN.test(searchable)) return "model-unavailable"
  if (ACCESS_RESTRICTED_PATTERN.test(searchable)) return "access-restricted"
  if (USAGE_LIMIT_PATTERN.test(searchable)) return "usage-limit"
  if (RATE_LIMIT_PATTERN.test(searchable)) return "rate-limit"
  if (AUTH_PATTERN.test(searchable)) {
    return anonymousOpenCode ? "model-unavailable" : "auth"
  }
  if (details.statusCode === HTTP_PAYMENT_REQUIRED) return "usage-limit"
  if (details.statusCode === HTTP_TOO_MANY_REQUESTS) return "rate-limit"
  if (details.statusCode !== undefined && details.statusCode >= HTTP_SERVER_ERROR_MIN) {
    return "temporarily-unavailable"
  }
  if (details.statusCode === HTTP_UNAUTHORIZED) {
    return anonymousOpenCode ? "temporarily-unavailable" : "auth"
  }
  if (details.statusCode === HTTP_FORBIDDEN) return "auth"

  if (NETWORK_PATTERN.test(searchable)) return "network"
  return "unknown"
}

function assistantErrorCategory(
  details: AssistantErrorDetails,
  input: { providerID?: string; providerConnected?: boolean },
): AssistantErrorCategory {
  if (details.name === PROVIDER_AUTH_ERROR_NAME) {
    const providerID = details.providerID ?? input.providerID
    return providerID === OPENCODE_PROVIDER_ID && input.providerConnected === false
      ? "model-unavailable"
      : "auth"
  }
  if (details.name === OUTPUT_LENGTH_ERROR_NAME) return "output-length"
  if (details.name === ABORTED_ERROR_NAME) return "stopped"
  if (details.name === STRUCTURED_OUTPUT_ERROR_NAME) return "format"
  if (details.name === CONTEXT_OVERFLOW_ERROR_NAME) return "context"
  if (details.name === CONTENT_FILTER_ERROR_NAME) return "content"
  if (details.name === API_ERROR_NAME) return apiErrorCategory(details, input)
  if (details.name === UNKNOWN_ERROR_NAME) return "unknown"
  return "unknown"
}

export function buildAssistantErrorModel(
  error: MessageError,
  input: {
    hasVisibleText: boolean
    providerID?: string
    providerConnected?: boolean
  },
): AssistantErrorModel {
  const details = readAssistantErrorDetails(error)
  const category = assistantErrorCategory(details, input)
  const disposition =
    category === "stopped"
      ? "stopped"
      : category === "output-length" && input.hasVisibleText
        ? "caveat"
        : "terminal"

  return {
    category,
    disposition,
    details,
  }
}

function messageHasVisibleText(message: MessageWithParts): boolean {
  return message.parts.some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.trim().length > 0,
  )
}

export function resolveLatestTerminalAssistantError(
  messages: readonly MessageWithParts[],
  providers: readonly ProviderInfo[] = [],
): TerminalAssistantError | undefined {
  const lastUserIndex = messages.findLastIndex((message) => message.info.role === "user")
  if (lastUserIndex < 0) return undefined

  const userMessage = messages[lastUserIndex]
  if (!userMessage || userMessage.info.role !== "user") return undefined

  const latestAssistant = messages
    .slice(lastUserIndex + 1)
    .findLast(
      (message) =>
        message.info.role === "assistant" && message.info.parentID === userMessage.info.id,
    )
  if (
    !latestAssistant ||
    latestAssistant.info.role !== "assistant" ||
    !latestAssistant.info.error
  ) {
    return undefined
  }

  const providerID = latestAssistant.info.providerID
  const provider = providers.find((item) => item.id === providerID)
  const model = buildAssistantErrorModel(
    latestAssistant.info.error,
    Object.assign(
      {
        hasVisibleText: messageHasVisibleText(latestAssistant),
        providerID,
      },
      provider ? { providerConnected: provider.connected } : undefined,
    ),
  )
  if (model.disposition !== "terminal") return undefined

  return {
    assistantMessageID: latestAssistant.info.id,
    userMessageID: userMessage.info.id,
    providerID,
    modelID: latestAssistant.info.modelID,
    error: latestAssistant.info.error,
    model,
  }
}
