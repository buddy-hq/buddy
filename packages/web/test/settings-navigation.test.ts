import { describe, expect, test } from "bun:test"
import { encodeDirectory } from "../src/lib/directory-token"
import {
  buildSettingsSearch,
  readSettingsReturnTo,
  resolveSettingsReturnLocation,
  settingsSearchForTab,
} from "../src/lib/settings-navigation"

const DIRECTORY = "/workspace/buddy"
const DIRECTORY_TOKEN = encodeDirectory(DIRECTORY)

describe("settings navigation", () => {
  test("retains exact root, directory chat, and Bench routes", () => {
    const routes = [
      "/chat?session=session-1",
      `/${DIRECTORY_TOKEN}/chat?session=session-2`,
      `/${DIRECTORY_TOKEN}/markdown?path=notes%2Fplan.md&chat=floating&session=session-3`,
      `/${DIRECTORY_TOKEN}/objects/resource/resource-1?view=reader&session=session-4`,
    ]

    for (const route of routes) {
      expect(readSettingsReturnTo(route)).toBe(route)
    }
  })

  test("rejects external, Settings, malformed directory, and invalid Bench locations", () => {
    const routes = [
      "https://example.com/chat",
      "//example.com/chat",
      "/settings?tab=general",
      "/not-a-directory-token/chat",
      `/${DIRECTORY_TOKEN}/objects/not-a-kind/object-1`,
      `/${DIRECTORY_TOKEN}/objects/resource/resource-1/extra?view=reader`,
      `/${DIRECTORY_TOKEN}/markdown`,
      `/${DIRECTORY_TOKEN}/chat#fragment`,
    ]

    for (const route of routes) {
      expect(readSettingsReturnTo(route)).toBeUndefined()
    }
  })

  test("builds validated search without carrying an invalid return location", () => {
    expect(
      buildSettingsSearch({
        tab: "general",
        returnTo: `/${DIRECTORY_TOKEN}/chat?session=session-1`,
      }),
    ).toEqual({
      tab: "general",
      returnTo: `/${DIRECTORY_TOKEN}/chat?session=session-1`,
    })
    expect(buildSettingsSearch({ tab: "general", returnTo: "/settings" })).toEqual({
      tab: "general",
    })
  })

  test("preserves the exact Bench return route through Settings tab changes", () => {
    const returnTo =
      `/${DIRECTORY_TOKEN}/objects/resource/resource-1` +
      "?view=reader&chat=floating&session=session-1"
    const initialSearch = buildSettingsSearch({ tab: "general", returnTo })
    const changedSearch = settingsSearchForTab(initialSearch, "providers")

    expect(changedSearch).toEqual({
      tab: "providers",
      returnTo,
    })
    expect(resolveSettingsReturnLocation(changedSearch)).toBe(returnTo)
  })

  test("falls back to active directory chat and then root chat", () => {
    expect(
      resolveSettingsReturnLocation({
        returnTo: "/settings?tab=general",
        activeDirectory: DIRECTORY,
      }),
    ).toBe(`/${DIRECTORY_TOKEN}/chat`)
    expect(resolveSettingsReturnLocation({})).toBe("/chat")
  })
})
