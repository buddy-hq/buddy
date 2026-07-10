import type { readProjectConfig } from "../../../config/runtime"
import { EXPERIMENTAL_FEATURE_ID } from "../../../experimental-features/catalog"
import { experimentalFeatureIsEnabled } from "../../../experimental-features/service"
import { learnerMemoryLabSettingsOverride } from "./lab-context"
import { LEARNER_MEMORY_SETTINGS_DEFAULTS } from "./tuning"

type LearnerMemorySettings = {
  enabled: boolean
  autoExtract: boolean
  minUserMessages: number
  minSessionSpanMs: number
  activeBurstGapMs: number
  minActiveBurstMessages: number
  minAssistantOutputTokens: number
  attentionThreshold: number
  maxExtractionCallsPerSession: number
  maxExtractionCallsPerDay: number
  defaultContextMemoryLimit: number
  extractModel?: string
  consolidationModel?: string
  minStartupIdleMs: number
  maxStartupSessionAgeMs: number
  maxSessionsPerStartup: number
  startupConcurrency: number
  maxRawMemoriesForConsolidation: number
  maxUnusedStageOneDays: number
}

const DEFAULT_LEARNER_MEMORY_SETTINGS: LearnerMemorySettings = LEARNER_MEMORY_SETTINGS_DEFAULTS

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback
}

