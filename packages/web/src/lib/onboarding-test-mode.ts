import { parseTJsonObject } from "@/components/chat/tools/types"

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

export function isOnboardingTestSearch<TSearch>(
  search: TSearch,
): search is TSearch & OnboardingTestSearch {
  const record = parseTJsonObject(search)
  if (!record) {
    return false
  }

  if (!(ONBOARDING_TEST_SEARCH_KEY in record)) {
    return false
  }

  return record.test === ONBOARDING_TEST_SEARCH_VALUE
}
