export const CHAT_ENTRY_PATH = "/chat" as const
export const ONBOARDING_TEST_SEARCH_KEY = "test" as const
export const ONBOARDING_TEST_SEARCH_VALUE = "onboarding" as const
export const ONBOARDING_TEST_RETURN_TO_SEARCH_KEY = "returnTo" as const

export type OnboardingTestSearch = {
  test?: typeof ONBOARDING_TEST_SEARCH_VALUE
  returnTo?: string
}

export type OnboardingTestResetOperations = {
  clearPersonalization: () => Promise<void>
  disconnectOpenAiAndReloadProviderRuntime: () => Promise<void>
  refreshProviderCatalog: () => Promise<void>
  resetOnboardingState: () => void
}

export async function runOnboardingTestReset(
  operations: OnboardingTestResetOperations,
): Promise<void> {
  await operations.clearPersonalization()
  await operations.disconnectOpenAiAndReloadProviderRuntime()
  await operations.refreshProviderCatalog()
  operations.resetOnboardingState()
}

export function buildOnboardingTestSearch(returnTo?: string): OnboardingTestSearch {
  return returnTo
    ? { test: ONBOARDING_TEST_SEARCH_VALUE, returnTo }
    : { test: ONBOARDING_TEST_SEARCH_VALUE }
}

export function buildOnboardingChatEntryReturnTo() {
  const search = new URLSearchParams()
  search.set(ONBOARDING_TEST_SEARCH_KEY, ONBOARDING_TEST_SEARCH_VALUE)
  return `${CHAT_ENTRY_PATH}?${search.toString()}`
}

export function isOnboardingTestSearch(search: unknown): search is OnboardingTestSearch {
  if (typeof search !== "object" || search === null) {
    return false
  }

  if (!(ONBOARDING_TEST_SEARCH_KEY in search)) {
    return false
  }

  return search.test === ONBOARDING_TEST_SEARCH_VALUE
}

export function readOnboardingTestReturnTo(search: unknown): string | undefined {
  if (typeof search !== "object" || search === null) {
    return undefined
  }

  if (!(ONBOARDING_TEST_RETURN_TO_SEARCH_KEY in search)) {
    return undefined
  }

  return typeof search.returnTo === "string" && search.returnTo.length > 0
    ? search.returnTo
    : undefined
}
