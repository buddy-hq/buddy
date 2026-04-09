import { beforeEach, describe, expect, test } from "bun:test"
import { applyOnboardingModelSelection } from "../src/lib/onboarding-model-selection"
import {
  getModelSelectionScopeKey,
  useModelSelectionStore,
} from "../src/state/model-selection-store"

describe("applyOnboardingModelSelection", () => {
  beforeEach(() => {
    localStorage.clear()
    useModelSelectionStore.setState({
      selectionSourceByKey: {},
      restoredSelectionCreatedAtByKey: {},
      selectedAgentByKey: {},
      selectedModelByKey: {},
      selectedVariantByKey: {},
      recentModelKeys: ["anthropic/claude-sonnet-4"],
    })
  })

  test("seeds the notebook draft model and updates recent models", () => {
    applyOnboardingModelSelection("/repo", "openai/gpt-5-mini")

    expect(
      useModelSelectionStore.getState().selectedModelByKey[getModelSelectionScopeKey("/repo")],
    ).toBe("openai/gpt-5-mini")
    expect(useModelSelectionStore.getState().recentModelKeys).toEqual([
      "openai/gpt-5-mini",
      "anthropic/claude-sonnet-4",
    ])
  })
})
