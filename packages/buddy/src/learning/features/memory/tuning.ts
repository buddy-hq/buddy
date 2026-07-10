import type { LearnerEventType, LearnerMemory } from "./types"

const MILLISECONDS_PER_SECOND = 1_000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const MILLISECONDS_PER_MINUTE = SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND
const MILLISECONDS_PER_HOUR = MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE
const MILLISECONDS_PER_DAY = HOURS_PER_DAY * MILLISECONDS_PER_HOUR

const LEARNER_MEMORY_SETTINGS_DEFAULTS = {
  enabled: false,
  autoExtract: false,
  minUserMessages: 4,
  minSessionSpanMs: 5 * MILLISECONDS_PER_MINUTE,
  activeBurstGapMs: 10 * MILLISECONDS_PER_MINUTE,
  minActiveBurstMessages: 3,
  minAssistantOutputTokens: 800,
  attentionThreshold: 6,
  maxExtractionCallsPerSession: 2,
  maxExtractionCallsPerDay: 20,
  defaultContextMemoryLimit: 8,
  minStartupIdleMs: 6 * MILLISECONDS_PER_HOUR,
  maxStartupSessionAgeMs: 30 * MILLISECONDS_PER_DAY,
  maxSessionsPerStartup: 16,
  startupConcurrency: 8,
  maxRawMemoriesForConsolidation: 256,
  maxUnusedStageOneDays: 30,
} as const

const LEARNER_MEMORY_ATTENTION_TUNING = {
  minNonSyntheticUserMessagesForExtraction: LEARNER_MEMORY_SETTINGS_DEFAULTS.minUserMessages,
  minSessionSpanMsForExtraction: LEARNER_MEMORY_SETTINGS_DEFAULTS.minSessionSpanMs,
  activeBurstGapMs: LEARNER_MEMORY_SETTINGS_DEFAULTS.activeBurstGapMs,
  minActiveBurstMessages: LEARNER_MEMORY_SETTINGS_DEFAULTS.minActiveBurstMessages,
  minAssistantOutputTokensForExtraction: LEARNER_MEMORY_SETTINGS_DEFAULTS.minAssistantOutputTokens,
  extractionAttentionThreshold: LEARNER_MEMORY_SETTINGS_DEFAULTS.attentionThreshold,
  userMessageScoreDivisor: 3,
  maxUserMessageScore: 3,
  sessionSpanScore: 1,
  activeBurstScore: 2,
  assistantEffortScore: 1,
  meaningfulToolWorkScore: 2,
  modelExtractionFixtureScore: 3,
  fixtureSessionEventType: "fixture_session" satisfies LearnerEventType,
  deterministicLearningEventTypes: [
    "question_set_attempt_ingested",
    "flashcard_review_ingested",
    "task_checkpoint_ingested",
    "goal_committed",
  ] satisfies LearnerEventType[],
  incidentalToolNames: [
    "read",
    "grep",
    "glob",
    "list",
    "webfetch",
    "websearch",
    "tool_search",
    "learner_memory_search",
  ],
  meaningfulToolNamePattern:
    /\b(bash|shell|test|edit|write|patch|apply_patch|task|question|flashcard|checkpoint|assessment|workspace|save|create|submit|review)\b/iu,
  explicitMemoryActionPattern:
    /\b(remember that|remember this|forget that|forget this|do not remember|don't remember (that|this|as)|update (your |buddy )?memory|correct (your |buddy )?memory|that'?s wrong|that is wrong|memory is wrong|not true)\b/iu,
} as const

const LEARNER_MEMORY_MODEL_TUNING = {
  openAIProviderId: "openai",
  defaultOpenAIExtractModel: "gpt-5.4-mini",
  defaultOpenAIConsolidationModel: "gpt-5.4",
} as const

const LEARNER_MEMORY_EXTRACTION_TUNING = {
  modelRetries: 1,
  modelTimeoutMs: 3 * MILLISECONDS_PER_MINUTE,
  maxModelCandidates: 3,
  sourceMessageLimit: 4,
} as const

const LEARNER_MEMORY_CONSOLIDATION_TUNING = {
  modelRetries: 1,
  heartbeatIntervalMs: 90 * MILLISECONDS_PER_SECOND,
  memoryRootRelativePattern: "*.buddy/learner-memory/*",
  minimumReportedFilesWritten: 2,
} as const

