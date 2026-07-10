import { describe, expect, test } from "bun:test"
import {
  EXPERIMENTAL_FEATURE_ID,
  experimentalFeatureIsEnabled,
} from "../src/state/experimental-features-query"
import { getVisibleSettingsTabDefinitions } from "../src/components/settings/settings-tabs"

describe("experimentalFeatureIsEnabled", () => {
  test("fails closed before the experimental feature catalog loads", () => {
    expect(
      experimentalFeatureIsEnabled(undefined, EXPERIMENTAL_FEATURE_ID.learnerMemory),
    ).toBe(false)
  })

  test("only enables an explicitly opted-in feature", () => {
    expect(
      experimentalFeatureIsEnabled(
        {
          features: [{ id: EXPERIMENTAL_FEATURE_ID.learnerMemory, enabled: true }],
        },
        EXPERIMENTAL_FEATURE_ID.learnerMemory,
      ),
    ).toBe(true)
  })
})

describe("experimental settings visibility", () => {
  test("hides learner memory until the experiment is enabled", () => {
    const hidden = getVisibleSettingsTabDefinitions({
      standardsEnabled: false,
      enabledExperimentalFeatureIDs: new Set(),
    })
    const visible = getVisibleSettingsTabDefinitions({
      standardsEnabled: false,
      enabledExperimentalFeatureIDs: new Set([EXPERIMENTAL_FEATURE_ID.learnerMemory]),
    })

    expect(hidden.some((tab) => tab.id === "learnerMemory")).toBe(false)
    expect(visible.some((tab) => tab.id === "learnerMemory")).toBe(true)
  })
})
