export const ONBOARDING_TEST_SEARCH_KEY = "test" as const
export const ONBOARDING_TEST_SEARCH_VALUE = "onboarding" as const

export type OnboardingTestSearch = {
  test?: typeof ONBOARDING_TEST_SEARCH_VALUE
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

export function buildOnboardingTestSearch(): OnboardingTestSearch {
  return { test: ONBOARDING_TEST_SEARCH_VALUE }
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