const LEARNER_MEMORY_STAGE_ONE_TUNING = {
  stageOneExtractionJobKind: "learner_memory_stage_one_extraction",
  phaseTwoConsolidationJobKind: "learner_memory_phase_two_consolidation",
  phaseTwoGlobalJobSuffix: "global",
  jobLedgerBusyTimeoutMs: 5 * MILLISECONDS_PER_SECOND,
  stageOneJobLeaseMs: 1 * MILLISECONDS_PER_HOUR,
  stageOneJobRetryDelayMs: 1 * MILLISECONDS_PER_HOUR,
  phaseTwoJobLeaseMs: 1 * MILLISECONDS_PER_HOUR,
  phaseTwoJobRetryDelayMs: 1 * MILLISECONDS_PER_HOUR,
  phaseTwoHeartbeatLeaseMs: 1 * MILLISECONDS_PER_HOUR,
  stageOneOutputDbUriPrefix: "sqlite://stage_one_outputs/",
  jsonFileExtension: ".json",
  markdownFileExtension: ".md",
  extractionBudgetDayKeyLength: 10,
} as const

const LEARNER_MEMORY_FILE_TUNING = {
  rootDirectoryName: "learner-memory",
  legacyMemoriesDirectoryName: "memories",
  eventsDirectoryName: "events",
  evidenceDirectoryName: "evidence",
  reportsDirectoryName: "reports",
  sessionSummariesDirectoryName: "session-summaries",
  stageOneOutputsDirectoryName: "stage-one-outputs",
  rolloutSummariesDirectoryName: "rollout-summaries",
  candidatePatchesFileName: "candidate-memory-patches.json",
  summaryFileName: "summary.md",
  memoryRegistryFileName: "MEMORY.md",
  workingMemoryFileName: "working-memory.md",
  workingSummaryFileName: "working-summary.md",
  rawMemoriesFileName: "raw-memories.md",
  indexFileName: "index.sqlite",
  jobLedgerFileName: "jobs.sqlite",
  evaluationReportFileName: "learner-memory-evaluation-report.json",
  jsonFileExtension: ".json",
  jsonlFileExtension: ".jsonl",
  markdownFileExtension: ".md",
} as const

const LEARNER_MEMORY_TOKEN_TUNING = {
  approximateCharsPerToken: 4,
  defaultContextWindowTokens: 150_000,
  defaultContextWindowPercent: 70,
  reservedExtractionPromptTokens: 6_000,
  reservedExtractionOutputTokens: 4_000,
  minTranscriptTokenBudget: 8_000,
} as const

const LEARNER_MEMORY_RETRIEVAL_TUNING = {
  activeRetrievalStatuses: ["active", "resolved", "stale"] satisfies LearnerMemory["status"][],
  exactProjectMatchScore: 4,
  crossProjectMismatchScore: -3,
  pinnedScore: 6,
  openLoopScore: 4,
  proceduralScore: 2,
  flashbulbScore: 8,
  staleScore: -5,
  maxStrengthScore: 3,
  recentUseScore: 0.4,
  recentUseDays: 14,
  bm25K1: 1.2,
  bm25B: 0.75,
  minimumTokenLength: 3,
  reasonDecimalPlaces: 2,
  semanticHalfLifeDays: 180,
  proceduralHalfLifeDays: 90,
  episodicHalfLifeDays: 30,
} as const

const LEARNER_MEMORY_MAINTENANCE_TUNING = {
  staleStrengthThreshold: 0.15,
  decayMinAgeDays: 30,
  semanticMaxDecay: 0.2,
  proceduralMaxDecay: 0.25,
  episodicMaxDecay: 0.35,
  semanticDecayDivisorDays: 1_800,
  proceduralDecayDivisorDays: 900,
  episodicDecayDivisorDays: 300,
  duplicateGroupMinimumSize: 2,
} as const

const LEARNER_MEMORY_EVALUATION_TUNING = {
  candidateApprovalConfidenceThreshold: 0.65,
} as const

const LEARNER_MEMORY_STORAGE_TUNING = {
  jsonIndentSpaces: 2,
  defaultMemoryStrength: 0.5,
  learnerAuthoredMemoryStrength: 0.9,
  memorySearchStrengthBoost: 0.02,
  memoryDecayAmount: 0.08,
  eventFileDateLength: 7,
} as const

