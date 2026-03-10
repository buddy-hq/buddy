import z from "zod"

const GOAL_WRITER_AGENT_NAME = "goal-writer" as const

const GOAL_TOOL_IDS = [
  "goal_decide_scope",
  "goal_lint",
  "goal_commit",
  "goal_state",
] as const

const GoalScopeSchema = z.enum(["course", "topic"])
type GoalScope = z.infer<typeof GoalScopeSchema>

const GoalCognitiveLevelSchema = z.enum([
  "Factual Knowledge",
  "Comprehension",
  "Application",
  "Analysis",
  "Synthesis",
  "Evaluation",
])
type GoalCognitiveLevel = z.infer<typeof GoalCognitiveLevelSchema>

const GoalSchema = z.object({
  statement: z.string().min(1),
  actionVerb: z.string().min(1),
  task: z.string().min(1),
  cognitiveLevel: GoalCognitiveLevelSchema,
  howToTest: z.string().min(1),
})
type Goal = z.infer<typeof GoalSchema>

const GoalScopeDecisionSchema = z.object({
  learnerRequest: z.string().min(1),
  scope: GoalScopeSchema,
  contextLabel: z.string().min(1),
  targetCount: z.number().int().positive(),
  explicitlyRequestedSingleGoal: z.boolean(),
  needsClarification: z.boolean(),
  clarifyingQuestions: z.array(z.string()).max(2),
  assumptions: z.array(z.string()),
})
type GoalScopeDecision = z.infer<typeof GoalScopeDecisionSchema>

const GoalLintFieldSchema = z.enum(["statement", "actionVerb", "task", "cognitiveLevel", "howToTest", "goal"])
type GoalLintField = z.infer<typeof GoalLintFieldSchema>

const GoalLintCodeSchema = z.enum([
  "VAGUE_VERB",
  "MISSING_TESTABILITY",
  "COMPOUND_GOAL",
  "TOPIC_NOT_TASK",
  "TEMPLATE_MISMATCH",
  "LEVEL_VERB_MISMATCH",
  "TOO_BROAD",
  "JARGON_HEAVY",
  "WEAK_RELEVANCE",
  "COUNT_OUT_OF_RANGE",
])
type GoalLintCode = z.infer<typeof GoalLintCodeSchema>

const GoalLintIssueSchema = z.object({
  goalIndex: z.number().int().min(-1),
  field: GoalLintFieldSchema,
  code: GoalLintCodeSchema,
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1),
})
type GoalLintIssue = z.infer<typeof GoalLintIssueSchema>

const GoalLintReportSchema = z.object({
  ok: z.boolean(),
  errors: z.array(GoalLintIssueSchema),
  warnings: z.array(GoalLintIssueSchema),
  summary: z.string().min(1),
})
type GoalLintReport = z.infer<typeof GoalLintReportSchema>

const GoalCommitResultSchema = z.object({
  committed: z.literal(true),
  filePath: z.string().min(1),
  setId: z.string().min(1),
  goalIds: z.array(z.string().min(1)),
  archivedSetIds: z.array(z.string().min(1)),
})
type GoalCommitResult = z.infer<typeof GoalCommitResultSchema>

const GoalStateSetSummarySchema = z.object({
  setId: z.string().min(1),
  scope: GoalScopeSchema,
  contextLabel: z.string().min(1),
  goalCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})

const GoalStateSchema = z.object({
  filePath: z.string().min(1),
  exists: z.boolean(),
  activeSetCount: z.number().int().nonnegative(),
  activeSets: z.array(GoalStateSetSummarySchema),
  raw: z.unknown().optional(),
})
type GoalState = z.infer<typeof GoalStateSchema>

type GoalArtifactName = "GoalScopeDecision" | "GoalLintReport" | "GoalCommitResult" | "GoalState"

