export type RuntimeErrorKind =
  | "not_found"
  | "conflict"
  | "busy"
  | "interrupted"
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "unavailable"
  | "internal"

export type RuntimeErrorSubject = "session" | "message" | "permission" | "form" | "provider" | "integration" | "mcp" | "project" | "location"

export class RuntimeError extends Error {
  readonly _tag = "RuntimeError"
  readonly kind: RuntimeErrorKind
  readonly subject?: RuntimeErrorSubject

  constructor(kind: RuntimeErrorKind, message: string, options: { readonly subject?: RuntimeErrorSubject; readonly cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = "RuntimeError"
    this.kind = kind
    this.subject = options.subject
  }
}

export type RuntimeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RuntimeError }

export function isRuntimeError<TValue>(value: TValue): value is TValue & RuntimeError {
  return value instanceof RuntimeError
}

export function isNotFound<TValue>(value: TValue, subject?: RuntimeErrorSubject): boolean {
  return value instanceof RuntimeError && value.kind === "not_found" && (subject === undefined || value.subject === subject)
}

const STATUS = {
  not_found: 404,
  conflict: 409,
  busy: 409,
  interrupted: 409,
  unauthorized: 401,
  forbidden: 403,
  invalid: 400,
  unavailable: 503,
  internal: 500,
} satisfies Record<RuntimeErrorKind, number>

export function runtimeErrorStatus<TValue>(value: TValue): number {
  return value instanceof RuntimeError ? STATUS[value.kind] : 500
}
