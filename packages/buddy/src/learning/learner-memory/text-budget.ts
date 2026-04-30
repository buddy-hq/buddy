import { LEARNER_MEMORY_TOKEN_TUNING } from "./tuning"

type TruncatedText = {
  text: string
  truncated: boolean
  estimatedOriginalTokens: number
  estimatedKeptTokens: number
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / LEARNER_MEMORY_TOKEN_TUNING.approximateCharsPerToken)
}

function tokenBudgetFromContextWindow(input: {
  contextWindow?: number
  inputWindow?: number
  contextWindowPercent?: number
}): number {
  const contextWindow =
    input.inputWindow !== undefined && input.inputWindow > 0
      ? input.inputWindow
      : input.contextWindow !== undefined && input.contextWindow > 0
        ? input.contextWindow
        : LEARNER_MEMORY_TOKEN_TUNING.defaultContextWindowTokens
  const percent =
    input.contextWindowPercent ?? LEARNER_MEMORY_TOKEN_TUNING.defaultContextWindowPercent
  const usable = Math.floor((contextWindow * percent) / 100)
  return Math.max(
    LEARNER_MEMORY_TOKEN_TUNING.minTranscriptTokenBudget,
    usable -
      LEARNER_MEMORY_TOKEN_TUNING.reservedExtractionPromptTokens -
      LEARNER_MEMORY_TOKEN_TUNING.reservedExtractionOutputTokens,
  )
}

function truncateHeadTail(input: { text: string; tokenBudget: number }): TruncatedText {
  const estimatedOriginalTokens = estimateTokens(input.text)
  if (estimatedOriginalTokens <= input.tokenBudget) {
    return {
      text: input.text,
      truncated: false,
      estimatedOriginalTokens,
      estimatedKeptTokens: estimatedOriginalTokens,
    }
  }

  const characterBudget = input.tokenBudget * LEARNER_MEMORY_TOKEN_TUNING.approximateCharsPerToken
  const headLength = Math.floor(characterBudget / 2)
  const tailLength = characterBudget - headLength
  const droppedTokenEstimate = estimatedOriginalTokens - input.tokenBudget
  const marker = `\n\n[learner-memory-truncation: dropped approximately ${droppedTokenEstimate} middle tokens]\n\n`
  const text = `${input.text.slice(0, headLength)}${marker}${input.text.slice(-tailLength)}`

  return {
    text,
    truncated: true,
    estimatedOriginalTokens,
    estimatedKeptTokens: estimateTokens(text),
  }
}

export { estimateTokens, tokenBudgetFromContextWindow, truncateHeadTail }
export type { TruncatedText }
