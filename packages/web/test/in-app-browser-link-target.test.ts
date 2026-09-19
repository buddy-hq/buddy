import { describe, expect, test } from "bun:test"
import { resolveInAppBrowserLinkDestination } from "../src/lib/in-app-browser-link-target"

const BROWSER_PREFERRED = {
  url: "https://hibuddy.in/docs",
  linkTarget: "browser" as const,
  browserAvailable: true,
  modified: false,
}

describe("chat link destination", () => {
  test("opens web links in the Browser when the user prefers it", () => {
    expect(resolveInAppBrowserLinkDestination(BROWSER_PREFERRED)).toBe("browser")
  })

  test("keeps Cmd/Ctrl-click as the escape hatch to the system browser", () => {
    expect(resolveInAppBrowserLinkDestination({ ...BROWSER_PREFERRED, modified: true })).toBe(
      "system",
    )
  })

  test("sends links the Browser cannot load, or cannot show, to the system browser", () => {
    expect(
      resolveInAppBrowserLinkDestination({ ...BROWSER_PREFERRED, url: "mailto:hi@hibuddy.in" }),
    ).toBe("system")
    expect(
      resolveInAppBrowserLinkDestination({ ...BROWSER_PREFERRED, browserAvailable: false }),
    ).toBe("system")
    expect(resolveInAppBrowserLinkDestination({ ...BROWSER_PREFERRED, linkTarget: "system" })).toBe(
      "system",
    )
  })
})
