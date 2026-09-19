import { describe, expect, test } from "bun:test"
import {
  DEFAULT_IN_APP_BROWSER_PROFILE_ID,
  INCOGNITO_IN_APP_BROWSER_PROFILE_ID,
  inAppBrowserProfilePartition,
  parseInAppBrowserPartition,
  parseInAppBrowserProfileID,
  parseInAppBrowserProfileName,
  resolveInAppBrowserProfiles,
} from "./profiles"

function profileID(value: string) {
  const id = parseInAppBrowserProfileID(value)
  if (!id) throw new Error(`Expected ${value} to be a valid profile ID.`)
  return id
}

describe("Browser profile partitions", () => {
  test("keeps the partition Buddy used before profiles so existing logins survive", () => {
    expect(inAppBrowserProfilePartition(DEFAULT_IN_APP_BROWSER_PROFILE_ID)).toBe(
      "persist:buddy-browser",
    )
  })

  test("keeps Incognito out of persistent storage", () => {
    expect(inAppBrowserProfilePartition(INCOGNITO_IN_APP_BROWSER_PROFILE_ID)).not.toStartWith(
      "persist:",
    )
  })

  test("maps each partition back to exactly one profile", () => {
    const work = profileID("work")
    for (const id of [DEFAULT_IN_APP_BROWSER_PROFILE_ID, INCOGNITO_IN_APP_BROWSER_PROFILE_ID, work]) {
      expect(parseInAppBrowserPartition(inAppBrowserProfilePartition(id))).toBe(id)
    }
    expect(parseInAppBrowserPartition("persist:buddy-browser-profile-default")).toBeUndefined()
    expect(parseInAppBrowserPartition("persist:buddy-browser-profile-Work")).toBeUndefined()
    expect(parseInAppBrowserPartition("persist:other")).toBeUndefined()
  })
})

describe("Browser profile parsing", () => {
  test("rejects IDs that could escape the partition namespace", () => {
    expect(parseInAppBrowserProfileID("../default")).toBeUndefined()
    expect(parseInAppBrowserProfileID("-work")).toBeUndefined()
    expect(parseInAppBrowserProfileID("a".repeat(65))).toBeUndefined()
    expect(parseInAppBrowserProfileID(42)).toBeUndefined()
  })

  test("trims names and rejects empty, oversized, and control-character names", () => {
    expect(parseInAppBrowserProfileName("  Work  ")).toBe("Work")
    expect(parseInAppBrowserProfileName("   ")).toBeUndefined()
    expect(parseInAppBrowserProfileName("x".repeat(49))).toBeUndefined()
    expect(parseInAppBrowserProfileName("Work\u0000")).toBeUndefined()
  })

  test("lists built-ins first and drops profiles that would share a partition", () => {
    const work = profileID("work")
    expect(
      resolveInAppBrowserProfiles([
        { id: DEFAULT_IN_APP_BROWSER_PROFILE_ID, name: "Shadow" },
        { id: work, name: "Work" },
        { id: work, name: "Work again" },
      ]).map((profile) => profile.name),
    ).toEqual(["Default", "Incognito", "Work"])
  })
})
