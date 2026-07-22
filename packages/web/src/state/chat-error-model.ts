import type { MessageError, MessageWithParts, SessionStatusInfo } from "./chat-types"

const PROVIDER_AUTH_ERROR_NAME = "ProviderAuthError"
const UNKNOWN_ERROR_NAME = "UnknownError"
const OUTPUT_LENGTH_ERROR_NAME = "MessageOutputLengthError"
const ABORTED_ERROR_NAME = "MessageAbortedError"
const STRUCTURED_OUTPUT_ERROR_NAME = "StructuredOutputError"
const CONTEXT_OVERFLOW_ERROR_NAME = "ContextOverflowError"
const CONTENT_FILTER_ERROR_NAME = "ContentFilterError"
const API_ERROR_NAME = "APIError"

const HTTP_UNAUTHORIZED = 401
const HTTP_FORBIDDEN = 403
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR_MIN = 500

export const RETRY_NOTICE_MIN_ATTEMPT = 3
export const RETRY_PERSISTENT_MIN_ATTEMPT = 5

const RATE_LIMIT_PATTERN = /rate[\s_-]*limit|too many requests|resource[\s_-]*exhausted|quota/iu
const OVERLOADED_PATTERN =
  /overload|capacity|provider is busy|internal server error|service unavailable/iu
const NETWORK_PATTERN =
  /network|connection|econn|socket|timeout|timed out|unreachable|dns|fetch failed/iu

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
  | "rate-limit"
  | "overloaded"
  | "network"
  | "context"
  | "content"
  | "format"
  | "output-length"
  | "unknown"
  | "stopped"

export type AssistantErrorDisposition = "terminal" | "caveat" | "stopped"

export type AssistantErrorDetails = {
  name: string
  message?: string
  providerID?: string
  statusCode?: number
  responseBody?: string
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
  const responseBody = readNonEmptyString(data?.responseBody)

  return {
    name: error.name,
    ...(message ? { message } : {}),
    ...(providerID ? { providerID } : {}),
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(responseBody ? { responseBody } : {}),
  }
}

function apiErrorCategory(details: AssistantErrorDetails): AssistantErrorCategory {
  if (details.statusCode === HTTP_UNAUTHORIZED || details.statusCode === HTTP_FORBIDDEN) {
    return "auth"
  }
  if (details.statusCode === HTTP_TOO_MANY_REQUESTS) return "rate-limit"
  if (details.statusCode !== undefined && details.statusCode >= HTTP_SERVER_ERROR_MIN) {
    return "overloaded"
  }

  const searchable = `${details.message ?? ""}\n${details.responseBody ?? ""}`
  if (RATE_LIMIT_PATTERN.test(searchable)) return "rate-limit"
  if (NETWORK_PATTERN.test(searchable)) return "network"
  if (OVERLOADED_PATTERN.test(searchable)) return "overloaded"
  return "unknown"
}

function assistantErrorCategory(details: AssistantErrorDetails): AssistantErrorCategory {
  if (details.name === PROVIDER_AUTH_ERROR_NAME) return "auth"
  if (details.name === OUTPUT_LENGTH_ERROR_NAME) return "output-length"
  if (details.name === ABORTED_ERROR_NAME) return "stopped"
  if (details.name === STRUCTURED_OUTPUT_ERROR_NAME) return "format"
  if (details.name === CONTEXT_OVERFLOW_ERROR_NAME) return "context"
  if (details.name === CONTENT_FILTER_ERROR_NAME) return "content"
  if (details.name === API_ERROR_NAME) return apiErrorCategory(details)
  if (details.name === UNKNOWN_ERROR_NAME) return "unknown"
  return "unknown"
}

export function buildAssistantErrorModel(
  error: MessageError,
  input: { hasVisibleText: boolean },
): AssistantErrorModel {
  const details = readAssistantErrorDetails(error)
  const category = assistantErrorCategory(details)
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

  const model = buildAssistantErrorModel(latestAssistant.info.error, {
    hasVisibleText: messageHasVisibleText(latestAssistant),
  })
  if (model.disposition !== "terminal") return undefined

  return {
    assistantMessageID: latestAssistant.info.id,
    userMessageID: userMessage.info.id,
    providerID: latestAssistant.info.providerID,
    modelID: latestAssistant.info.modelID,
    error: latestAssistant.info.error,
    model,
  }
}
