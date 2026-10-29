import { z } from "zod"
import {
  messageErrorDataSchema,
  type MessageInfo,
  type MessagePart,
  type QuestionRequest,
  type SessionInfo,
} from "@/state/chat-types"

const SnapshotFileDiffSchema = z.object({
  file: z.string().optional(),
  patch: z.string().optional(),
  additions: z.number(),
  deletions: z.number(),
  status: z.enum(["added", "deleted", "modified"]).optional(),
})

const MessageTimeSchema = z.object({
  created: z.number(),
  completed: z.number().nullable().optional(),
})

const MessageModelSchema = z.object({
  providerID: z.string(),
  modelID: z.string(),
  variant: z.string().nullable().optional(),
})

const MessageErrorSchema = z.object({
  name: z.string(),
  message: z.string().optional(),
  code: z.string().optional(),
  anonymousCode: z.string().optional(),
  limit: z
    .object({
      plan: z.string().optional(),
      resetsAt: z.number().optional(),
      resetsInSeconds: z.number().optional(),
    })
    .optional(),
  data: messageErrorDataSchema.optional(),
})

const OutputFormatSchema = z.union([
  z.object({ type: z.literal("text") }),
  z.object({
    type: z.literal("json_schema"),
    schema: z.record(z.string(), z.unknown()),
    retryCount: z.number().nullable().optional(),
  }),
])

const UserMessageInfoSchema = z.looseObject({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("user"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: MessageTimeSchema,
  format: OutputFormatSchema.nullable().optional(),
  summary: z
    .object({
      title: z.string().nullable().optional(),
      body: z.string().nullable().optional(),
      diffs: z.array(SnapshotFileDiffSchema),
    })
    .nullable()
    .optional(),
  agent: z.string(),
  model: MessageModelSchema,
  system: z.string().nullable().optional(),
  tools: z.record(z.string(), z.boolean()).nullable().optional(),
})

const TokenUsageSchema = z.object({
  total: z.number().nullable().optional(),
  input: z.number(),
  output: z.number(),
  reasoning: z.number(),
  cache: z.object({
    read: z.number(),
    write: z.number(),
  }),
})

const AssistantMessageInfoSchema = z.looseObject({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("assistant"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  kind: z.enum(["synthetic", "skill", "shell", "compaction"]).optional(),
  description: z.string().optional(),
  time: MessageTimeSchema,
  error: MessageErrorSchema.nullable().optional(),
  parentID: z.string(),
  modelID: z.string(),
  providerID: z.string(),
  mode: z.string(),
  agent: z.string(),
  path: z.object({ cwd: z.string(), root: z.string() }),
  summary: z.boolean().nullable().optional(),
  cost: z.number(),
  tokens: TokenUsageSchema,
  structured: z.unknown().nullable().optional(),
  variant: z.string().nullable().optional(),
  finish: z.string().nullable().optional(),
})

export const MessageInfoEventSchema = z.union([
  UserMessageInfoSchema,
  AssistantMessageInfoSchema,
]) satisfies z.ZodType<MessageInfo>

/** A finished tool call that can create, move, or delete notebook files. */
export const FileChangingToolCompletionSchema = z.looseObject({
  type: z.literal("tool"),
  state: z.looseObject({
    filesChanged: z.literal(true),
    summary: z.looseObject({ kind: z.string() }).optional(),
  }),
})

export const MessagePartEventSchema = z.looseObject({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  type: z.string(),
}) satisfies z.ZodType<MessagePart>

export const SessionInfoEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  parentID: z.string().optional(),
  time: z.object({
    created: z.number(),
    updated: z.number(),
    compacting: z.number().optional(),
    archived: z.number().optional(),
  }),
  revert: z
    .object({
      messageID: z.string(),
      partID: z.string().optional(),
      snapshot: z.string().optional(),
      diff: z.string().optional(),
    })
    .optional(),
}) satisfies z.ZodType<SessionInfo>

export const QuestionRequestEventSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      header: z.string(),
      options: z.array(
        z.object({
          label: z.string(),
          description: z.string(),
        }),
      ),
      multiple: z.boolean().optional(),
      custom: z.boolean().optional(),
    }),
  ),
  // Nullable because origin cast this payload
  // (`properties as QuestionRequest`) without validating, so a `tool: null` still reached the
  // question dock; a bare `.optional()` rejects it and use-chat-sync drops the whole ask.
  tool: z
    .object({
      messageID: z.string(),
      callID: z.string(),
    })
    .nullable()
    .optional(),
}) satisfies z.ZodType<QuestionRequest>
