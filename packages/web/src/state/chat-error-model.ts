import { isAnonymousBundledProvider } from "@/lib/provider-catalog"
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

function readNonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
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
  const model = buildAssistantErrorModel(latestAssistant.info.error, {
    hasVisibleText: messageHasVisibleText(latestAssistant),
    provider: providers.find((item) => item.id === providerID),
  })
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
