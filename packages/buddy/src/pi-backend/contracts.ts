import z from "zod"

export const BUDDY_PROMPT_CUSTOM_TYPE = "buddy-user-prompt" as const

const BuddyMessageModelSchema = z.object({
  providerID: z.string(),
  modelID: z.string(),
  variant: z.string().optional(),
})

const BuddyTokenUsageSchema = z.object({
  total: z.number().optional(),
  input: z.number(),
  output: z.number(),
  reasoning: z.number(),
  cache: z.object({
    read: z.number(),
    write: z.number(),
  }),
})

const BuddyUserMessageInfoSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("user"),
  time: z.object({
    created: z.number(),
  }),
  agent: z.string(),
  model: BuddyMessageModelSchema,
  tools: z.record(z.string(), z.boolean()).optional(),
})

const BuddyAssistantMessageInfoSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("assistant"),
  time: z.object({
    created: z.number(),
    completed: z.number().optional(),
  }),
  error: z
    .object({
      name: z.string(),
      message: z.string().optional(),
      data: z.unknown().optional(),
    })
    .optional(),
  parentID: z.string(),
  modelID: z.string(),
  providerID: z.string(),
  mode: z.string(),
  agent: z.string(),
  path: z.object({
    cwd: z.string(),
    root: z.string(),
  }),
  cost: z.number(),
  tokens: BuddyTokenUsageSchema,
  variant: z.string().optional(),
  finish: z.string().optional(),
})

const BuddyTextPartSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  type: z.literal("text"),
  text: z.string(),
  time: z
    .object({
      start: z.number(),
      end: z.number().optional(),
    })
    .optional(),
})

const BuddyReasoningPartSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  type: z.literal("reasoning"),
  text: z.string(),
  time: z.object({
    start: z.number(),
    end: z.number().optional(),
  }),
})

const BuddyFilePartSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  type: z.literal("file"),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
})

const BuddyToolPendingStateSchema = z.object({
  status: z.literal("pending"),
  input: z.record(z.string(), z.unknown()),
  raw: z.string(),
})

const BuddyToolRunningStateSchema = z.object({
  status: z.literal("running"),
  input: z.record(z.string(), z.unknown()),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({
    start: z.number(),
  }),
})

const BuddyToolCompletedStateSchema = z.object({
  status: z.literal("completed"),
  input: z.record(z.string(), z.unknown()),
  output: z.string(),
  title: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  time: z.object({
    start: z.number(),
    end: z.number(),
    compacted: z.number().optional(),
  }),
  attachments: z.array(BuddyFilePartSchema).optional(),
})

const BuddyToolErrorStateSchema = z.object({
  status: z.literal("error"),
  input: z.record(z.string(), z.unknown()),
  error: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({
    start: z.number(),
    end: z.number(),
  }),
})

const BuddyToolPartSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  type: z.literal("tool"),
  callID: z.string(),
  tool: z.string(),
  state: z.discriminatedUnion("status", [
    BuddyToolPendingStateSchema,
    BuddyToolRunningStateSchema,
    BuddyToolCompletedStateSchema,
    BuddyToolErrorStateSchema,
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const BuddyMessageInfoSchema = z.discriminatedUnion("role", [
  BuddyUserMessageInfoSchema,
  BuddyAssistantMessageInfoSchema,
])

const BuddyMessagePartSchema = z.discriminatedUnion("type", [
  BuddyTextPartSchema,
  BuddyReasoningPartSchema,
  BuddyFilePartSchema,
  BuddyToolPartSchema,
])

const BuddyMessageWithPartsSchema = z.object({
  info: BuddyMessageInfoSchema,
  parts: z.array(BuddyMessagePartSchema),
})

const BuddySessionInfoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  projectID: z.string(),
  workspaceID: z.string().optional(),
  directory: z.string(),
  path: z.string().optional(),
  parentID: z.string().optional(),
  title: z.string(),
  agent: z.string().optional(),
  model: z
    .object({
      id: z.string(),
      providerID: z.string(),
      variant: z.string().optional(),
    })
    .optional(),
  version: z.string(),
  cost: z.number().optional(),
  tokens: BuddyTokenUsageSchema.optional(),
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
})

const BuddySessionStatusSchema = z.object({
  type: z.enum(["busy", "idle", "retry"]),
})