function readLearnerMemorySettings(
  config: Awaited<ReturnType<typeof readProjectConfig>>,
): LearnerMemorySettings {
  const learnerMemory = config.learner_memory
  const extractModel =
    typeof learnerMemory?.extract_model === "string" && learnerMemory.extract_model.length > 0
      ? learnerMemory.extract_model
      : undefined
  const consolidationModel =
    typeof learnerMemory?.consolidation_model === "string" &&
    learnerMemory.consolidation_model.length > 0
      ? learnerMemory.consolidation_model
      : undefined

  const settings: LearnerMemorySettings = {
    enabled:
      experimentalFeatureIsEnabled(config, EXPERIMENTAL_FEATURE_ID.learnerMemory) &&
      learnerMemory?.enabled === true,
    autoExtract:
      experimentalFeatureIsEnabled(config, EXPERIMENTAL_FEATURE_ID.learnerMemory) &&
      learnerMemory?.enabled === true &&
      learnerMemory?.auto_extract === true,
    minUserMessages: positiveInteger(
      learnerMemory?.min_user_messages,
      DEFAULT_LEARNER_MEMORY_SETTINGS.minUserMessages,
    ),
    minSessionSpanMs: positiveInteger(
      learnerMemory?.min_session_span_ms,
      DEFAULT_LEARNER_MEMORY_SETTINGS.minSessionSpanMs,
    ),
    activeBurstGapMs: positiveInteger(
      learnerMemory?.active_burst_gap_ms,
      DEFAULT_LEARNER_MEMORY_SETTINGS.activeBurstGapMs,
    ),
    minActiveBurstMessages: positiveInteger(
      learnerMemory?.min_active_burst_messages,
      DEFAULT_LEARNER_MEMORY_SETTINGS.minActiveBurstMessages,
    ),
    minAssistantOutputTokens: positiveInteger(
      learnerMemory?.min_assistant_output_tokens,
      DEFAULT_LEARNER_MEMORY_SETTINGS.minAssistantOutputTokens,
    ),
    attentionThreshold: positiveInteger(
      learnerMemory?.attention_threshold,
      DEFAULT_LEARNER_MEMORY_SETTINGS.attentionThreshold,
    ),
    maxExtractionCallsPerSession: positiveInteger(
      learnerMemory?.max_extraction_calls_per_session,
      DEFAULT_LEARNER_MEMORY_SETTINGS.maxExtractionCallsPerSession,
    ),
    maxExtractionCallsPerDay: positiveInteger(
      learnerMemory?.max_extraction_calls_per_day,
      DEFAULT_LEARNER_MEMORY_SETTINGS.maxExtractionCallsPerDay,
    ),
    defaultContextMemoryLimit: positiveInteger(
      learnerMemory?.default_context_memory_limit,
      DEFAULT_LEARNER_MEMORY_SETTINGS.defaultContextMemoryLimit,
    ),
    ...(extractModel ? { extractModel } : {}),
    ...(consolidationModel ? { consolidationModel } : {}),
    minStartupIdleMs: positiveInteger(
      learnerMemory?.min_startup_idle_ms,
      DEFAULT_LEARNER_MEMORY_SETTINGS.minStartupIdleMs,
    ),
    maxStartupSessionAgeMs: positiveInteger(
      learnerMemory?.max_startup_session_age_ms,
      DEFAULT_LEARNER_MEMORY_SETTINGS.maxStartupSessionAgeMs,
    ),
    maxSessionsPerStartup: positiveInteger(
      learnerMemory?.max_sessions_per_startup,
      DEFAULT_LEARNER_MEMORY_SETTINGS.maxSessionsPerStartup,
    ),
    startupConcurrency: positiveInteger(
      learnerMemory?.startup_concurrency,
      DEFAULT_LEARNER_MEMORY_SETTINGS.startupConcurrency,
    ),
    maxRawMemoriesForConsolidation: positiveInteger(
      learnerMemory?.max_raw_memories_for_consolidation,
      DEFAULT_LEARNER_MEMORY_SETTINGS.maxRawMemoriesForConsolidation,
    ),
    maxUnusedStageOneDays: positiveInteger(
      learnerMemory?.max_unused_stage_one_days,
      DEFAULT_LEARNER_MEMORY_SETTINGS.maxUnusedStageOneDays,
    ),
  }

  const override = learnerMemoryLabSettingsOverride()
  if (!override) {
    return settings
  }

  return {
    ...settings,
    ...(override.enabled !== undefined ? { enabled: override.enabled } : {}),
    ...(override.autoExtract !== undefined ? { autoExtract: override.autoExtract } : {}),
    minUserMessages: positiveInteger(override.minUserMessages, settings.minUserMessages),
    minSessionSpanMs: positiveInteger(override.minSessionSpanMs, settings.minSessionSpanMs),
    activeBurstGapMs: positiveInteger(override.activeBurstGapMs, settings.activeBurstGapMs),
    minActiveBurstMessages: positiveInteger(
      override.minActiveBurstMessages,
      settings.minActiveBurstMessages,
    ),
    minAssistantOutputTokens: positiveInteger(
      override.minAssistantOutputTokens,
      settings.minAssistantOutputTokens,
    ),
    attentionThreshold: positiveInteger(override.attentionThreshold, settings.attentionThreshold),
    maxExtractionCallsPerSession: positiveInteger(
      override.maxExtractionCallsPerSession,
      settings.maxExtractionCallsPerSession,
    ),
    maxExtractionCallsPerDay: positiveInteger(
      override.maxExtractionCallsPerDay,
      settings.maxExtractionCallsPerDay,
    ),
    defaultContextMemoryLimit: positiveInteger(
      override.defaultContextMemoryLimit,
      settings.defaultContextMemoryLimit,
    ),
    ...(override.extractModel !== undefined
      ? {
          extractModel: override.extractModel.trim().length > 0 ? override.extractModel : undefined,
        }
      : {}),
    ...(override.consolidationModel !== undefined
      ? {
          consolidationModel:
            override.consolidationModel.trim().length > 0 ? override.consolidationModel : undefined,
        }
      : {}),
    minStartupIdleMs: positiveInteger(override.minStartupIdleMs, settings.minStartupIdleMs),
    maxStartupSessionAgeMs: positiveInteger(
      override.maxStartupSessionAgeMs,
      settings.maxStartupSessionAgeMs,
    ),
    maxSessionsPerStartup: positiveInteger(
      override.maxSessionsPerStartup,
      settings.maxSessionsPerStartup,
    ),
    startupConcurrency: positiveInteger(override.startupConcurrency, settings.startupConcurrency),
    maxRawMemoriesForConsolidation: positiveInteger(
      override.maxRawMemoriesForConsolidation,
      settings.maxRawMemoriesForConsolidation,
    ),
    maxUnusedStageOneDays: positiveInteger(
      override.maxUnusedStageOneDays,
      settings.maxUnusedStageOneDays,
    ),
  }
}

export { DEFAULT_LEARNER_MEMORY_SETTINGS, readLearnerMemorySettings }
export type { LearnerMemorySettings }
