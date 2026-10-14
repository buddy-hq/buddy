import { Schema } from "effect"
import { SubagentCompletion, SubagentPresentation } from "./subagent"

const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
const Metadata = Schema.optional(JsonObject)
const OptionalString = Schema.optional(Schema.String)
const MessageTime = Schema.Struct({
  created: Schema.Finite,
  completed: Schema.optional(Schema.Finite),
})
const MessageBase = {
  id: Schema.String,
  sessionID: Schema.String,
  time: MessageTime,
  metadata: Metadata,
}
const PartBase = {
  id: Schema.String,
  sessionID: Schema.String,
  messageID: Schema.String,
  metadata: Metadata,
}

export const OutputFormat = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text") }),
  Schema.Struct({
    type: Schema.Literal("json_schema"),
    schema: JsonObject,
    retryCount: Schema.optional(Schema.NullOr(Schema.Finite)),
  }),
]).annotate({ identifier: "OutputFormat" })
export type OutputFormat = typeof OutputFormat.Type

export const MessageError = Schema.Struct({
  name: Schema.String,
  message: OptionalString,
  data: Schema.Struct({
    message: Schema.String,
    providerID: OptionalString,
    statusCode: Schema.optional(Schema.Finite),
    isRetryable: Schema.optional(Schema.Boolean),
    responseBody: OptionalString,
  }),
}).annotate({ identifier: "MessageError" })
export type MessageError = typeof MessageError.Type

export const TokenUsage = Schema.Struct({
  total: Schema.optional(Schema.NullOr(Schema.Finite)),
  input: Schema.Finite,
  output: Schema.Finite,
  reasoning: Schema.Finite,
  cache: Schema.Struct({ read: Schema.Finite, write: Schema.Finite }),
}).annotate({ identifier: "TokenUsage" })

export const UserMessage = Schema.Struct({
  ...MessageBase,
  role: Schema.Literal("user"),
  agent: Schema.String,
  model: Schema.Struct({
    providerID: Schema.String,
    modelID: Schema.String,
    variant: OptionalString,
  }),
  format: Schema.optional(OutputFormat),
  system: Schema.optional(Schema.NullOr(Schema.String)),
  tools: Schema.optional(Schema.NullOr(Schema.Record(Schema.String, Schema.Boolean))),
}).annotate({ identifier: "UserMessage" })
export type UserMessage = typeof UserMessage.Type

export const AssistantMessage = Schema.Struct({
  ...MessageBase,
  role: Schema.Literal("assistant"),
  parentID: Schema.String,
  modelID: Schema.String,
  providerID: Schema.String,
  mode: Schema.String,
  agent: Schema.String,
  path: Schema.Struct({ cwd: Schema.String, root: Schema.String }),
  cost: Schema.Finite,
  tokens: TokenUsage,
  error: Schema.optional(MessageError),
  finish: Schema.optional(Schema.NullOr(Schema.String)),
  variant: Schema.optional(Schema.NullOr(Schema.String)),
  summary: Schema.optional(Schema.NullOr(Schema.Boolean)),
  structured: Schema.optional(Schema.Unknown),
  kind: Schema.optional(Schema.Literals(["synthetic", "skill", "shell", "compaction"])),
  description: OptionalString,
}).annotate({ identifier: "AssistantMessage" })
export type AssistantMessage = typeof AssistantMessage.Type

export const Message = Schema.Union([UserMessage, AssistantMessage]).annotate({ identifier: "Message" })
export type Message = typeof Message.Type

export const TextPart = Schema.Struct({
  ...PartBase,
  type: Schema.Literal("text"),
  text: Schema.String,
  synthetic: Schema.optional(Schema.Boolean),
  ignored: Schema.optional(Schema.Boolean),
  time: Schema.optional(Schema.Struct({ start: Schema.Finite, end: Schema.optional(Schema.Finite) })),
}).annotate({ identifier: "TextPart" })
export type TextPart = typeof TextPart.Type

export const ReasoningPart = Schema.Struct({
  ...PartBase,
  type: Schema.Literal("reasoning"),
  text: Schema.String,
  time: Schema.Struct({ start: Schema.Finite, end: Schema.optional(Schema.Finite) }),
}).annotate({ identifier: "ReasoningPart" })
export type ReasoningPart = typeof ReasoningPart.Type

