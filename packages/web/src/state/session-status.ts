import type { MessageWithParts, SessionInfo, SessionStatusInfo } from "./chat-types"
import { inferBusyFromMessages } from "./chat-reducer"
import { normalizeUpstreamProviderErrorMessage } from "../lib/upstream-provider-error"

const SESSION_STATUS_IDLE = "idle"
const SESSION_STATUS_BUSY = "busy"
const SESSION_STATUS_RETRY = "retry"
const DEFAULT_RETRY_ATTEMPT = 1
const DEFAULT_RETRY_MESSAGE = "Retrying request"

type RetryStatus = Extract<SessionStatusInfo, { type: "retry" }>
type RetryAction = NonNullable<RetryStatus["action"]>

export const IDLE_SESSION_STATUS: SessionStatusInfo = {
  type: SESSION_STATUS_IDLE,
}

export const BUSY_SESSION_STATUS: SessionStatusInfo = {
  type: SESSION_STATUS_BUSY,
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return fallback
  }

  return normalizeUpstreamProviderErrorMessage(trimmed)
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeRetryAction(value: unknown): RetryAction | undefined {
  if (!isRecord(value)) return undefined

  const reason = asNonEmptyString(value.reason)
  const provider = asNonEmptyString(value.provider)
  const title = asNonEmptyString(value.title)
  const message = asNonEmptyString(value.message)
  const label = asNonEmptyString(value.label)
  if (!reason || !provider || !title || !message || !label) return undefined

  const link = asNonEmptyString(value.link)
  return {
    reason,
    provider,
    title,
    message,
    label,
    ...(link ? { link } : {}),
  }
}

export function normalizeSessionStatusValue(value: unknown): SessionStatusInfo {
  if (value === SESSION_STATUS_BUSY) return BUSY_SESSION_STATUS
  if (value === SESSION_STATUS_IDLE) return IDLE_SESSION_STATUS

  if (!isRecord(value)) {
    return IDLE_SESSION_STATUS
  }

  if (value.type === SESSION_STATUS_BUSY) return BUSY_SESSION_STATUS
  if (value.type !== SESSION_STATUS_RETRY) return IDLE_SESSION_STATUS

  const action = normalizeRetryAction(value.action)
  return {
    type: SESSION_STATUS_RETRY,
    attempt: asFiniteNumber(value.attempt) ?? DEFAULT_RETRY_ATTEMPT,
    message: asString(value.message, DEFAULT_RETRY_MESSAGE),
    next: asFiniteNumber(value.next) ?? Date.now(),
    ...(action ? { action } : {}),
  }
}

export function isSessionStatusActive(status: SessionStatusInfo | undefined) {
  return (status ?? IDLE_SESSION_STATUS).type !== SESSION_STATUS_IDLE
}

export function hasPendingAssistantMessages(messages: readonly MessageWithParts[] | undefined) {
  return inferBusyFromMessages([...(messages ?? [])])
}

export function isSessionWorking(input: {
  info?: SessionInfo
  status?: SessionStatusInfo
  messages?: readonly MessageWithParts[]
}) {
  if (isSessionStatusActive(input.status)) return true
  if (typeof input.info?.time.compacting === "number") return true
  return hasPendingAssistantMessages(input.messages)
}

export function isSessionStatusRetry(
  status: SessionStatusInfo | undefined,
): status is Extract<SessionStatusInfo, { type: "retry" }> {
  return (status ?? IDLE_SESSION_STATUS).type === SESSION_STATUS_RETRY
}

export function sessionStatusEquals(left: SessionStatusInfo, right: SessionStatusInfo) {
  if (left.type !== right.type) return false
  if (left.type !== SESSION_STATUS_RETRY || right.type !== SESSION_STATUS_RETRY) {
    return true
  }

  return (
    left.attempt === right.attempt &&
    left.message === right.message &&
    left.next === right.next &&
    retryActionEquals(left.action, right.action)
  )
}

function retryActionEquals(left: RetryAction | undefined, right: RetryAction | undefined) {
  if (left === right) return true
  if (!left || !right) return false
  return (
    left.reason === right.reason &&
    left.provider === right.provider &&
    left.title === right.title &&
    left.message === right.message &&
    left.label === right.label &&
    left.link === right.link
  )
}
