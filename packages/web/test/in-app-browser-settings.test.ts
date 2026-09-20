import { describe, expect, test } from "bun:test"
import {
  DEFAULT_IN_APP_BROWSER_PROFILE_ID,
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  parseInAppBrowserProfileID,
} from "@buddy/browser-contract/profiles"
import {
  addInAppBrowserProfile,
  DEFAULT_IN_APP_BROWSER_SETTINGS,
  parseInAppBrowserSettings,
  removeInAppBrowserProfile,
  renameInAppBrowserProfile,
} from "../src/lib/in-app-browser-settings"
import {
  useInAppBrowserSettingsStore,
  waitForInAppBrowserSettingsHydration,
} from "../src/state/in-app-browser-settings-store"

function profileID(value: string) {
  const id = parseInAppBrowserProfileID(value)
  if (!id) throw new Error(`Invalid test profile ID ${value}`)
  return id
}

function addedProfile(name: string, id: string) {
  const result = addInAppBrowserProfile(DEFAULT_IN_APP_BROWSER_SETTINGS, { id, name })
  if (result["_tag"] !== "added") throw new Error(`Expected ${name} to be added.`)
  return result
}

describe("Browser settings", () => {
  test("falls back to defaults field by field when persisted settings are unusable", () => {
    expect(
      parseInAppBrowserSettings({
        linkTarget: "browser",
        defaultSearchEngine: "askjeeves",
        defaultZoomFactor: 1.3,
        defaultAppearance: "sepia",
        defaultProfileID: "work",
        userProfiles: [
          { id: "default", name: "Shadow default" },
          { id: "school", name: "School" },
          { id: "school", name: "School copy" },
          { id: "bad id", name: "Bad" },
        ],
      }),
    ).toEqual({
      linkTarget: "browser",
      defaultSearchEngine: "google",
      defaultZoomFactor: 1,
      defaultAppearance: "system",
      defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
      userProfiles: [{ id: profileID("school"), name: "School" }],
    })
  })

  test("never makes Incognito the default profile", () => {
    expect(
      parseInAppBrowserSettings({ defaultProfileID: INCOGNITO_IN_APP_BROWSER_PROFILE_ID })
        .defaultProfileID,
    ).toBe(DEFAULT_IN_APP_BROWSER_PROFILE_ID)
  })

  test("adds and renames profiles with trimmed names and rejects built-in IDs", () => {
    const { settings, profile } = addedProfile("  Work  ", "work")
    expect(profile.name).toBe("Work")
    expect(
      renameInAppBrowserProfile(settings, { id: profile.id, name: " Job " }).userProfiles,
    ).toEqual([{ id: profile.id, name: "Job" }])
    expect(addInAppBrowserProfile(settings, { id: "incognito", name: "Sneaky" })).toEqual({
      _tag: "rejected",
      reason: "invalid-name",
    })
  })

  test("moves the default back to Default when its profile is removed", () => {
    const { settings, profile } = addedProfile("Work", "work")
    const withWorkDefault = {
      ...settings,
      defaultProfileID: profile.id,
      defaultSearchEngine: "google" as const,
    }
    expect(removeInAppBrowserProfile(withWorkDefault, profile.id)).toEqual({
      ...DEFAULT_IN_APP_BROWSER_SETTINGS,
      defaultSearchEngine: "google",
    })
  })

  test("parses a supported search engine without disturbing other defaults", () => {
    expect(parseInAppBrowserSettings({ defaultSearchEngine: "google" })).toEqual({
      ...DEFAULT_IN_APP_BROWSER_SETTINGS,
      defaultSearchEngine: "google",
    })
  })

  test("keeps the selected search engine across the store persistence boundary", () => {
    const partialize = useInAppBrowserSettingsStore.persist.getOptions().partialize
    if (!partialize) throw new Error("Expected Browser settings persistence projection")
    const persisted = partialize({
      ...useInAppBrowserSettingsStore.getState(),
      defaultSearchEngine: "google",
    })

    expect(persisted).toMatchObject({ defaultSearchEngine: "google" })
    expect(parseInAppBrowserSettings(persisted).defaultSearchEngine).toBe("google")
  })

  test("reports failed asynchronous hydration instead of waiting forever", async () => {
    const persist = useInAppBrowserSettingsStore.persist
    const originalStorage = persist.getOptions().storage
    if (!originalStorage) throw new Error("Expected Browser settings storage")
    persist.setOptions({
      storage: {
        ...originalStorage,
        getItem: async () => {
          throw new Error("corrupt settings")
        },
      },
    })
    try {
      await persist.rehydrate()
      expect(await waitForInAppBrowserSettingsHydration()).toBe(false)
    } finally {
      persist.setOptions({ storage: originalStorage })
      await persist.rehydrate()
    }
  })
})
