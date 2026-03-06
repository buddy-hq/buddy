import z from "zod"
import {
  ACTIVITY_KINDS,
  TEACHING_INTENT_IDS,
  PERSONA_IDS,
  SCAFFOLDING_LEVELS,
  SURFACE_IDS,
} from "../runtime/types.js"

const TimestampSchema = z.string().datetime()
const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/)

export const GoalCognitiveLevelSchema = z.enum([
  "Factual Knowledge",
  "Comprehension",
  "Application",
  "Analysis",
  "Synthesis",
  "Evaluation",
])
export type GoalCognitiveLevel = z.infer<typeof GoalCognitiveLevelSchema>

export const GoalScopeSchema = z.enum(["course", "topic"])
export type GoalScope = z.infer<typeof GoalScopeSchema>

export const GoalRecordSchema = z.object({
  goalId: UlidSchema,
  setId: UlidSchema,
  scope: GoalScopeSchema,
  contextLabel: z.string().min(1),
  learnerRequest: z.string().min(1),
  statement: z.string().min(1),
  actionVerb: z.string().min(1),
  task: z.string().min(1),
  cognitiveLevel: GoalCognitiveLevelSchema,
  howToTest: z.string().min(1),
  rationaleSummary: z.string().min(1).optional(),
  assumptions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  workspaceRefs: z.array(z.string()).default([]),
  conceptTags: z.array(z.string()).default([]),
  createdAt: TimestampSchema,
  archivedAt: TimestampSchema.optional(),
})
export type GoalRecord = z.infer<typeof GoalRecordSchema>

export const GoalEdgeSchema = z.object({
  edgeId: UlidSchema,
  fromGoalId: z.string().min(1),
  toGoalId: z.string().min(1),
  type: z.enum(["prerequisite", "builds-on", "reinforces"]),
  createdAt: TimestampSchema,
})
export type GoalEdge = z.infer<typeof GoalEdgeSchema>

export const EvidenceRecordSchema = z.object({
  evidenceId: UlidSchema,
  goalIds: z.array(z.string()).default([]),
  workspaceId: z.string().min(1),
  sessionId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  sourceType: z.enum(["practice", "assessment", "learner-message", "teacher-observation"]),
  summary: z.string().min(1),
  outcome: z.enum(["positive", "mixed", "negative", "neutral"]),
  misconceptionIds: z.array(z.string()).default([]),
  dedupeKey: z.string().min(1).optional(),
  createdAt: TimestampSchema,
})
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>

export const PracticeTemplateSchema = z.object({
  templateId: UlidSchema,
  goalIds: z.array(z.string()).default([]),
  workspaceId: z.string().min(1),
  prompt: z.string().min(1),
  targetComponents: z.array(z.string()).default([]),
  difficulty: z.enum(["scaffolded", "moderate", "stretch"]),
  scenario: z.string().optional(),
  taskConstraints: z.array(z.string()).default([]),
  deliverable: z.string().optional(),
  selfCheck: z.string().optional(),
  whyItMatters: z.string().optional(),
  surface: z.enum(SURFACE_IDS).optional(),
  createdAt: TimestampSchema,
})
export type PracticeTemplate = z.infer<typeof PracticeTemplateSchema>

export const PracticeAttemptSchema = z.object({
  attemptId: UlidSchema,
  templateId: z.string().optional(),
  goalIds: z.array(z.string()).default([]),
  workspaceId: z.string().min(1),
  sessionId: z.string().optional(),
  learnerResponseSummary: z.string().min(1),
  outcome: z.enum(["assigned", "partial", "completed", "stuck"]),
  targetComponents: z.array(z.string()).default([]),
  surface: z.enum(SURFACE_IDS).optional(),
  addressedFeedbackIds: z.array(z.string()).default([]),
  createdAt: TimestampSchema,
})
export type PracticeAttempt = z.infer<typeof PracticeAttemptSchema>

export const AssessmentRecordSchema = z.object({
  assessmentId: UlidSchema,
  goalIds: z.array(z.string()).default([]),
  workspaceId: z.string().min(1),
  sessionId: z.string().optional(),
  format: z.enum([
    "concept-check",
    "predict-outcome",
    "debug-task",
    "build-task",
    "review-task",
    "explain-reasoning",
    "transfer-task",
  ]),
  summary: z.string().min(1),
  result: z.enum(["demonstrated", "partial", "not-demonstrated"]),
  learnerResponseSummary: z.string().optional(),
  evidenceCriteria: z.array(z.string()).default([]),
  followUpAction: z.string().optional(),
  createdAt: TimestampSchema,
})
export type AssessmentRecord = z.infer<typeof AssessmentRecordSchema>