const LEARNER_MEMORY_INTERNAL_SESSION_TUNING = {
  sessionPrefix: "ses_learner_memory_",
  consolidationSessionTitle: "Memory consolidation",
} as const

const LEARNER_MEMORY_SESSION_SOURCE_TUNING = {
  syntheticLearnerContextMarker: "learner_context",
  userInstructionsMarker: "USER_INSTRUCTIONS_REGISTRATION",
  skillInstructionsMarker: "SKILL_INSTRUCTIONS_REGISTRATION",
} as const

const LEARNER_MEMORY_REDACTION_TUNING = {
  redactedSecretText: "[REDACTED_SECRET]",
} as const

const LEARNER_MEMORY_RUNTIME_TUNING = {
  baseMemorySummaryLineLimit: 8,
  activeGoalLimit: 6,
  goalMemoryLimit: 6,
  projectContextLimit: 4,
  misconceptionLimit: 8,
  openFeedbackLimit: 8,
  recentEvidenceLimit: 8,
  constraintLimit: 8,
} as const

const MIN_NON_SYNTHETIC_USER_MESSAGES_FOR_EXTRACTION =
  LEARNER_MEMORY_ATTENTION_TUNING.minNonSyntheticUserMessagesForExtraction
const MIN_SESSION_SPAN_MS_FOR_EXTRACTION =
  LEARNER_MEMORY_ATTENTION_TUNING.minSessionSpanMsForExtraction
const ACTIVE_BURST_GAP_MS = LEARNER_MEMORY_ATTENTION_TUNING.activeBurstGapMs
const MIN_ACTIVE_BURST_MESSAGES = LEARNER_MEMORY_ATTENTION_TUNING.minActiveBurstMessages
const MIN_ASSISTANT_OUTPUT_TOKENS_FOR_EXTRACTION =
  LEARNER_MEMORY_ATTENTION_TUNING.minAssistantOutputTokensForExtraction
const EXTRACTION_ATTENTION_THRESHOLD = LEARNER_MEMORY_ATTENTION_TUNING.extractionAttentionThreshold
const OPENAI_PROVIDER_ID = LEARNER_MEMORY_MODEL_TUNING.openAIProviderId
const DEFAULT_OPENAI_EXTRACT_MODEL = LEARNER_MEMORY_MODEL_TUNING.defaultOpenAIExtractModel
const DEFAULT_OPENAI_CONSOLIDATION_MODEL =
  LEARNER_MEMORY_MODEL_TUNING.defaultOpenAIConsolidationModel

export {
  ACTIVE_BURST_GAP_MS,
  DEFAULT_OPENAI_CONSOLIDATION_MODEL,
  DEFAULT_OPENAI_EXTRACT_MODEL,
  EXTRACTION_ATTENTION_THRESHOLD,
  LEARNER_MEMORY_ATTENTION_TUNING,
  LEARNER_MEMORY_CONSOLIDATION_TUNING,
  LEARNER_MEMORY_EVALUATION_TUNING,
  LEARNER_MEMORY_EXTRACTION_TUNING,
  LEARNER_MEMORY_FILE_TUNING,
  LEARNER_MEMORY_INTERNAL_SESSION_TUNING,
  LEARNER_MEMORY_MAINTENANCE_TUNING,
  LEARNER_MEMORY_MODEL_TUNING,
  LEARNER_MEMORY_REDACTION_TUNING,
  LEARNER_MEMORY_RETRIEVAL_TUNING,
  LEARNER_MEMORY_RUNTIME_TUNING,
  LEARNER_MEMORY_SESSION_SOURCE_TUNING,
  LEARNER_MEMORY_SETTINGS_DEFAULTS,
  LEARNER_MEMORY_STAGE_ONE_TUNING,
  LEARNER_MEMORY_STORAGE_TUNING,
  LEARNER_MEMORY_TOKEN_TUNING,
  MILLISECONDS_PER_DAY,
  MIN_ACTIVE_BURST_MESSAGES,
  MIN_ASSISTANT_OUTPUT_TOKENS_FOR_EXTRACTION,
  MIN_NON_SYNTHETIC_USER_MESSAGES_FOR_EXTRACTION,
  MIN_SESSION_SPAN_MS_FOR_EXTRACTION,
  OPENAI_PROVIDER_ID,
}
