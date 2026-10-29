import { Option, Schema } from "effect"

export const SubagentOutcome = Schema.Literals(["completed", "error", "cancelled"])
export type SubagentOutcome = typeof SubagentOutcome.Type

export const SubagentWorkerStatus = Schema.Literals(["running", "completed", "error", "cancelled"])
export type SubagentWorkerStatus = typeof SubagentWorkerStatus.Type

export const SubagentPresentation = Schema.Struct({
  ownerSessionID: Schema.String,
  messageID: Schema.String,
  callID: Schema.String,
  childSessionID: Schema.optional(Schema.String),
  agentID: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  background: Schema.Boolean,
  workerStatus: SubagentWorkerStatus,
  startedAt: Schema.Finite,
  result: Schema.optional(Schema.String),
}).annotate({ identifier: "SubagentPresentation" })
export type SubagentPresentation = typeof SubagentPresentation.Type

export const SubagentCompletion = Schema.Struct({
  ownerSessionID: Schema.String,
  childSessionID: Schema.String,
  messageID: Schema.String,
  createdAt: Schema.Finite,
  description: Schema.optional(Schema.String),
  agentName: Schema.optional(Schema.String),
  outcome: SubagentOutcome,
  result: Schema.String,
}).annotate({ identifier: "SubagentCompletion" })
export type SubagentCompletion = typeof SubagentCompletion.Type

const decodePresentation = Schema.decodeUnknownOption(SubagentPresentation)
const decodeCompletion = Schema.decodeUnknownOption(SubagentCompletion)

export function readSubagentPresentation<TValue>(value: TValue): SubagentPresentation | undefined {
  return Option.getOrUndefined(decodePresentation(value))
}

export function readSubagentCompletion<TValue>(value: TValue): SubagentCompletion | undefined {
  return Option.getOrUndefined(decodeCompletion(value))
}
