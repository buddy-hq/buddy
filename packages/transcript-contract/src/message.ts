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
  order: OptionalString,
  sessionID: Schema.String,
  time: MessageTime,
  metadata: Metadata,
}
const PartBase = {
  sourceText: OptionalString,
  id: Schema.String,
  sessionID: Schema.String,
  messageID: Schema.String,
  position: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
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

const messageErrorCode = Schema.Literals([
  "auth", "credits_exhausted", "quota_exceeded", "rate_limited", "temporarily_unavailable",
  "model_unavailable", "region_blocked", "access_denied", "network", "context_limit",
  "content_blocked", "invalid_output", "output_limit", "stopped", "unknown",
])

export const MessageError = Schema.Struct({
  name: Schema.String,
  message: OptionalString,
  code: Schema.optional(messageErrorCode),
  anonymousCode: Schema.optional(messageErrorCode).annotate({ description: "Alternate code when the bundled provider is used without credentials" }),
  limit: Schema.optional(Schema.Struct({
    plan: OptionalString,
    resetsAt: Schema.optional(Schema.Finite).annotate({ description: "Reset time in Unix seconds" }),
    resetsInSeconds: Schema.optional(Schema.Finite),
  })),
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
  sourceText: OptionalString,
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
  usageRecorded: Schema.optional(Schema.Boolean),
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
export const FileChange = Schema.Struct({
  path: OptionalString,
  relativePath: OptionalString,
  kind: Schema.optional(Schema.Literals(["add", "update", "delete", "move"])),
  patch: OptionalString,
  before: OptionalString,
  after: OptionalString,
  content: OptionalString,
  additions: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  deletions: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
}).annotate({ identifier: "FileChange" })
export type FileChange = typeof FileChange.Type

export const ToolSummary = Schema.Struct({
  kind: Schema.String,
  subject: OptionalString,
  detail: OptionalString,
  agent: OptionalString,
  args: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.Union([Schema.String, Schema.Finite]) }))),
  items: Schema.optional(Schema.Array(Schema.String)),
  requested: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  result: Schema.optional(Schema.Struct({
    unit: Schema.String,
    count: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    text: OptionalString,
    truncated: Schema.optional(Schema.Boolean),
  })),
}).annotate({ identifier: "ToolSummary" })
export type ToolSummary = typeof ToolSummary.Type

export const ToolOutcome = Schema.Union([
  Schema.Struct({ type: Schema.Literal("rejected"), message: OptionalString }),
  Schema.Struct({ type: Schema.Literal("interrupted") }),
  Schema.Struct({ type: Schema.Literal("dismissed") }),
]).annotate({ identifier: "ToolOutcome" })
export type ToolOutcome = typeof ToolOutcome.Type

const ToolTodo = Schema.Struct({
  text: Schema.String,
  status: Schema.Literals(["pending", "in_progress", "completed", "cancelled"]),
  priority: OptionalString,
})
const ToolQuestion = Schema.Struct({
  text: Schema.String,
  header: OptionalString,
  options: Schema.Array(Schema.Struct({ label: Schema.String, description: OptionalString })),
  multiple: Schema.optional(Schema.Boolean),
  answers: Schema.optional(Schema.Array(Schema.String)),
})
export type ToolTodo = typeof ToolTodo.Type
export type ToolQuestion = typeof ToolQuestion.Type

const ToolStateBase = {
  input: JsonObject,
  metadata: Metadata,
  raw: OptionalString,
  fileChanges: Schema.optional(Schema.Array(FileChange)),
  filesChanged: Schema.optional(Schema.Boolean),
  summary: Schema.optional(ToolSummary),
  shell: Schema.optional(Schema.Struct({ command: OptionalString, output: OptionalString })),
  todos: Schema.optional(Schema.Array(ToolTodo)),
  questions: Schema.optional(Schema.Array(ToolQuestion)),
  skillContent: OptionalString,
  outcome: Schema.optional(ToolOutcome),
}
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
  summary: OptionalString,
  recent: OptionalString,
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
