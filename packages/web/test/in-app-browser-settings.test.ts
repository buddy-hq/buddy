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
  withInAppBrowserLinkTarget,
} from "../src/lib/in-app-browser-settings"
import { parseInAppBrowserZoomHost } from "../src/lib/in-app-browser-zoom"
import {
  useInAppBrowserSettingsStore,
  waitForInAppBrowserSettingsHydration,
} from "../src/state/in-app-browser-settings-store"

function profileID(value: string) {
  const id = parseInAppBrowserProfileID(value)
  if (!id) throw new Error(`Invalid test profile ID ${value}`)
  return id
}

function zoomHost(value: string) {
  const origin = parseInAppBrowserZoomHost(value)
  if (!origin) throw new Error(`Invalid test zoom host ${value}`)
  return origin
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
      modifiedLinkTarget: "system",
      defaultSearchEngine: "google",
      defaultZoomFactor: 1,
      zoomFactorsByProfile: {},
      defaultAppearance: "system",
      defaultProfileID: DEFAULT_IN_APP_BROWSER_PROFILE_ID,
      userProfiles: [{ id: profileID("school"), name: "School" }],
    })
  })

  test("sends Cmd/Ctrl-click to the other destination for records saved before it was a setting", () => {
    expect(parseInAppBrowserSettings({ linkTarget: "browser" })).toEqual({
      ...DEFAULT_IN_APP_BROWSER_SETTINGS,
      linkTarget: "browser",
      modifiedLinkTarget: "system",
    })
    expect(parseInAppBrowserSettings({ linkTarget: "system" }).modifiedLinkTarget).toBe("browser")
    expect(parseInAppBrowserSettings({}).modifiedLinkTarget).toBe("browser")
    expect(
      parseInAppBrowserSettings({ linkTarget: "browser", modifiedLinkTarget: "alternate" })
        .modifiedLinkTarget,
    ).toBe("system")
    expect(parseInAppBrowserSettings({ modifiedLinkTarget: "sideways" }).modifiedLinkTarget).toBe(
      "browser",
    )
  })

  test("swaps Cmd/Ctrl-click when the click destination takes its value", () => {
    const defaults = { linkTarget: "system", modifiedLinkTarget: "browser" } as const
    expect(withInAppBrowserLinkTarget(defaults, "browser")).toEqual({
      linkTarget: "browser",
      modifiedLinkTarget: "system",
    })
    expect(
      withInAppBrowserLinkTarget({ linkTarget: "system", modifiedLinkTarget: "system" }, "browser"),
    ).toEqual({ linkTarget: "browser", modifiedLinkTarget: "system" })
    expect(withInAppBrowserLinkTarget(defaults, "system")).toEqual(defaults)
  })

  test("restores a saved Cmd/Ctrl-click destination", () => {
    expect(parseInAppBrowserSettings({ modifiedLinkTarget: "system" }).modifiedLinkTarget).toBe(
      "system",
    )
    expect(parseInAppBrowserSettings({ modifiedLinkTarget: "browser" }).modifiedLinkTarget).toBe(
      "browser",
    )
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
    const host = zoomHost("https://work.example")
    const withWorkDefault = {
      ...settings,
      defaultProfileID: profile.id,
      defaultSearchEngine: "google" as const,
      zoomFactorsByProfile: { [profile.id]: { [host]: 1.25 as const } },
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

  test("restores bounded zoom overrides only for persistent profiles and HTTP hosts", () => {
    const work = profileID("work")

    expect(
      parseInAppBrowserSettings({
        userProfiles: [{ id: work, name: "Work" }],
        zoomFactorsByProfile: {
          default: {
            "example.com": 1.25,
            "https://example.org": 1.5,
            "Example.NET": 1.5,
            "localhost:3000": 1.5,
            "invalid-factor.example": 1.3,
          },
          work: { localhost: 0.9 },
          incognito: { "private.example": 2 },
          removed: { "removed.example": 1.75 },
        },
      }).zoomFactorsByProfile,
    ).toEqual({
      [DEFAULT_IN_APP_BROWSER_PROFILE_ID]: { "example.com": 1.25 },
      [work]: { localhost: 0.9 },
    })
  })

  test("keeps regular-profile zoom and omits Incognito zoom at the persistence boundary", () => {
    const partialize = useInAppBrowserSettingsStore.persist.getOptions().partialize
    if (!partialize) throw new Error("Expected Browser settings persistence projection")
    const regularHost = zoomHost("https://example.com")
    const privateHost = zoomHost("https://private.example")
    const persisted = partialize({
      ...useInAppBrowserSettingsStore.getState(),
      defaultSearchEngine: "google",
      zoomFactorsByProfile: {
        [DEFAULT_IN_APP_BROWSER_PROFILE_ID]: { [regularHost]: 1.25 },
        [INCOGNITO_IN_APP_BROWSER_PROFILE_ID]: { [privateHost]: 1.5 },
      },
    })

    expect(persisted).toMatchObject({ defaultSearchEngine: "google" })
    expect(parseInAppBrowserSettings(persisted)).toMatchObject({
      defaultSearchEngine: "google",
      zoomFactorsByProfile: {
        [DEFAULT_IN_APP_BROWSER_PROFILE_ID]: { [regularHost]: 1.25 },
      },
    })
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