const BuddySessionStatusMapSchema = z.record(z.string(), BuddySessionStatusSchema)

const BuddySessionCreateSchema = z.object({}).passthrough().optional()

const PiTextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  textSignature: z.string().optional(),
})

const PiThinkingContentSchema = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
  thinkingSignature: z.string().optional(),
  redacted: z.boolean().optional(),
})

const PiImageContentSchema = z.object({
  type: z.literal("image"),
  data: z.string(),
  mimeType: z.string(),
})

const PiToolCallContentSchema = z.object({
  type: z.literal("toolCall"),
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  thoughtSignature: z.string().optional(),
})

const PiUserContentSchema = z.union([
  z.string(),
  z.array(z.union([PiTextContentSchema, PiImageContentSchema])),
])

const PiCustomContentSchema = z.union([
  z.string(),
  z.array(z.union([PiTextContentSchema, PiImageContentSchema])),
])

const PiUsageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  totalTokens: z.number(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    total: z.number(),
  }),
})

const PiUserMessageSchema = z.object({
  role: z.literal("user"),
  content: PiUserContentSchema,
  timestamp: z.number(),
})

const PiAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.array(
    z.union([PiTextContentSchema, PiThinkingContentSchema, PiToolCallContentSchema]),
  ),
  api: z.string(),
  provider: z.string(),
  model: z.string(),
  responseModel: z.string().optional(),
  responseId: z.string().optional(),
  diagnostics: z.array(z.unknown()).optional(),
  usage: PiUsageSchema,
  stopReason: z.enum(["stop", "length", "toolUse", "error", "aborted"]),
  errorMessage: z.string().optional(),
  timestamp: z.number(),
})

const PiToolResultMessageSchema = z.object({
  role: z.literal("toolResult"),
  toolCallId: z.string(),
  toolName: z.string(),
  content: z.array(z.union([PiTextContentSchema, PiImageContentSchema])),
  details: z.unknown().optional(),
  isError: z.boolean(),
  timestamp: z.number(),
})

const BuddyPromptTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const BuddyPromptFilePartSchema = z.object({
  type: z.literal("file"),
  mime: z.string(),
  url: z.string(),
  filename: z.string().optional(),
})

const BuddyPromptAgentPartSchema = z.object({
  type: z.literal("agent"),
  name: z.string(),
})

const BuddyPromptPartSchema = z.discriminatedUnion("type", [
  BuddyPromptTextPartSchema,
  BuddyPromptFilePartSchema,
  BuddyPromptAgentPartSchema,
])

const BuddyPromptMessageModelSchema = z.object({
  providerID: z.string(),
  modelID: z.string(),
  variant: z.string().optional(),
})

const BuddyPromptCustomMessageDetailsSchema = z.object({
  kind: z.literal(BUDDY_PROMPT_CUSTOM_TYPE),
  parts: z.array(BuddyPromptPartSchema),
  agent: z.string().optional(),
  messageID: z.string().optional(),
  model: BuddyPromptMessageModelSchema.optional(),
})

const BuddyPromptCustomMessageSchema = z.object({
  role: z.literal("custom"),
  customType: z.literal(BUDDY_PROMPT_CUSTOM_TYPE),
  content: PiCustomContentSchema,
  display: z.boolean(),
  details: BuddyPromptCustomMessageDetailsSchema,
  timestamp: z.number(),
})

const PiGenericCustomMessageSchema = z.object({
  role: z.literal("custom"),
  customType: z.string(),
  content: PiCustomContentSchema,
  display: z.boolean(),
  details: z.unknown().optional(),
  timestamp: z.number(),
})

const PiBashExecutionMessageSchema = z.object({
  role: z.literal("bashExecution"),
  command: z.string(),
  output: z.string(),
  exitCode: z.number().optional(),
  cancelled: z.boolean(),
  truncated: z.boolean(),
  fullOutputPath: z.string().optional(),
  timestamp: z.number(),
  excludeFromContext: z.boolean().optional(),
})

const PiBranchSummaryMessageSchema = z.object({
  role: z.literal("branchSummary"),
  summary: z.string(),
  fromId: z.string(),
  timestamp: z.number(),
})

const PiCompactionSummaryMessageSchema = z.object({
  role: z.literal("compactionSummary"),
  summary: z.string(),
  tokensBefore: z.number(),
  timestamp: z.number(),
})

