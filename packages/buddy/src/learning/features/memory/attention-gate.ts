import type { AttentionDecision, EvaluationFixture, EvaluationMessage } from "./types"
import type { LearnerMemorySettings } from "./settings"
import type { LearnerEventType } from "./types"
import {
  ACTIVE_BURST_GAP_MS,
  EXTRACTION_ATTENTION_THRESHOLD,
  LEARNER_MEMORY_ATTENTION_TUNING,
  MIN_ACTIVE_BURST_MESSAGES,
  MIN_ASSISTANT_OUTPUT_TOKENS_FOR_EXTRACTION,
  MIN_NON_SYNTHETIC_USER_MESSAGES_FOR_EXTRACTION,
  MIN_SESSION_SPAN_MS_FOR_EXTRACTION,
} from "./tuning"

const DETERMINISTIC_LEARNING_EVENT_TYPES: ReadonlySet<LearnerEventType> = new Set(
  LEARNER_MEMORY_ATTENTION_TUNING.deterministicLearningEventTypes,
)
const INCIDENTAL_TOOL_NAMES: ReadonlySet<string> = new Set(
  LEARNER_MEMORY_ATTENTION_TUNING.incidentalToolNames,
)

type LearnerMemoryAttentionSettings = Pick<
  LearnerMemorySettings,
  | "minUserMessages"
  | "minSessionSpanMs"
  | "activeBurstGapMs"
  | "minActiveBurstMessages"
  | "minAssistantOutputTokens"
  | "attentionThreshold"
>

const DEFAULT_ATTENTION_SETTINGS: LearnerMemoryAttentionSettings = {
  minUserMessages: MIN_NON_SYNTHETIC_USER_MESSAGES_FOR_EXTRACTION,
  minSessionSpanMs: MIN_SESSION_SPAN_MS_FOR_EXTRACTION,
  activeBurstGapMs: ACTIVE_BURST_GAP_MS,
  minActiveBurstMessages: MIN_ACTIVE_BURST_MESSAGES,
  minAssistantOutputTokens: MIN_ASSISTANT_OUTPUT_TOKENS_FOR_EXTRACTION,
  attentionThreshold: EXTRACTION_ATTENTION_THRESHOLD,
}

function isNonSyntheticUserMessage(message: EvaluationMessage): boolean {
  return message.role === "user" && message.synthetic !== true && message.ignored !== true
}

function messageTime(message: EvaluationMessage): number {
  return new Date(message.createdAt).getTime()
}

function sessionSpanMs(messages: readonly EvaluationMessage[]): number {
  const userTimes = messages.filter(isNonSyntheticUserMessage).map(messageTime).toSorted()
  const first = userTimes[0]
  const last = userTimes.at(-1)
  if (first === undefined || last === undefined) return 0
  return Math.max(0, last - first)
}

function activeBurstCount(
  messages: readonly EvaluationMessage[],
  settings: LearnerMemoryAttentionSettings,
): number {
  const userTimes = messages.filter(isNonSyntheticUserMessage).map(messageTime).toSorted()
  if (userTimes.length === 0) return 0

  let left = 0
  let longest = 0
  for (let right = 0; right < userTimes.length; right += 1) {
    const rightTime = userTimes[right]
    if (rightTime === undefined) continue
    while (left < right) {
      const leftTime = userTimes[left]
      if (leftTime === undefined || rightTime - leftTime <= settings.activeBurstGapMs) break
      left += 1
    }
    longest = Math.max(longest, right - left + 1)
  }

  return longest
}

function meaningfulToolCallCount(messages: readonly EvaluationMessage[]): number {
  return messages.reduce(
    (count, message) =>
      count +
      (message.toolNames ?? []).filter((toolName) => {
        const normalized = toolName.toLowerCase().replace(/[^a-z0-9_]+/gu, "_")
        if (INCIDENTAL_TOOL_NAMES.has(normalized)) return false
        return LEARNER_MEMORY_ATTENTION_TUNING.meaningfulToolNamePattern.test(normalized)
      }).length,
    0,
  )
}

function assistantOutputTokens(messages: readonly EvaluationMessage[]): number {
  return messages.reduce((total, message) => total + (message.outputTokens ?? 0), 0)
}