const ACTION_VERB_LEVELS = new Map<string, GoalCognitiveLevel>([
  ["define", "Factual Knowledge"],
  ["list", "Factual Knowledge"],
  ["state", "Factual Knowledge"],
  ["label", "Factual Knowledge"],
  ["name", "Factual Knowledge"],
  ["describe", "Comprehension"],
  ["explain", "Comprehension"],
  ["summarize", "Comprehension"],
  ["interpret", "Comprehension"],
  ["illustrate", "Comprehension"],
  ["apply", "Application"],
  ["demonstrate", "Application"],
  ["use", "Application"],
  ["compute", "Application"],
  ["solve", "Application"],
  ["predict", "Application"],
  ["construct", "Application"],
  ["modify", "Application"],
  ["implement", "Application"],
  ["compare", "Analysis"],
  ["contrast", "Analysis"],
  ["categorize", "Analysis"],
  ["distinguish", "Analysis"],
  ["identify", "Analysis"],
  ["infer", "Analysis"],
  ["develop", "Synthesis"],
  ["create", "Synthesis"],
  ["propose", "Synthesis"],
  ["formulate", "Synthesis"],
  ["design", "Synthesis"],
  ["invent", "Synthesis"],
  ["judge", "Evaluation"],
  ["appraise", "Evaluation"],
  ["recommend", "Evaluation"],
  ["justify", "Evaluation"],
  ["defend", "Evaluation"],
  ["criticize", "Evaluation"],
  ["evaluate", "Evaluation"],
])

const TASK_LIKE_VERBS = new Set<string>([
  ...ACTION_VERB_LEVELS.keys(),
  "build",
  "write",
  "debug",
  "deploy",
  "configure",
  "integrate",
  "prototype",
  "refactor",
  "plan",
  "test",
  "ship",
])

function normalizeGoalText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function splitGoalWords(value: string): string[] {
  const normalized = normalizeGoalText(value)
  if (!normalized) return []

  return normalized
    .split(" ")
    .map((word) => word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, ""))
    .filter(Boolean)
}

function deriveGoalContextLabel(value: string): string {
  let label = normalizeGoalText(value)
  const patterns = [
    /^please\s+/i,
    /^i want to learn\s+/i,
    /^i want to\s+/i,
    /^learn\s+/i,
    /^study\s+/i,
    /^give me\s+/i,
    /^write\s+/i,
    /^create\s+/i,
    /^draft\s+/i,
    /^build\s+/i,
    /^(?:course-level|course)\s+goals?\s+(?:for|about)\s+/i,
    /^(?:topic-level|topic)\s+goals?\s+(?:for|about)\s+/i,
    /^(?:a|one|single)\s+goal\s+for\s+/i,
    /^goals\s+for\s+/i,
  ]

  for (const pattern of patterns) {
    label = label.replace(pattern, "")
  }

  label = label.replace(/[.?!]+$/g, "").trim()
  return label || "Untitled goal set"
}

function inferGoalCognitiveLevel(actionVerb: string): GoalCognitiveLevel | undefined {
  return ACTION_VERB_LEVELS.get(normalizeGoalText(actionVerb).toLowerCase())
}

function isLikelyTaskLikeStatement(value: string): boolean {
  const normalized = normalizeGoalText(value)
  if (!normalized) return false

  const lower = normalized.toLowerCase()
  const words = splitGoalWords(normalized).map((word) => word.toLowerCase())
  if (words.length <= 1) return false

  if (/^(learn|study|understand|know)\b/.test(lower) && words.length <= 4) {
    return false
  }

  if (words.some((word) => TASK_LIKE_VERBS.has(word))) {
    return true
  }

  return /\b(build|create|design|implement|debug|solve|compare|analyze|evaluate|justify|explain)\b/.test(lower)
}

function isLikelyTestableTask(value: string): boolean {
  const normalized = normalizeGoalText(value)
  if (normalized.length < 16) return false

  if (isLikelyTaskLikeStatement(normalized)) return true

  return /\b(given|using|with|by|when|after|test|verify|run)\b/i.test(normalized)
}