export const MisconceptionRecordSchema = z.object({
  misconceptionId: UlidSchema,
  goalIds: z.array(z.string()).default([]),
  workspaceId: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["active", "resolved"]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type MisconceptionRecord = z.infer<typeof MisconceptionRecordSchema>

export const LearnerConstraintsSchema = z.object({
  background: z.array(z.string()).default([]),
  knownPrerequisites: z.array(z.string()).default([]),
  availableTimePatterns: z.array(z.string()).default([]),
  toolEnvironmentLimits: z.array(z.string()).default([]),
  motivationAnchors: z.array(z.string()).default([]),
  opportunities: z.array(z.string()).default([]),
  learnerPreferences: z.array(z.string()).default([]),
  updatedAt: TimestampSchema,
})
export type LearnerConstraints = z.infer<typeof LearnerConstraintsSchema>

export const FeedbackRecordSchema = z.object({
  feedbackId: UlidSchema,
  goalIds: z.array(z.string()).default([]),
  workspaceId: z.string().min(1),
  sessionId: z.string().optional(),
  sourceAttemptId: z.string().optional(),
  sourceAssessmentId: z.string().optional(),
  sourceType: z.enum(["practice", "assessment", "reflection", "teacher-observation"]),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  guidance: z.array(z.string()).default([]),
  requiredAction: z.string().min(1),
  scaffoldingLevel: z.enum(SCAFFOLDING_LEVELS),
  pattern: z.string().optional(),
  status: z.enum(["open", "acted-on", "resolved"]),
  actedOnByEvidenceId: z.string().optional(),
  actedOnAt: TimestampSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>

export const ProgressRecordSchema = z.object({
  goalId: z.string().min(1),
  status: z.enum(["not-started", "in-progress", "demonstrated", "needs-review"]),
  confidence: z.enum(["low", "medium", "high"]),
  evidenceRefs: z.array(z.string()).default([]),
  misconceptions: z.array(z.string()).default([]),
  reviewCount: z.number().int().nonnegative().default(0),
  lastDemonstratedAt: TimestampSchema.optional(),
  lastWorkedAt: TimestampSchema.optional(),
  nextReviewAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema,
})
export type ProgressRecord = z.infer<typeof ProgressRecordSchema>

export const ReviewRecordSchema = z.object({
  goalId: z.string().min(1),
  dueAt: TimestampSchema,
  reason: z.string().min(1),
  status: z.enum(["due", "upcoming"]),
})
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>

export const AlignmentRecordSchema = z.object({
  goalId: z.string().min(1),
  practiceCount: z.number().int().nonnegative(),
  assessmentCount: z.number().int().nonnegative(),
  assessmentFormats: z.array(z.string()).default([]),
  coverage: z.enum(["missing", "partial", "complete"]),
  suiteComplete: z.boolean(),
  orphanedRefs: z.array(z.string()).default([]),
  recommendation: z.string().min(1),
})
export type AlignmentRecord = z.infer<typeof AlignmentRecordSchema>

export const OpenFeedbackActionSchema = z.object({
  feedbackId: z.string().min(1),
  goalIds: z.array(z.string()).default([]),
  requiredAction: z.string().min(1),
  scaffoldingLevel: z.enum(SCAFFOLDING_LEVELS),
  pattern: z.string().optional(),
  createdAt: TimestampSchema,
})
export type OpenFeedbackAction = z.infer<typeof OpenFeedbackActionSchema>

export const LearningPlanActionSchema = z.object({
  actionId: z.enum([
    "define-goals",
    "start-practice",
    "run-check",
    "review-due",
    "resolve-feedback",
    "understand-next",
  ]),
  label: z.string().min(1),
  prompt: z.string().min(1),
  intent: z.enum(TEACHING_INTENT_IDS).optional(),
  activityBundleId: z.string().min(1).optional(),
  activityBundleLabel: z.string().min(1).optional(),
  focusGoalIds: z.array(z.string()).default([]),
  reason: z.string().min(1),
})
export type LearningPlanAction = z.infer<typeof LearningPlanActionSchema>

export const SessionPlanSchema = z.object({
  warmupReviewGoalIds: z.array(z.string()).default([]),
  primaryGoalId: z.string().optional(),
  suggestedActivity: z.enum(ACTIVITY_KINDS),
  suggestedScaffoldingLevel: z.enum(SCAFFOLDING_LEVELS),
  alternatives: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
  motivationHook: z.string().optional(),
  constraintsConsidered: z.array(z.string()).default([]),
  prerequisiteWarnings: z.array(z.string()).default([]),
})
export type SessionPlan = z.infer<typeof SessionPlanSchema>

export const AlignmentSummarySchema = z.object({
  records: z.array(AlignmentRecordSchema),
  incompleteGoalIds: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
})
export type AlignmentSummary = z.infer<typeof AlignmentSummarySchema>

export const LearnerMetaSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: TimestampSchema,
  lastSweepAt: TimestampSchema.optional(),
  observerCursors: z
    .object({
      lastProcessedSessionId: z.string().optional(),
      lastProcessedMessageId: z.string().optional(),
    })
    .default({}),
})
export type LearnerMeta = z.infer<typeof LearnerMetaSchema>

export const GoalsFileSchema = z.object({
  goals: z.array(GoalRecordSchema),
})
export type GoalsFile = z.infer<typeof GoalsFileSchema>

export const EdgesFileSchema = z.object({
  edges: z.array(GoalEdgeSchema),
})
export type EdgesFile = z.infer<typeof EdgesFileSchema>

export const PracticeFileSchema = z.object({
  templates: z.array(PracticeTemplateSchema),
  attempts: z.array(PracticeAttemptSchema),
})
export type PracticeFile = z.infer<typeof PracticeFileSchema>

export const AssessmentsFileSchema = z.object({
  records: z.array(AssessmentRecordSchema),
})
export type AssessmentsFile = z.infer<typeof AssessmentsFileSchema>

export const MisconceptionsFileSchema = z.object({
  records: z.array(MisconceptionRecordSchema),
})
export type MisconceptionsFile = z.infer<typeof MisconceptionsFileSchema>

export const ConstraintsFileSchema = z.object({
  value: LearnerConstraintsSchema,
})
export type ConstraintsFile = z.infer<typeof ConstraintsFileSchema>

export const FeedbackFileSchema = z.object({
  records: z.array(FeedbackRecordSchema),
})
export type FeedbackFile = z.infer<typeof FeedbackFileSchema>

export const ProgressProjectionSchema = z.object({
  updatedAt: TimestampSchema,
  records: z.array(ProgressRecordSchema),
})
export type ProgressProjection = z.infer<typeof ProgressProjectionSchema>

export const ReviewProjectionSchema = z.object({
  updatedAt: TimestampSchema,
  records: z.array(ReviewRecordSchema),
})
export type ReviewProjection = z.infer<typeof ReviewProjectionSchema>

export const AlignmentProjectionSchema = z.object({
  updatedAt: TimestampSchema,
  records: z.array(AlignmentRecordSchema),
})
export type AlignmentProjection = z.infer<typeof AlignmentProjectionSchema>

export const WorkspaceContextSchema = z.object({
  workspaceId: UlidSchema,
  label: z.string().min(1),
  tags: z.array(z.string()).default([]),
  pinnedGoalIds: z.array(z.string()).default([]),
  projectConstraints: z.array(z.string()).default([]),
  localToolAvailability: z.array(z.string()).default([]),
  preferredSurfaces: z.array(z.enum(SURFACE_IDS)).default([]),
  motivationContext: z.string().optional(),
  opportunities: z.array(z.string()).default([]),
  userOverride: z.boolean().default(false),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type WorkspaceContext = z.infer<typeof WorkspaceContextSchema>

export const LearnerStateSchema = z.object({
  meta: LearnerMetaSchema,
  goals: z.array(GoalRecordSchema),
  edges: z.array(GoalEdgeSchema),
  evidence: z.array(EvidenceRecordSchema),
  practiceTemplates: z.array(PracticeTemplateSchema),
  practiceAttempts: z.array(PracticeAttemptSchema),
  assessments: z.array(AssessmentRecordSchema),
  misconceptions: z.array(MisconceptionRecordSchema),
  constraints: LearnerConstraintsSchema,
  feedback: z.array(FeedbackRecordSchema),
  projections: z.object({
    progress: z.array(ProgressRecordSchema),
    review: z.array(ReviewRecordSchema),
    alignment: z.array(AlignmentRecordSchema),
  }),
})
export type LearnerState = z.infer<typeof LearnerStateSchema>

export const LearnerPromptQuerySchema = z.object({
  workspaceId: z.string().min(1),
  persona: z.enum(PERSONA_IDS),
  intent: z.enum(TEACHING_INTENT_IDS).optional(),
  focusGoalIds: z.array(z.string()).default([]),
  tokenBudget: z.number().int().positive().default(1200),
})
export type LearnerPromptQuery = z.infer<typeof LearnerPromptQuerySchema>

export const LearnerStateQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  goalIds: z.array(z.string()).default([]),
  conceptTags: z.array(z.string()).default([]),
  includeDerived: z.boolean().default(true),
})
export type LearnerStateQuery = z.infer<typeof LearnerStateQuerySchema>

export const LearnerCurriculumViewSchema = z.object({
  workspace: WorkspaceContextSchema,
  coldStart: z.boolean(),
  recommendedNextAction: z.enum(ACTIVITY_KINDS),
  sessionPlan: SessionPlanSchema,
  alignmentSummary: AlignmentSummarySchema,
  openFeedbackActions: z.array(OpenFeedbackActionSchema),
  actions: z.array(LearningPlanActionSchema),
  activityBundles: z.array(z.object({
    id: z.string().min(1),
    activity: z.enum(ACTIVITY_KINDS),
    label: z.string().min(1),
    intent: z.enum(TEACHING_INTENT_IDS),
    mode: z.enum(["skill", "tool", "hybrid"]),
    description: z.string().min(1),
    autoEligible: z.boolean(),
    whenToUse: z.array(z.string()).default([]),
    outputs: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    subagents: z.array(z.string()).default([]),
  })),
  constraintsSummary: z.array(z.string()),
  markdown: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      items: z.array(z.string()),
    }),
  ),
})
export type LearnerCurriculumView = z.infer<typeof LearnerCurriculumViewSchema>
