import z from "zod"

const LearnerMemoryRetentionTypeSchema = z.enum(["semantic", "procedural", "episodic", "flashbulb"])
type LearnerMemoryRetentionType = z.infer<typeof LearnerMemoryRetentionTypeSchema>

const LearnerMemoryTypeSchema = z.enum([
  "preference",
  "constraint",
  "goal",
  "evidence",
  "fragile_skill",
  "misconception",
  "project_context",
  "open_loop",
])
type LearnerMemoryType = z.infer<typeof LearnerMemoryTypeSchema>

const LearnerMemoryStatusSchema = z.enum(["active", "hidden", "rejected", "resolved", "stale"])
type LearnerMemoryStatus = z.infer<typeof LearnerMemoryStatusSchema>

const LearnerMemorySourceSchema = z.enum([
  "fixture",
  "deterministic",
  "model_candidate",
  "learner_authored",
  "debug",
  "system",
])
type LearnerMemorySource = z.infer<typeof LearnerMemorySourceSchema>

const LearnerMemorySchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  memoryType: LearnerMemoryRetentionTypeSchema.default("semantic"),
  pedagogyKind: LearnerMemoryTypeSchema.default("evidence"),
  type: LearnerMemoryTypeSchema,
  status: LearnerMemoryStatusSchema,
  pinned: z.boolean().default(false),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)),
  projectPath: z.string().optional(),
  confidence: z.number().min(0).max(1),
  strength: z.number().min(0).max(1).default(0.5),
  lastUsedAt: z.string().datetime().optional(),
  supersededById: z.string().min(1).optional(),
  source: LearnerMemorySourceSchema,
  sourceEventIds: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
type LearnerMemory = z.infer<typeof LearnerMemorySchema>

const LearnerEventTypeSchema = z.enum([
  "fixture_session",
  "candidate_generated",
  "memory_applied",
  "memory_rejected",
  "memory_hidden",
  "memory_edited",
  "memory_deleted",
  "memory_reset",
  "memory_resolved",
  "memory_stale",
  "memory_strengthened",
  "memory_decayed",
  "memory_pinned",
  "memory_unpinned",
  "memory_superseded",
  "memory_used",
  "learner_context_delivered",
  "session_extraction_scanned",
  "session_extraction_skipped",
  "session_summary_written",
  "profile_updated",
  "memory_repaired",
  "goal_committed",
  "question_set_attempt_ingested",
  "flashcard_review_ingested",
  "task_checkpoint_ingested",
])
type LearnerEventType = z.infer<typeof LearnerEventTypeSchema>

const LearnerEventSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  type: LearnerEventTypeSchema,
  createdAt: z.string().datetime(),
  sessionId: z.string().optional(),
  projectPath: z.string().optional(),
  sourceKind: z.string().min(1),
  sourceId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
  searchableText: z.string(),
})
type LearnerEvent = z.infer<typeof LearnerEventSchema>

const LearnerEvidenceEffectSchema = z.object({
  memoryId: z.string().min(1).optional(),
  effect: z.enum(["created", "reinforced", "weakened", "resolved", "noted"]),
  reason: z.string().min(1),
})
type LearnerEvidenceEffect = z.infer<typeof LearnerEvidenceEffectSchema>

const LearnerEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  kind: z.string().min(1),
  createdAt: z.string().datetime(),
  sessionId: z.string().optional(),
  projectPath: z.string().optional(),
  artifactId: z.string().min(1).optional(),
  title: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  note: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  memoryEffects: z.array(LearnerEvidenceEffectSchema).default([]),
})
type LearnerEvidence = z.infer<typeof LearnerEvidenceSchema>

const LearnerMemorySourcePointerSchema = z.object({
  eventId: z.string().min(1),
  note: z.string().min(1),
  path: z.string().min(1),
})
type LearnerMemorySourcePointer = z.infer<typeof LearnerMemorySourcePointerSchema>

const LearnerIndexMemoryRowSchema = z.object({
  memoryId: z.string().min(1),
  title: z.string().min(1),
  memoryType: LearnerMemoryRetentionTypeSchema,
  pedagogyKind: LearnerMemoryTypeSchema,
  type: LearnerMemoryTypeSchema,
  status: LearnerMemoryStatusSchema,
  pinned: z.boolean(),
  projectPath: z.string().optional(),
  strength: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  updatedAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().optional(),
  path: z.string().min(1),
})
type LearnerIndexMemoryRow = z.infer<typeof LearnerIndexMemoryRowSchema>

const LearnerIndexEventRowSchema = z.object({
  eventId: z.string().min(1),
  type: LearnerEventTypeSchema,
  createdAt: z.string().datetime(),
  sessionId: z.string().optional(),
  projectPath: z.string().optional(),
  path: z.string().min(1),
})
type LearnerIndexEventRow = z.infer<typeof LearnerIndexEventRowSchema>

const CandidatePatchOperationSchema = z.enum(["create", "reinforce", "weaken", "resolve", "reject"])
type CandidatePatchOperation = z.infer<typeof CandidatePatchOperationSchema>

const CandidateMemoryPatchSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  fixtureId: z.string().min(1),
  operation: CandidatePatchOperationSchema,
  memoryType: LearnerMemoryTypeSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  sourceMessageIds: z.array(z.string().min(1)),
  sourceEventIds: z.array(z.string().min(1)),
  rationale: z.string().min(1),
})
type CandidateMemoryPatch = z.infer<typeof CandidateMemoryPatchSchema>

const LearnerMemoryModelUsageSchema = z.object({
  cost: z.number().nonnegative(),
  tokens: z.object({
    total: z.number().int().nonnegative().optional(),
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    reasoning: z.number().int().nonnegative(),
    cache: z.object({
      read: z.number().int().nonnegative(),
      write: z.number().int().nonnegative(),
    }),
  }),
})
type LearnerMemoryModelUsage = z.infer<typeof LearnerMemoryModelUsageSchema>

const LearnerMemoryStageOneOutputSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  sessionId: z.string().min(1),
  projectPath: z.string().min(1),
  sourceUpdatedAt: z.string().datetime(),
  sourceMessageCount: z.number().int().nonnegative(),
  sourceFingerprint: z.string().min(1),
  attentionDecision: z
    .object({
      fixtureId: z.string().min(1),
      decision: z.enum(["skip", "extract"]),
      score: z.number(),
      reasons: z.array(z.string()),
    })
    .optional(),
  truncation: z
    .object({
      truncated: z.boolean(),
      estimatedOriginalTokens: z.number().int().nonnegative(),
      estimatedKeptTokens: z.number().int().nonnegative(),
    })
    .optional(),
  rolloutSummary: z.string(),
  rolloutSlug: z.string().min(1).optional(),
  rawMemory: z.string(),
  candidatePatches: z.array(CandidateMemoryPatchSchema),
  extractionModel: z
    .object({
      providerID: z.string().min(1),
      modelID: z.string().min(1),
    })
    .optional(),
  extractionUsage: LearnerMemoryModelUsageSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
type LearnerMemoryStageOneOutput = z.infer<typeof LearnerMemoryStageOneOutputSchema>

const EvaluationMessageRoleSchema = z.enum(["user", "assistant"])
const EvaluationMessageSchema = z.object({
  id: z.string().min(1),
  role: EvaluationMessageRoleSchema,
  createdAt: z.string().datetime(),
  text: z.string(),
  synthetic: z.boolean().optional(),
  ignored: z.boolean().optional(),
  toolNames: z.array(z.string()).optional(),
  outputTokens: z.number().int().nonnegative().optional(),
})
type EvaluationMessage = z.infer<typeof EvaluationMessageSchema>

const EvaluationFixtureSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  projectPath: z.string().optional(),
  expected: z.object({
    shouldExtract: z.boolean(),
    notes: z.array(z.string()),
    memoryTypes: z.array(LearnerMemoryTypeSchema).optional(),
    rejectIfContains: z.array(z.string()).optional(),
  }),
  messages: z.array(EvaluationMessageSchema),
  learningEvents: z.array(LearnerEventSchema),
})
type EvaluationFixture = z.infer<typeof EvaluationFixtureSchema>

const AttentionDecisionSchema = z.object({
  fixtureId: z.string().min(1),
  decision: z.enum(["skip", "extract"]),
  score: z.number(),
  reasons: z.array(z.string()),
})
type AttentionDecision = z.infer<typeof AttentionDecisionSchema>

const RetrievalResultSchema = z.object({
  memory: LearnerMemorySchema,
  score: z.number(),
  reasons: z.array(z.string()),
})
type RetrievalResult = z.infer<typeof RetrievalResultSchema>

const EvaluationReportSchema = z.object({
  generatedAt: z.string().datetime(),
  root: z.string(),
  extractionMode: z.enum(["model", "deterministic"]),
  extractionModel: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  fixtureCount: z.number().int().nonnegative(),
  extractionCalls: z.number().int().nonnegative(),
  attentionDecisions: z.array(AttentionDecisionSchema),
  candidateCount: z.number().int().nonnegative(),
  approvedCount: z.number().int().nonnegative(),
  retrievalResults: z.array(
    z.object({
      query: z.string(),
      topMemoryIds: z.array(z.string()),
    }),
  ),
  rubricResults: z.array(
    z.object({
      fixtureId: z.string(),
      passed: z.boolean(),
      reasons: z.array(z.string()),
    }),
  ),
  teachingEvalResults: z.array(
    z.object({
      name: z.string(),
      memoryOff: z.string(),
      memoryOn: z.string(),
      passed: z.boolean(),
      reasons: z.array(z.string()),
    }),
  ),
  correctionResults: z.array(
    z.object({
      action: z.string(),
      memoryId: z.string(),
      passed: z.boolean(),
      reasons: z.array(z.string()),
    }),
  ),
  failures: z.array(z.string()),
})
type EvaluationReport = z.infer<typeof EvaluationReportSchema>

export {
  AttentionDecisionSchema,
  CandidateMemoryPatchSchema,
  EvaluationFixtureSchema,
  EvaluationMessageSchema,
  EvaluationReportSchema,
  LearnerEventSchema,
  LearnerEvidenceSchema,
  LearnerIndexEventRowSchema,
  LearnerIndexMemoryRowSchema,
  LearnerMemoryModelUsageSchema,
  LearnerMemorySchema,
  LearnerMemorySourcePointerSchema,
  LearnerMemorySourceSchema,
  LearnerMemoryStatusSchema,
  LearnerMemoryStageOneOutputSchema,
  LearnerMemoryRetentionTypeSchema,
  LearnerMemoryTypeSchema,
  RetrievalResultSchema,
}

export type {
  AttentionDecision,
  CandidateMemoryPatch,
  CandidatePatchOperation,
  EvaluationFixture,
  EvaluationMessage,
  EvaluationReport,
  LearnerEvent,
  LearnerEvidence,
  LearnerEvidenceEffect,
  LearnerIndexEventRow,
  LearnerIndexMemoryRow,
  LearnerEventType,
  LearnerMemory,
  LearnerMemoryModelUsage,
  LearnerMemoryStageOneOutput,
  LearnerMemorySourcePointer,
  LearnerMemorySource,
  LearnerMemoryStatus,
  LearnerMemoryRetentionType,
  LearnerMemoryType,
  RetrievalResult,
}
