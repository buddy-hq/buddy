import { Option, Schema } from "effect"

export const PermissionReply = Schema.Literals(["once", "always", "reject"])
export type PermissionReply = typeof PermissionReply.Type

export const PermissionRequest = Schema.Struct({
  id: Schema.String,
  sessionID: Schema.String,
  action: Schema.String,
  file: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
  resources: Schema.Array(Schema.String).pipe(Schema.mutable),
  save: Schema.optional(Schema.Array(Schema.String).pipe(Schema.mutable)),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  source: Schema.optional(Schema.Struct({ messageID: Schema.String, callID: Schema.String })),
  message: Schema.optional(Schema.String),
}).annotate({ identifier: "PermissionRequest" })
export type PermissionRequest = typeof PermissionRequest.Type

export const PermissionReplyInput = Schema.Struct({
  reply: PermissionReply,
  message: Schema.optional(Schema.String),
}).annotate({ identifier: "PermissionReplyInput" })
export type PermissionReplyInput = typeof PermissionReplyInput.Type

export const SavedPermission = Schema.Struct({
  id: Schema.String,
  projectID: Schema.String,
  action: Schema.String,
  resource: Schema.String,
  created: Schema.Finite,
  updated: Schema.Finite,
}).annotate({ identifier: "SavedPermission" })
export type SavedPermission = typeof SavedPermission.Type

export const PermissionAskedEvent = Schema.Struct({
  type: Schema.Literal("permission.asked"),
  properties: PermissionRequest,
})
export const PermissionRepliedEvent = Schema.Struct({
  type: Schema.Literal("permission.replied"),
  properties: Schema.Struct({
    sessionID: Schema.String,
    requestID: Schema.String,
    reply: PermissionReply,
  }),
})
export const PermissionEvent = Schema.Union([PermissionAskedEvent, PermissionRepliedEvent])
export type PermissionEvent = typeof PermissionEvent.Type

export function parsePermissionRequest<TValue>(value: TValue): PermissionRequest | undefined {
  const parsed = Schema.decodeUnknownOption(PermissionRequest)(value)
  return Option.isSome(parsed) ? parsed.value : undefined
}

export function parsePermissionReplied<TValue>(value: TValue) {
  const parsed = Schema.decodeUnknownOption(PermissionRepliedEvent.fields.properties)(value)
  return Option.isSome(parsed) ? parsed.value : undefined
}

export function permissionReplyInput(reply: PermissionReply | PermissionReplyInput, message?: string): PermissionReplyInput {
  return Schema.is(PermissionReply)(reply) ? { reply, message } : reply
}
