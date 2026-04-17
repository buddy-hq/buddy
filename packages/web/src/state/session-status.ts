import type { MessageWithParts, SessionInfo, SessionStatusInfo } from "./chat-types"
import { normalizeUpstreamProviderErrorMessage } from "../lib/upstream-provider-error"

const SESSION_STATUS_IDLE = "idle"
const SESSION_STATUS_BUSY = "busy"
const SESSION_STATUS_RETRY = "retry"
const DEFAULT_RETRY_ATTEMPT = 1
const DEFAULT_RETRY_MESSAGE = "Retrying request"
const ASSISTANT_ROLE = "assistant"

export const IDLE_SESSION_STATUS: SessionStatusInfo = {
  type: SESSION_STATUS_IDLE,
}

export const BUSY_SESSION_STATUS: SessionStatusInfo = {
  type: SESSION_STATUS_BUSY,
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
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

export function normalizeSessionStatusValue(value: unknown): SessionStatusInfo {
  if (value === SESSION_STATUS_BUSY) return BUSY_SESSION_STATUS
  if (value === SESSION_STATUS_IDLE) return IDLE_SESSION_STATUS

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return IDLE_SESSION_STATUS
  }

  const record = value as {
    type?: unknown
    attempt?: unknown
    message?: unknown
    next?: unknown
  }

  if (record.type === SESSION_STATUS_BUSY) return BUSY_SESSION_STATUS
  if (record.type !== SESSION_STATUS_RETRY) return IDLE_SESSION_STATUS

  return {
    type: SESSION_STATUS_RETRY,
    attempt: asFiniteNumber(record.attempt) ?? DEFAULT_RETRY_ATTEMPT,
    message: asString(record.message, DEFAULT_RETRY_MESSAGE),
    next: asFiniteNumber(record.next) ?? Date.now(),
  }
}

export function isSessionStatusActive(status: SessionStatusInfo | undefined) {
  return (status ?? IDLE_SESSION_STATUS).type !== SESSION_STATUS_IDLE
}

export function hasPendingAssistantMessages(messages: readonly MessageWithParts[] | undefined) {
  return (messages ?? []).some(
    (message) =>
      message.info.role === ASSISTANT_ROLE && typeof message.info.time.completed !== "number",
  )
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
    left.attempt === right.attempt && left.message === right.message && left.next === right.next
  )
}
