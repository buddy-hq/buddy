import { describe, expect, test } from "bun:test"
import {
  getSettingsTabFallback,
  getVisibleSettingsTabDefinitions,
  isCoreSettingsTab,
} from "../src/components/settings/settings-tabs"

describe("Browser settings tab", () => {
  test("is listed with the core tabs only when the desktop Browser is available", () => {
    const withoutBrowser = getVisibleSettingsTabDefinitions({
      standardsEnabled: false,
      enabledExperimentalFeatureIDs: new Set(),
    })
    const withBrowser = getVisibleSettingsTabDefinitions({
      standardsEnabled: false,
      enabledExperimentalFeatureIDs: new Set(),
      inAppBrowserAvailable: true,
    })

    expect(withoutBrowser.map((tab) => tab.id)).not.toContain("browser")
    expect(withBrowser.filter(isCoreSettingsTab).map((tab) => tab.id)).toContain("browser")
  })

  test("sends a Browser deep link opened without the desktop Browser to General", () => {
    expect(getSettingsTabFallback("browser")).toBe("general")
  })
})
