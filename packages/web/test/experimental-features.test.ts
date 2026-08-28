import { describe, expect, test } from "bun:test"
import {
  EXPERIMENTAL_FEATURE_ID,
  experimentalFeatureIsEnabled,
} from "../src/state/experimental-features-query"
import {
  getVisibleSettingsTabDefinitions,
  isCoreSettingsTab,
} from "../src/components/settings/settings-tabs"

describe("experimentalFeatureIsEnabled", () => {
  test("fails closed before the experimental feature catalog loads", () => {
    expect(experimentalFeatureIsEnabled(undefined, EXPERIMENTAL_FEATURE_ID.learnerMemory)).toBe(
      false,
    )
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

function revealedTabIds(input: Parameters<typeof getVisibleSettingsTabDefinitions>[0]) {
  return getVisibleSettingsTabDefinitions(input)
    .filter((tab) => !isCoreSettingsTab(tab))
    .map((tab) => tab.id)
}

describe("optional capability reveal", () => {
  test("reveals nothing for a reader with no capability turned on", () => {
    expect(
      revealedTabIds({
        standardsEnabled: false,
        enabledExperimentalFeatureIDs: new Set(),
      }),
    ).toEqual([])
  })

  test("memory reveals only the memory tab", () => {
    expect(
      revealedTabIds({
        standardsEnabled: false,
        enabledExperimentalFeatureIDs: new Set([EXPERIMENTAL_FEATURE_ID.learnerMemory]),
      }),
    ).toEqual(["memory"])
  })

  test("standards reveals only the standards tab", () => {
    expect(
      revealedTabIds({
        standardsEnabled: true,
        enabledExperimentalFeatureIDs: new Set(),
      }),
    ).toEqual(["standards"])
  })

  test("teachers see standards before it is installed, so they can install it", () => {
    expect(
      revealedTabIds({
        standardsEnabled: false,
        primaryUse: "teach",
        enabledExperimentalFeatureIDs: new Set(),
      }),
    ).toEqual(["standards"])
  })

  test("both capabilities reveal both tabs", () => {
    expect(
      revealedTabIds({
        standardsEnabled: true,
        enabledExperimentalFeatureIDs: new Set([EXPERIMENTAL_FEATURE_ID.learnerMemory]),
      }),
    ).toEqual(["standards", "memory"])
  })
})
