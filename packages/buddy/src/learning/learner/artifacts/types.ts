import z from "zod"
import { SCAFFOLDING_LEVELS, SURFACE_IDS, TEACHING_INTENT_IDS, PERSONA_IDS, WORKSPACE_STATES, ACTIVITY_KINDS } from "../../runtime/types.js"

const TimestampSchema = z.string().datetime()

export const LearnerArtifactKindSchema = z.enum([
  "workspace-context",
  "profile",
  "goal",
  "message",
  "practice",
  "assessment",
  "evidence",
  "feedback",
  "misconception",
  "decision-interpret-message",
  "decision-feedback",
  "decision-plan",
])
export type LearnerArtifactKind = z.infer<typeof LearnerArtifactKindSchema>

export const WorkspaceRecordArtifactKindSchema = z.enum([
  "goal",
  "message",
  "practice",
  "assessment",
  "evidence",
  "feedback",
  "misconception",
  "decision-interpret-message",
  "decision-feedback",
  "decision-plan",
])
export type WorkspaceRecordArtifactKind = z.infer<typeof WorkspaceRecordArtifactKindSchema>

export const DecisionDispositionSchema = z.enum(["apply", "abstain"])
export type DecisionDisposition = z.infer<typeof DecisionDispositionSchema>

export const BaseArtifactSchema = z.object({
  id: z.string().min(1),
  kind: LearnerArtifactKindSchema,
  workspaceId: z.string().min(1),
  goalIds: z.array(z.string()).default([]),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})
export type BaseArtifact = z.infer<typeof BaseArtifactSchema>

export const WorkspaceContextArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("workspace-context"),
  label: z.string().min(1),
  tags: z.array(z.string()).default([]),
  pinnedGoalIds: z.array(z.string()).default([]),
  projectConstraints: z.array(z.string()).default([]),
  localToolAvailability: z.array(z.string()).default([]),
  preferredSurfaces: z.array(z.enum(SURFACE_IDS)).default([]),
  motivationContext: z.string().optional(),
  opportunities: z.array(z.string()).default([]),
  userOverride: z.boolean().default(false),
})
export type WorkspaceContextArtifact = z.infer<typeof WorkspaceContextArtifactSchema>

export const ProfileArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("profile"),
  workspaceId: z.string().min(1).optional(),
  background: z.array(z.string()).default([]),
  knownPrerequisites: z.array(z.string()).default([]),
  availableTimePatterns: z.array(z.string()).default([]),
  toolEnvironmentLimits: z.array(z.string()).default([]),
  motivationAnchors: z.array(z.string()).default([]),
  learnerPreferences: z.array(z.string()).default([]),
})
export type ProfileArtifact = z.infer<typeof ProfileArtifactSchema>

export const GoalArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("goal"),
  status: z.enum(["active", "archived"]).default("active"),
  setId: z.string().min(1).optional(),
  scope: z.enum(["course", "topic"]),
  contextLabel: z.string().min(1),
  learnerRequest: z.string().min(1),
  rationaleSummary: z.string().min(1).optional(),
  assumptions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  statement: z.string().min(1),
  actionVerb: z.string().min(1),
  task: z.string().min(1),
  cognitiveLevel: z.enum([
    "Factual Knowledge",
    "Comprehension",
    "Application",
    "Analysis",
    "Synthesis",
    "Evaluation",
  ]),
  howToTest: z.string().min(1),
  dependsOnGoalIds: z.array(z.string()).default([]),
  buildsOnGoalIds: z.array(z.string()).default([]),
  reinforcesGoalIds: z.array(z.string()).default([]),
  conceptTags: z.array(z.string()).default([]),
  workspaceRefs: z.array(z.string()).default([]),
})
export type GoalArtifact = z.infer<typeof GoalArtifactSchema>

export const MessageArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("message"),
  role: z.literal("learner"),
  sessionId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  contentDigest: z.string().min(1),
  content: z.string().min(1),
})
export type MessageArtifact = z.infer<typeof MessageArtifactSchema>

