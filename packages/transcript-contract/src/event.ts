import { Schema } from "effect"
import { Message, MessageError, Part } from "./message"
import { Session, SessionStatus } from "./session"

const sessionID = { sessionID: Schema.String }
const messageID = { ...sessionID, messageID: Schema.String }
const partID = { ...messageID, partID: Schema.String }

export const TranscriptEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["session.created", "session.updated"]), properties: Schema.Struct({ info: Session }) }),
  Schema.Struct({ type: Schema.Literal("session.deleted"), properties: Schema.Struct(sessionID) }),
  Schema.Struct({ type: Schema.Literal("session.status"), properties: Schema.Struct({ ...sessionID, status: SessionStatus }) }),
  Schema.Struct({ type: Schema.Literal("session.error"), properties: Schema.Struct({ ...sessionID, error: MessageError }) }),
  Schema.Struct({ type: Schema.Literal("session.resync"), properties: Schema.Struct(sessionID) }),
  Schema.Struct({ type: Schema.Literal("message.updated"), properties: Schema.Struct({ info: Message }) }),
  Schema.Struct({ type: Schema.Literal("message.removed"), properties: Schema.Struct(messageID) }),
  Schema.Struct({ type: Schema.Literal("message.part.updated"), properties: Schema.Struct({ part: Part }) }),
  Schema.Struct({ type: Schema.Literal("message.part.removed"), properties: Schema.Struct(partID) }),
  Schema.Struct({ type: Schema.Literal("message.part.delta"), properties: Schema.Struct({ ...partID, field: Schema.String, delta: Schema.String }) }),
]).annotate({ identifier: "TranscriptEvent" })
export type TranscriptEvent = typeof TranscriptEvent.Type

export const EventProperties = Schema.Record(Schema.String, Schema.Unknown)

export const BuddyEvent = Schema.Struct({
  directory: Schema.optional(Schema.String),
  payload: Schema.Struct({ type: Schema.String, properties: EventProperties }),
}).annotate({ identifier: "BuddyEvent" })
export type BuddyEvent = typeof BuddyEvent.Type
