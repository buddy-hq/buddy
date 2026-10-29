import { Schema, Option } from "effect"

const ErrorBody = Schema.Struct({
  _tag: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
})

export function sessionErrorStatus<TError>(error: TError): number {
  const body = Option.getOrUndefined(Schema.decodeUnknownOption(ErrorBody)(error))
  if (body?.["_tag"] === "SessionNotFoundError" || body?.["_tag"] === "MessageNotFoundError" || body?.["_tag"] === "CommandNotFoundError") return 404
  if (body?.["_tag"] === "ConflictError" || body?.["_tag"] === "SessionBusyError") return 409
  if (body?.["_tag"] === "UnauthorizedError") return 401
  if (body?.["_tag"] === "ForbiddenError") return 403
  if (body?.["_tag"] === "ValidationError" || body?.["_tag"] === "BadRequestError" || body?.["_tag"] === "InvalidRequestError" || body?.["_tag"] === "InvalidCursorError") return 400
  return 500
}

export function isSessionNotFound<TError>(error: TError): boolean {
  return Option.getOrUndefined(Schema.decodeUnknownOption(ErrorBody)(error))?.["_tag"] === "SessionNotFoundError"
}