function hasGoalTemplatePrefix(scope: GoalScope, statement: string): boolean {
  const normalized = normalizeGoalText(statement).toLowerCase()
  const prefix =
    scope === "course" ? "at the end of this course, you will be able to" : "at the end of this topic, you will be able to"

  return normalized.startsWith(prefix)
}

function isLikelyTopicLabel(value: string): boolean {
  const normalized = normalizeGoalText(value)
  if (!normalized) return true

  const lower = normalized.toLowerCase()
  if (lower.includes("you will be able to")) return false

  const words = splitGoalWords(normalized).map((word) => word.toLowerCase())
  if (words.length > 5) return false

  return !words.some((word) => TASK_LIKE_VERBS.has(word))
}

function isLikelyCompoundTask(value: string): boolean {
  const normalized = normalizeGoalText(value)
  if (!normalized) return false

  const connectors = (normalized.match(/\band\b|\bor\b|;/gi) ?? []).length
  if (connectors <= 0) return false
  if (connectors > 1) return true

  const verbHits = splitGoalWords(normalized)
    .map((word) => word.toLowerCase())
    .filter((word) => TASK_LIKE_VERBS.has(word))

  return new Set(verbHits).size >= 2
}

function isLikelyTooBroadTask(value: string): boolean {
  const normalized = normalizeGoalText(value)
  if (!normalized) return false

  const words = splitGoalWords(normalized)
  if (words.length > 24) return true

  return /\b(all aspects|everything|end-to-end|entire|full stack|completely|from scratch)\b/i.test(normalized)
}

function isLikelyJargonHeavy(value: string): boolean {
  const words = splitGoalWords(value)
  let jargonish = 0

  for (const word of words) {
    if (word.length >= 14 || /[_/]/.test(word) || /[A-Z]{2,}/.test(word)) {
      jargonish++
    }
  }

  return jargonish >= 3
}

function isLikelyWeakRelevance(value: string): boolean {
  const normalized = normalizeGoalText(value).toLowerCase()
  if (!normalized) return true

  if (splitGoalWords(normalized).length <= 2) return true

  return /^(it|them|the topic|the concept|the material)\b/.test(normalized)
}

function dedupeGoalStrings(values: readonly string[]): string[] {
  const deduped = new Set<string>()

  for (const value of values) {
    const normalized = normalizeGoalText(value)
    if (!normalized) continue
    deduped.add(normalized)
  }

  return [...deduped]
}

function createGoalToolResult<T>(artifact: GoalArtifactName, value: T) {
  return {
    title: artifact,
    output: JSON.stringify(value, null, 2),
    metadata: {
      artifact,
      value,
    },
  }
}

export {
  GOAL_TOOL_IDS,
  GOAL_WRITER_AGENT_NAME,
  GoalCognitiveLevelSchema,
  GoalCommitResultSchema,
  GoalLintCodeSchema,
  GoalLintFieldSchema,
  GoalLintIssueSchema,
  GoalLintReportSchema,
  GoalSchema,
  GoalScopeDecisionSchema,
  GoalScopeSchema,
  GoalStateSchema,
  createGoalToolResult,
  dedupeGoalStrings,
  deriveGoalContextLabel,
  hasGoalTemplatePrefix,
  inferGoalCognitiveLevel,
  isLikelyCompoundTask,
  isLikelyJargonHeavy,
  isLikelyTaskLikeStatement,
  isLikelyTestableTask,
  isLikelyTooBroadTask,
  isLikelyTopicLabel,
  isLikelyWeakRelevance,
  normalizeGoalText,
}

export type {
  Goal,
  GoalCognitiveLevel,
  GoalCommitResult,
  GoalLintCode,
  GoalLintField,
  GoalLintIssue,
  GoalLintReport,
  GoalScope,
  GoalScopeDecision,
  GoalState,
}