export const PracticeArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("practice"),
  sessionId: z.string().optional(),
  outcome: z.enum(["assigned", "partial", "completed", "stuck"]),
  prompt: z.string().optional(),
  learnerResponseSummary: z.string().min(1),
  targetComponents: z.array(z.string()).default([]),
  difficulty: z.enum(["scaffolded", "moderate", "stretch"]).optional(),
  scenario: z.string().optional(),
  taskConstraints: z.array(z.string()).default([]),
  deliverable: z.string().optional(),
  selfCheck: z.string().optional(),
  whyItMatters: z.string().optional(),
  surface: z.enum(SURFACE_IDS).optional(),
  addressedFeedbackIds: z.array(z.string()).default([]),
})
export type PracticeArtifact = z.infer<typeof PracticeArtifactSchema>

export const AssessmentArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("assessment"),
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
})
export type AssessmentArtifact = z.infer<typeof AssessmentArtifactSchema>

export const EvidenceArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("evidence"),
  sourceKind: z.enum(["message", "practice", "assessment", "teacher-observation"]),
  strength: z.enum(["none", "weak", "strong"]).default("none"),
  outcome: z.enum(["positive", "mixed", "negative", "neutral"]),
  sourceRefId: z.string().optional(),
  sessionId: z.string().optional(),
  summary: z.string().min(1),
})
export type EvidenceArtifact = z.infer<typeof EvidenceArtifactSchema>

export const FeedbackArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("feedback"),
  status: z.enum(["open", "acted-on", "resolved"]).default("open"),
  sourceKind: z.enum(["practice", "assessment", "reflection", "teacher-observation"]),
  sourceRefId: z.string().optional(),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  guidance: z.array(z.string()).default([]),
  requiredAction: z.string().min(1),
  scaffoldingLevel: z.enum(SCAFFOLDING_LEVELS),
  relatedDecisionId: z.string().optional(),
})
export type FeedbackArtifact = z.infer<typeof FeedbackArtifactSchema>

export const MisconceptionArtifactSchema = BaseArtifactSchema.extend({
  kind: z.literal("misconception"),
  status: z.enum(["active", "resolved"]).default("active"),
  summary: z.string().min(1),
  relatedDecisionId: z.string().optional(),
})
export type MisconceptionArtifact = z.infer<typeof MisconceptionArtifactSchema>

export const DecisionArtifactSchema = BaseArtifactSchema.extend({
  kind: z.enum(["decision-interpret-message", "decision-feedback", "decision-plan"]),
  decisionType: z.enum(["interpret-message", "feedback", "plan"]),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  usedSmallModel: z.boolean().default(false),
  inputHash: z.string().min(1),
  disposition: DecisionDispositionSchema,
  confidence: z.number().min(0).max(1).default(0),
  rationale: z.array(z.string()).default([]),
  payload: z.unknown().optional(),
  error: z.string().optional(),
})
export type DecisionArtifact = z.infer<typeof DecisionArtifactSchema>

export const LearnerArtifactSchema = z.discriminatedUnion("kind", [
  WorkspaceContextArtifactSchema,
  ProfileArtifactSchema,
  GoalArtifactSchema,
  MessageArtifactSchema,
  PracticeArtifactSchema,
  AssessmentArtifactSchema,
  EvidenceArtifactSchema,
  FeedbackArtifactSchema,
  MisconceptionArtifactSchema,
  DecisionArtifactSchema,
])
export type LearnerArtifact = z.infer<typeof LearnerArtifactSchema>

const SharedSnapshotDecisionSchema = z.object({
  persona: z.enum(PERSONA_IDS).default("buddy"),
  intent: z.enum(TEACHING_INTENT_IDS).optional(),
  focusGoalIds: z.array(z.string()).default([]),
  sessionId: z.string().optional(),
  workspaceState: z.enum(WORKSPACE_STATES).optional(),
})
export const SnapshotQuerySchema = SharedSnapshotDecisionSchema
export type SnapshotQuery = z.infer<typeof SnapshotQuerySchema>

export const DecisionPlanRequestSchema = SharedSnapshotDecisionSchema
export type DecisionPlanRequest = z.infer<typeof DecisionPlanRequestSchema>

export const SnapshotPlanSchema = z.object({
  primaryGoalId: z.string().optional(),
  suggestedActivity: z.enum(ACTIVITY_KINDS),
  suggestedScaffoldingLevel: z.enum(SCAFFOLDING_LEVELS),
  warmupGoalIds: z.array(z.string()).default([]),
  alternatives: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
  motivationHook: z.string().optional(),
  riskFlags: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
})
export type SnapshotPlan = z.infer<typeof SnapshotPlanSchema>
