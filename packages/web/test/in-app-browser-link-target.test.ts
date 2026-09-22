import { describe, expect, test } from "bun:test"
import {
  resolveInAppBrowserLinkDestination,
  shouldOfferInAppBrowserForLink,
} from "../src/lib/in-app-browser-link-target"

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

  test("offers the Browser only for plain clicks it could open while links go to the system browser", () => {
    const systemPreferred = { ...BROWSER_PREFERRED, linkTarget: "system" as const }
    expect(shouldOfferInAppBrowserForLink(systemPreferred)).toBe(true)
    expect(shouldOfferInAppBrowserForLink(BROWSER_PREFERRED)).toBe(false)
    expect(shouldOfferInAppBrowserForLink({ ...systemPreferred, modified: true })).toBe(false)
    expect(shouldOfferInAppBrowserForLink({ ...systemPreferred, browserAvailable: false })).toBe(
      false,
    )
    expect(
      shouldOfferInAppBrowserForLink({ ...systemPreferred, url: "mailto:hi@hibuddy.in" }),
    ).toBe(false)
  })
})
