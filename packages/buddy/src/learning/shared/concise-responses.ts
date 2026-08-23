export const DEFAULT_CONCISE_RESPONSES = true

export type ConciseResponseChatState = {
  base: boolean
  applied: boolean
}

type ConciseResponsesConfig = {
  concise_responses?: boolean
}

export function resolveConciseResponses(config: ConciseResponsesConfig): boolean {
  return config.concise_responses ?? DEFAULT_CONCISE_RESPONSES
}
