import { z } from "zod"
import type { MessageWithParts, SessionInfo, SessionStatusInfo, TRecord } from "./chat-types"
import { isRecord, parseString } from "./chat-types"
import { inferBusyFromMessages } from "./chat-reducer"
import { normalizeUpstreamProviderErrorMessage } from "../lib/upstream-provider-error"

const SESSION_STATUS_IDLE = "idle"
const SESSION_STATUS_BUSY = "busy"
const SESSION_STATUS_RETRY = "retry"
const DEFAULT_RETRY_ATTEMPT = 1
const DEFAULT_RETRY_MESSAGE = "Retrying request"

type RetryStatus = Extract<SessionStatusInfo, { type: "retry" }>
export type TRetryAction = NonNullable<RetryStatus["action"]>

export const IDLE_SESSION_STATUS: SessionStatusInfo = {
  type: SESSION_STATUS_IDLE,
}

export const BUSY_SESSION_STATUS: SessionStatusInfo = {
  type: SESSION_STATUS_BUSY,
}

const retryActionSchema = z.object({
  reason: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  title: z.string().trim().min(1),
  message: z.string().trim().min(1),
  label: z.string().trim().min(1),
  link: z.string().trim().min(1).optional(),
}) satisfies z.ZodType<TRetryAction>

const retryStatusFieldsSchema = z.object({
  type: z.literal(SESSION_STATUS_RETRY),
  attempt: z.number().finite().optional(),
  message: z.string().optional(),
  next: z.number().finite().optional(),
  action: z.unknown().optional(),
})

function parseRetryAction<TValue>(value: TValue): TRetryAction | undefined {
  const result = retryActionSchema.safeParse(value)
  return result.success ? result.data : undefined
}

function parseRetryMessage<TValue>(value: TValue, fallback: string) {
  const parsed = parseString(value)?.trim()
  if (!parsed || parsed.length === 0) return fallback
  return normalizeUpstreamProviderErrorMessage(parsed)
}

export function normalizeSessionStatusValue<TValue>(value: TValue): SessionStatusInfo {
  if (value === SESSION_STATUS_BUSY) return BUSY_SESSION_STATUS
  if (value === SESSION_STATUS_IDLE) return IDLE_SESSION_STATUS

  const retryFields = retryStatusFieldsSchema.safeParse(value)
  if (retryFields.success) {
    const action = parseRetryAction(retryFields.data.action)
    return Object.assign(
      {
        type: SESSION_STATUS_RETRY,
        attempt: retryFields.data.attempt ?? DEFAULT_RETRY_ATTEMPT,
        message: parseRetryMessage(retryFields.data.message, DEFAULT_RETRY_MESSAGE),
        next: retryFields.data.next ?? Date.now(),
      } as const,
      action ? { action } : undefined,
    )
  }

  if (!isRecord(value)) {
    return IDLE_SESSION_STATUS
  }

  const record: TRecord = value
  if (record.type === SESSION_STATUS_BUSY) return BUSY_SESSION_STATUS
  return IDLE_SESSION_STATUS
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
  if (Number.isFinite(input.info?.time.compacting)) return true
  return hasPendingAssistantMessages(input.messages)
}

export type SessionActivity = "idle" | "working" | "retrying"

/**
 * Three-way activity for surfaces that distinguish a healthy run from a failing one.
 * `isSessionWorking` folds retry into a single busy boolean, which is right for
 * "is anything happening" checks but hides the state a user most needs to see.
 */
export function getSessionActivity(input: {
  info?: SessionInfo
  status?: SessionStatusInfo
  messages?: readonly MessageWithParts[]
}): SessionActivity {
  if (isSessionStatusRetry(input.status)) return "retrying"
  if (isSessionWorking(input)) return "working"
  return "idle"
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

function retryActionEquals(left: TRetryAction | undefined, right: TRetryAction | undefined) {
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