const SourceText = Schema.Struct({ value: Schema.String, start: Schema.Finite, end: Schema.Finite })
export const FileSource = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["file", "symbol"]), path: Schema.String, text: Schema.optional(SourceText) }),
  Schema.Struct({ type: Schema.Literal("resource"), clientName: Schema.String, uri: Schema.String, text: Schema.optional(SourceText) }),
  Schema.Struct({ type: Schema.Literal("inline"), text: Schema.optional(SourceText) }),
  Schema.Struct({ type: Schema.Literal("uri"), uri: Schema.String, text: Schema.optional(SourceText) }),
]).annotate({ identifier: "FileSource" })
export type FileSource = typeof FileSource.Type

export const FilePart = Schema.Struct({
  ...PartBase,
  type: Schema.Literal("file"),
  mime: Schema.String,
  filename: OptionalString,
  url: Schema.String,
  source: Schema.optional(FileSource),
}).annotate({ identifier: "FilePart" })
export type FilePart = typeof FilePart.Type

export const AgentPart = Schema.Struct({
  ...PartBase,
  type: Schema.Literal("agent"),
  name: Schema.String,
  source: Schema.optional(Schema.Struct({ value: Schema.String, start: Schema.Finite, end: Schema.Finite })),
}).annotate({ identifier: "AgentPart" })
export type AgentPart = typeof AgentPart.Type

const ToolTime = Schema.Struct({
  start: Schema.Finite,
  end: Schema.optional(Schema.Finite),
  compacted: Schema.optional(Schema.Finite),
})
const ToolStateBase = { input: JsonObject, metadata: Metadata, raw: OptionalString }
export const ToolState = Schema.Union([
  Schema.Struct({ ...ToolStateBase, status: Schema.Literal("pending"), raw: Schema.String }),
  Schema.Struct({ ...ToolStateBase, status: Schema.Literal("running"), metadata: JsonObject, title: OptionalString, time: ToolTime }),
  Schema.Struct({
    ...ToolStateBase,
    status: Schema.Literal("completed"),
    metadata: JsonObject,
    output: Schema.String,
    title: OptionalString,
    time: ToolTime,
    attachments: Schema.optional(Schema.Array(FilePart)),
  }),
  Schema.Struct({ ...ToolStateBase, status: Schema.Literal("error"), error: Schema.String, errorType: OptionalString, time: ToolTime }),
]).annotate({ identifier: "ToolState" })
export type ToolState = typeof ToolState.Type

export const ToolPart = Schema.Struct({
  ...PartBase,
  type: Schema.Literal("tool"),
  callID: Schema.String,
  tool: Schema.String,
  state: ToolState,
  subagent: Schema.optional(SubagentPresentation),
}).annotate({ identifier: "ToolPart" })
export type ToolPart = typeof ToolPart.Type

export const NoticePart = Schema.Struct({
  ...PartBase,
  type: Schema.Literal("notice"),
  text: Schema.String,
  source: OptionalString,
  status: OptionalString,
  completion: Schema.optional(SubagentCompletion),
}).annotate({ identifier: "NoticePart" })

export const CompactionPart = Schema.Struct({
  ...PartBase,
  type: Schema.Literal("compaction"),
  auto: Schema.Boolean,
  status: Schema.Literals(["running", "completed", "failed"]),
  error: OptionalString,
}).annotate({ identifier: "CompactionPart" })

export const StepStartPart = Schema.Struct({
  ...PartBase, type: Schema.Literal("step-start"), snapshot: OptionalString,
}).annotate({ identifier: "StepStartPart" })
export const StepFinishPart = Schema.Struct({
  ...PartBase,
  type: Schema.Literal("step-finish"),
  reason: Schema.String,
  cost: Schema.Finite,
  tokens: TokenUsage,
  snapshot: OptionalString,
}).annotate({ identifier: "StepFinishPart" })
export const PatchPart = Schema.Struct({
  ...PartBase, type: Schema.Literal("patch"), hash: Schema.String, files: Schema.Array(Schema.String),
}).annotate({ identifier: "PatchPart" })

export const Part = Schema.Union([
  TextPart, ReasoningPart, FilePart, AgentPart, ToolPart, NoticePart, CompactionPart,
  StepStartPart, StepFinishPart, PatchPart,
]).annotate({ identifier: "Part" })
export type Part = typeof Part.Type

export const MessageWithParts = Schema.Struct({
  info: Message,
  parts: Schema.Array(Part),
}).annotate({ identifier: "MessageWithParts" })
export type MessageWithParts = typeof MessageWithParts.Type
