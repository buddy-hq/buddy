export const BUDDY_OPENAI_PROVIDER_ID = "openai"
export const PI_CODEX_PROVIDER_ID = "openai-codex"

export function buddyProviderIDFromPi(providerID: string) {
  return providerID === PI_CODEX_PROVIDER_ID ? BUDDY_OPENAI_PROVIDER_ID : providerID
}

export function piProviderCandidatesFromBuddy(providerID: string) {
  return providerID === BUDDY_OPENAI_PROVIDER_ID
    ? [PI_CODEX_PROVIDER_ID, BUDDY_OPENAI_PROVIDER_ID]
    : [providerID]
}
