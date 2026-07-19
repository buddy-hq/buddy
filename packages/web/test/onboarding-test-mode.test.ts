import { describe, expect, test } from "bun:test"
import {
  buildOnboardingTestSearch,
  isOnboardingTestSearch,
  ONBOARDING_TEST_SEARCH_VALUE,
  runOnboardingTestReset,
} from "../src/lib/onboarding-test-mode"

describe("onboarding test reset", () => {
  test("builds a test route without an exit destination", () => {
    const search = buildOnboardingTestSearch()

    expect(search).toEqual({ test: ONBOARDING_TEST_SEARCH_VALUE })
    expect(isOnboardingTestSearch(search)).toBe(true)
  })

  test("clears durable state and refreshes the provider before resetting local onboarding", async () => {
    const calls: string[] = []

    await runOnboardingTestReset({
      clearPersonalization: async () => {
        calls.push("clear-personalization")
      },
      disconnectOpenAiAndReloadProviderRuntime: async () => {
        calls.push("disconnect-openai-and-reload-provider-runtime")
      },
      refreshProviderCatalog: async () => {
        calls.push("refresh-provider-catalog")
      },
      resetOnboardingState: () => {
        calls.push("reset-onboarding-state")
      },
    })

    expect(calls).toEqual([
      "clear-personalization",
      "disconnect-openai-and-reload-provider-runtime",
      "refresh-provider-catalog",
      "reset-onboarding-state",
    ])
  })

  test("does not reset local onboarding when durable cleanup fails", async () => {
    const calls: string[] = []

    await expect(
      runOnboardingTestReset({
        clearPersonalization: async () => {
          calls.push("clear-personalization")
        },
        disconnectOpenAiAndReloadProviderRuntime: async () => {
          calls.push("disconnect-openai-and-reload-provider-runtime")
          throw new Error("disconnect failed")
        },
        refreshProviderCatalog: async () => {
          calls.push("refresh-provider-catalog")
        },
        resetOnboardingState: () => {
          calls.push("reset-onboarding-state")
        },
      }),
    ).rejects.toThrow("disconnect failed")

    expect(calls).toEqual([
      "clear-personalization",
      "disconnect-openai-and-reload-provider-runtime",
    ])
  })
})