const PiTranscriptMessageSchema = z.union([
  PiUserMessageSchema,
  PiAssistantMessageSchema,
  PiToolResultMessageSchema,
  BuddyPromptCustomMessageSchema,
  PiGenericCustomMessageSchema,
  PiBashExecutionMessageSchema,
  PiBranchSummaryMessageSchema,
  PiCompactionSummaryMessageSchema,
])

const PiTranscriptEntrySchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  message: PiTranscriptMessageSchema,
})

export {
  BuddyAssistantMessageInfoSchema,
  BuddyMessageInfoSchema,
  BuddyMessageModelSchema,
  BuddyMessagePartSchema,
  BuddyMessageWithPartsSchema,
  BuddyPromptCustomMessageDetailsSchema,
  BuddyPromptMessageModelSchema,
  BuddyPromptCustomMessageSchema,
  BuddyPromptPartSchema,
  BuddySessionCreateSchema,
  BuddySessionInfoSchema,
  BuddySessionStatusMapSchema,
  BuddySessionStatusSchema,
  BuddyToolPartSchema,
  BuddyTokenUsageSchema,
  BuddyUserMessageInfoSchema,
  PiAssistantMessageSchema,
  PiBashExecutionMessageSchema,
  PiBranchSummaryMessageSchema,
  PiCompactionSummaryMessageSchema,
  PiGenericCustomMessageSchema,
  PiTextContentSchema,
  PiThinkingContentSchema,
  PiImageContentSchema,
  PiToolCallContentSchema,
  PiToolResultMessageSchema,
  PiTranscriptEntrySchema,
  PiTranscriptMessageSchema,
  PiUsageSchema,
  PiUserMessageSchema,
}

export type BuddyMessageModel = z.infer<typeof BuddyMessageModelSchema>
export type BuddyTokenUsage = z.infer<typeof BuddyTokenUsageSchema>
export type BuddyUserMessageInfo = z.infer<typeof BuddyUserMessageInfoSchema>
export type BuddyAssistantMessageInfo = z.infer<typeof BuddyAssistantMessageInfoSchema>
export type BuddyMessageInfo = z.infer<typeof BuddyMessageInfoSchema>
export type BuddyMessagePart = z.infer<typeof BuddyMessagePartSchema>
export type BuddyMessageWithParts = z.infer<typeof BuddyMessageWithPartsSchema>
export type BuddyPromptCustomMessageDetails = z.infer<typeof BuddyPromptCustomMessageDetailsSchema>
export type BuddyPromptMessageModel = z.infer<typeof BuddyPromptMessageModelSchema>
export type BuddyPromptCustomMessage = z.infer<typeof BuddyPromptCustomMessageSchema>
export type BuddyPromptPart = z.infer<typeof BuddyPromptPartSchema>
export type BuddySessionInfo = z.infer<typeof BuddySessionInfoSchema>
export type BuddySessionStatus = z.infer<typeof BuddySessionStatusSchema>
export type BuddySessionStatusMap = z.infer<typeof BuddySessionStatusMapSchema>
export type BuddyToolPart = z.infer<typeof BuddyToolPartSchema>
export type BuddyToolPartState = BuddyToolPart["state"]
export type PiAssistantMessage = z.infer<typeof PiAssistantMessageSchema>
export type PiBashExecutionMessage = z.infer<typeof PiBashExecutionMessageSchema>
export type PiBranchSummaryMessage = z.infer<typeof PiBranchSummaryMessageSchema>
export type PiCompactionSummaryMessage = z.infer<typeof PiCompactionSummaryMessageSchema>
export type PiGenericCustomMessage = z.infer<typeof PiGenericCustomMessageSchema>
export type PiImageContent = z.infer<typeof PiImageContentSchema>
export type PiTextContent = z.infer<typeof PiTextContentSchema>
export type PiThinkingContent = z.infer<typeof PiThinkingContentSchema>
export type PiToolCallContent = z.infer<typeof PiToolCallContentSchema>
export type PiToolResultMessage = z.infer<typeof PiToolResultMessageSchema>
export type PiTranscriptEntry = z.infer<typeof PiTranscriptEntrySchema>
export type PiTranscriptMessage = z.infer<typeof PiTranscriptMessageSchema>
export type PiUsage = z.infer<typeof PiUsageSchema>
export type PiUserMessage = z.infer<typeof PiUserMessageSchema>
