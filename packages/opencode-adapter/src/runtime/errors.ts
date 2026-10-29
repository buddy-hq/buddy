import {
  RuntimeError,
  type RuntimeErrorKind,
  type RuntimeErrorSubject,
  type RuntimeResult,
} from "@buddy/agent-runtime/errors"
import { Schema } from "effect"
import { SessionExecutionWaitError } from "../gateway/execution"
import { SessionWriteError } from "../gateway/write"

type Classification = readonly [RuntimeErrorKind, RuntimeErrorSubject?]

const NATIVE = new Map<string, Classification>([
  ["LocationNotFoundError", ["not_found", "location"]],
  ["ProjectNotFoundError", ["not_found", "project"]],
  ["SessionNotFoundError", ["not_found", "session"]],
  ["MessageNotFoundError", ["not_found", "message"]],
  ["PermissionNotFoundError", ["not_found", "permission"]],
  ["IntegrationNotFoundError", ["not_found", "integration"]],
  ["IntegrationAttemptNotFoundError", ["not_found", "integration"]],
  ["IntegrationMethodNotFoundError", ["not_found", "integration"]],
  ["ProviderNotFoundError", ["not_found", "provider"]],
  ["ConflictError", ["conflict"]],
  ["SessionBusyError", ["busy", "session"]],
  ["UnauthorizedError", ["unauthorized"]],
  ["ForbiddenError", ["forbidden"]],
  ["ValidationError", ["invalid"]],
  ["BadRequestError", ["invalid"]],
  ["InvalidRequestError", ["invalid"]],
  ["InvalidCursorError", ["invalid"]],
  ["FormInvalidAnswerError", ["invalid", "form"]],
  ["ProviderOAuthError", ["invalid", "provider"]],
])

const STATUS = new Map<number, RuntimeErrorKind>([
  [400, "invalid"],
  [401, "unauthorized"],
  [403, "forbidden"],
  [404, "not_found"],
  [409, "conflict"],
  [503, "unavailable"],
])

const TaggedCause = Schema.Struct({ _tag: Schema.String })

function nativeTag<TCause>(cause: TCause): string | undefined {
  if (Schema.is(TaggedCause)(cause)) return cause["_tag"]
  return cause instanceof Error ? cause.name : undefined
}

export function toRuntimeError<TCause>(
  cause: TCause,
  fallback = "Runtime request failed",
): RuntimeError {
  if (cause instanceof RuntimeError) return cause
  const message = cause instanceof Error && cause.message ? cause.message : fallback
  if (cause instanceof SessionWriteError)
    return new RuntimeError(STATUS.get(cause.status) ?? "internal", message, { cause })
  if (cause instanceof SessionExecutionWaitError)
    return new RuntimeError(cause.reason === "disconnected" ? "unavailable" : "conflict", message, {
      subject: "session",
      cause,
    })
  const classified = NATIVE.get(nativeTag(cause) ?? "")
  if (!classified) return new RuntimeError("internal", message, { cause })
  const [kind, subject] = classified
  return new RuntimeError(kind, message, { subject, cause })
}

export function runtimeFailure<TCause>(cause: TCause): RuntimeResult<never> {
  return { ok: false, error: toRuntimeError(cause) }
}
