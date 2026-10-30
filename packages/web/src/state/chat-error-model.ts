import { isAnonymousBundledProvider } from "@/lib/provider-catalog"
import { OPENAI_PROVIDER_ID } from "@/lib/provider-ids"
import type { OpenAIUsageSnapshot } from "./openai-usage-query"
import type {
  MessageError,
  MessageErrorCode,
  MessageWithParts,
  ProviderInfo,
  SessionStatusInfo,
} from "./chat-types"
import { parseMessageErrorData, parseString } from "./chat-types"

export const RETRY_NOTICE_MIN_ATTEMPT = 3
export const RETRY_PERSISTENT_MIN_ATTEMPT = 5

const RATE_LIMIT_PATTERN = /rate[\s_-]*limit|too many requests|resource[\s_-]*exhausted|quota/iu
const OVERLOADED_PATTERN =
  /overload|capacity|no provider available|provider is busy|internal server error|service unavailable/iu
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
  limit?: NonNullable<MessageError["limit"]>
}

export type AssistantErrorModel = {
  code?: MessageErrorCode
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

export type DockedTerminalAssistantError = TerminalAssistantError & { expiresAt?: number }

function readNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function retryCategory(status: RetryStatus): RetryCategory {
  switch (status.error?.type) {
    case "provider.quota":
    case "provider.rate-limit":
      return "rate-limit"
    case "provider.internal":
      return "overloaded"
    case "provider.transport":
    case "provider.timeout":
      return "network"
    case "provider.auth":
    case "ProviderAuthError":
    case "provider.content-filter":
    case "ContentFilterError":
    case "ContextOverflowError":
    case "provider.invalid-output":
    case "StructuredOutputError":
    case "provider.no-route":
    case "provider.unsupported-operation":
    case "MessageOutputLengthError":
    case "MessageAbortedError":
    case "aborted":
      return "unknown"
  }
  if (status.error?.status === 402 || status.error?.status === 429) return "rate-limit"
  if (status.error?.status !== undefined) {
    if (status.error.status >= 500) return "overloaded"
    return "unknown"
  }
  if (RATE_LIMIT_PATTERN.test(status.message)) return "rate-limit"
  if (OVERLOADED_PATTERN.test(status.message)) return "overloaded"
  if (NETWORK_PATTERN.test(status.message)) return "network"
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
    category: retryCategory(status),
    attempt: status.attempt,
    next: status.next,
    rawMessage: status.message,
    action: status.action,
  }
}

export function readAssistantErrorDetails(error: MessageError): AssistantErrorDetails {
  const data = parseMessageErrorData(error.data)
  const message =
    readNonEmptyString(error.message) ?? readNonEmptyString(data?.message ?? undefined)
  const providerID = readNonEmptyString(data?.providerID ?? undefined)
  const statusCode = data?.statusCode ?? undefined
  const isRetryable = data?.isRetryable ?? undefined
  const responseBody = readNonEmptyString(data?.responseBody ?? undefined)

  return Object.assign(
    Object.assign(
      { name: error.name },
      message ? { message } : undefined,
      providerID ? { providerID } : undefined,
      statusCode !== undefined ? { statusCode } : undefined,
    ),
    Object.assign(
      {},
      isRetryable !== undefined ? { isRetryable } : undefined,
      responseBody ? { responseBody } : undefined,
    ),
    error.limit ? { limit: error.limit } : undefined,
  )
}

const CATEGORY_BY_CODE = {
  auth: "auth",
  credits_exhausted: "usage-limit",
  quota_exceeded: "usage-limit",
  rate_limited: "rate-limit",
  temporarily_unavailable: "temporarily-unavailable",
  model_unavailable: "model-unavailable",
  region_blocked: "access-restricted",
  access_denied: "access-restricted",
  network: "network",
  context_limit: "context",
  content_blocked: "content",
  invalid_output: "format",
  output_limit: "output-length",
  stopped: "stopped",
  unknown: "unknown",
} satisfies Record<MessageErrorCode, AssistantErrorCategory>

function isMessageErrorCode(value: string | undefined): value is MessageErrorCode {
  return value !== undefined && Object.hasOwn(CATEGORY_BY_CODE, value)
}

function selectErrorCode(
  error: MessageError,
  provider: ProviderInfo | undefined,
): MessageErrorCode {
  const code = isAnonymousBundledProvider(provider)
    ? (error.anonymousCode ?? error.code)
    : error.code
  return isMessageErrorCode(code) ? code : "unknown"
}

export function buildAssistantErrorModel(
  error: MessageError,
  input: {
    hasVisibleText: boolean
    provider?: ProviderInfo
  },
): AssistantErrorModel {
  const code = selectErrorCode(error, input.provider)
  const category = CATEGORY_BY_CODE[code]
  const disposition =
    category === "stopped"
      ? "stopped"
      : category === "output-length" && input.hasVisibleText
        ? "caveat"
        : "terminal"

  return {
    code,
    category,
    disposition,
    details: readAssistantErrorDetails(error),
  }
}

function messageHasVisibleText(message: MessageWithParts): boolean {
  return message.parts.some((part) => {
    if (part.type !== "text") return false
    const text = parseString(part.text)?.trim()
    return text !== undefined && text.length > 0
  })
}

function terminalAssistantError(
  message: MessageWithParts,
  providers: readonly ProviderInfo[],
): TerminalAssistantError | undefined {
  if (message.info.role !== "assistant" || !message.info.error) return undefined
  const providerID = message.info.providerID
  const model = buildAssistantErrorModel(message.info.error, {
    hasVisibleText: messageHasVisibleText(message),
    provider: providers.find((item) => item.id === providerID),
  })
  if (model.disposition !== "terminal") return undefined
  return {
    assistantMessageID: message.info.id,
    userMessageID: message.info.parentID,
    providerID,
    modelID: message.info.modelID,
    error: message.info.error,
    model,
  }
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
  return latestAssistant ? terminalAssistantError(latestAssistant, providers) : undefined
}

function isLimitError(error: TerminalAssistantError): boolean {
  return error.model.category === "usage-limit" || error.model.category === "rate-limit"
}

export function resolveDockedTerminalAssistantError(
  messages: readonly MessageWithParts[],
  input: {
    providers: readonly ProviderInfo[]
    selectedProviderID: string | undefined
    usage: OpenAIUsageSnapshot | undefined
    now: number
  },
): DockedTerminalAssistantError | undefined {
  const latest = resolveLatestTerminalAssistantError(messages, input.providers)
  const nonLimitError = latest && !isLimitError(latest) ? latest : undefined

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.info.role !== "assistant" || message.info.providerID !== input.selectedProviderID)
      continue
    const error = terminalAssistantError(message, input.providers)
    if (!error || !isLimitError(error)) continue

    if (input.selectedProviderID === OPENAI_PROVIDER_ID && input.usage?.status === "ready") {
      const resets = [input.usage.rateLimit.primary, input.usage.rateLimit.secondary].flatMap(
        (window) => {
          if (!window || window.usedPercent < 100) return []
          const resetsAt = Date.parse(window.resetsAt)
          return resetsAt > input.now ? [resetsAt] : []
        },
      )
      return resets.length > 0 ? { ...error, expiresAt: Math.max(...resets) } : nonLimitError
    }

    const resetsAt = error.model.details.limit?.resetsAt
    if (resetsAt !== undefined) {
      const expiresAt = resetsAt * 1_000
      return expiresAt > input.now ? { ...error, expiresAt } : nonLimitError
    }
    return error.assistantMessageID === latest?.assistantMessageID ? error : nonLimitError
  }
  return nonLimitError
}