function hasExplicitMemoryAction(messages: readonly EvaluationMessage[]): boolean {
  return messages
    .filter(isNonSyntheticUserMessage)
    .some((message) =>
      LEARNER_MEMORY_ATTENTION_TUNING.explicitMemoryActionPattern.test(message.text),
    )
}

function decideLearnerMemoryAttention(
  fixture: EvaluationFixture,
  inputSettings?: Partial<LearnerMemoryAttentionSettings>,
): AttentionDecision {
  const settings = {
    ...DEFAULT_ATTENTION_SETTINGS,
    ...inputSettings,
  }
  const nonSyntheticUserMessages = fixture.messages.filter(isNonSyntheticUserMessage).length
  const spanMs = sessionSpanMs(fixture.messages)
  const burst = activeBurstCount(fixture.messages, settings)
  const meaningfulToolCalls = meaningfulToolCallCount(fixture.messages)
  const outputTokens = assistantOutputTokens(fixture.messages)
  const deterministicLearningEvents = fixture.learningEvents.filter((event) =>
    DETERMINISTIC_LEARNING_EVENT_TYPES.has(event.type),
  ).length
  const modelExtractionEvents = fixture.learningEvents.filter(
    (event) => event.type === LEARNER_MEMORY_ATTENTION_TUNING.fixtureSessionEventType,
  ).length
  const explicitMemoryAction = hasExplicitMemoryAction(fixture.messages)
  const reasons: string[] = []

  if (explicitMemoryAction && meaningfulToolCalls === 0 && modelExtractionEvents === 0) {
    return {
      fixtureId: fixture.id,
      decision: "skip",
      score: 0,
      reasons: ["explicit_memory_action", "deterministic_correction_route"],
    }
  }

  let score = Math.min(
    LEARNER_MEMORY_ATTENTION_TUNING.maxUserMessageScore,
    Math.floor(nonSyntheticUserMessages / LEARNER_MEMORY_ATTENTION_TUNING.userMessageScoreDivisor),
  )
  if (spanMs >= settings.minSessionSpanMs) {
    score += LEARNER_MEMORY_ATTENTION_TUNING.sessionSpanScore
    reasons.push("session_span")
  }
  if (burst >= settings.minActiveBurstMessages) {
    score += LEARNER_MEMORY_ATTENTION_TUNING.activeBurstScore
    reasons.push("active_burst")
  }
  if (outputTokens >= settings.minAssistantOutputTokens) {
    score += LEARNER_MEMORY_ATTENTION_TUNING.assistantEffortScore
    reasons.push("assistant_effort")
  }
  if (meaningfulToolCalls > 0) {
    score += LEARNER_MEMORY_ATTENTION_TUNING.meaningfulToolWorkScore
    reasons.push("meaningful_tool_work")
  }
  if (modelExtractionEvents > 0) {
    score += LEARNER_MEMORY_ATTENTION_TUNING.modelExtractionFixtureScore
    reasons.push("model_extraction_fixture")
  }
  if (deterministicLearningEvents > 0) {
    reasons.push("deterministic_learning_artifact")
  }
  if (explicitMemoryAction) {
    reasons.push("explicit_memory_action")
  }

  if (
    deterministicLearningEvents > 0 &&
    nonSyntheticUserMessages < settings.minUserMessages &&
    score < settings.attentionThreshold
  ) {
    return {
      fixtureId: fixture.id,
      decision: "skip",
      score,
      reasons: [...reasons, "deterministic_artifact_already_handled"],
    }
  }

  if (nonSyntheticUserMessages < settings.minUserMessages && modelExtractionEvents === 0) {
    return {
      fixtureId: fixture.id,
      decision: "skip",
      score,
      reasons: [...reasons, "too_few_user_messages"],
    }
  }

  return {
    fixtureId: fixture.id,
    decision: score >= settings.attentionThreshold ? "extract" : "skip",
    score,
    reasons: score >= settings.attentionThreshold ? reasons : [...reasons, "below_threshold"],
  }
}

export {
  decideLearnerMemoryAttention,
  MIN_NON_SYNTHETIC_USER_MESSAGES_FOR_EXTRACTION,
  MIN_SESSION_SPAN_MS_FOR_EXTRACTION,
  ACTIVE_BURST_GAP_MS,
  MIN_ACTIVE_BURST_MESSAGES,
  MIN_ASSISTANT_OUTPUT_TOKENS_FOR_EXTRACTION,
  EXTRACTION_ATTENTION_THRESHOLD,
}
