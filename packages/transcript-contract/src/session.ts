import { Schema } from "effect"

export const SessionStatus = Schema.Union([
  Schema.Struct({ type: Schema.Literal("idle") }),
  Schema.Struct({ type: Schema.Literal("busy") }),
  Schema.Struct({
    type: Schema.Literal("retry"),
    attempt: Schema.Finite,
    message: Schema.String,
    next: Schema.Finite,
    action: Schema.optional(
      Schema.Struct({
        reason: Schema.String,
        provider: Schema.String,
        title: Schema.String,
        message: Schema.String,
        label: Schema.String,
        link: Schema.optional(Schema.String),
      }),
    ),
  }),
]).annotate({ identifier: "SessionStatus" })
export type SessionStatus = typeof SessionStatus.Type

export const Session = Schema.Struct({
  id: Schema.String,
  projectID: Schema.String,
  directory: Schema.String,
  parentID: Schema.optional(Schema.String),
  title: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
  time: Schema.Struct({
    created: Schema.Finite,
    updated: Schema.Finite,
    compacting: Schema.optional(Schema.Finite),
    archived: Schema.optional(Schema.Finite),
  }),
  revert: Schema.optional(
    Schema.Struct({
      messageID: Schema.String,
      partID: Schema.optional(Schema.String),
      snapshot: Schema.optional(Schema.String),
      diff: Schema.optional(Schema.String),
    }),
  ),
}).annotate({ identifier: "Session" })
export type Session = typeof Session.Type

export const SessionCreate = Schema.Struct({
  id: Schema.optional(Schema.String),
  parentID: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(
    Schema.Struct({
      providerID: Schema.String,
      modelID: Schema.String,
      variant: Schema.optional(Schema.String),
    }),
  ),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
}).annotate({ identifier: "SessionCreate" })
export type SessionCreate = typeof SessionCreate.Type
