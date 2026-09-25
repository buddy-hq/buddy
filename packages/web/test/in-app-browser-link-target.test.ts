import { describe, expect, test } from "bun:test"
import {
  resolveInAppBrowserLinkDestination,
  shouldOfferInAppBrowserForLink,
} from "../src/lib/in-app-browser-link-target"

const BROWSER_PREFERRED = {
  url: "https://hibuddy.in/docs",
  linkTarget: "browser" as const,
  modifiedLinkTarget: "system" as const,
  browserAvailable: true,
  modified: false,
}

const SYSTEM_PREFERRED = {
  ...BROWSER_PREFERRED,
  linkTarget: "system" as const,
  modifiedLinkTarget: "browser" as const,
}

describe("chat link destination", () => {
  test("opens plain clicks where the user prefers", () => {
    expect(resolveInAppBrowserLinkDestination(BROWSER_PREFERRED)).toBe("browser")
    expect(resolveInAppBrowserLinkDestination(SYSTEM_PREFERRED)).toBe("system")
  })

  test("opens Cmd/Ctrl-clicks in the other destination by default", () => {
    expect(resolveInAppBrowserLinkDestination({ ...BROWSER_PREFERRED, modified: true })).toBe(
      "system",
    )
    expect(resolveInAppBrowserLinkDestination({ ...SYSTEM_PREFERRED, modified: true })).toBe(
      "browser",
    )
  })

  test("sends links the Browser cannot load to the system browser for any click", () => {
    for (const click of [BROWSER_PREFERRED, SYSTEM_PREFERRED]) {
      for (const modified of [false, true]) {
        expect(
          resolveInAppBrowserLinkDestination({ ...click, modified, url: "mailto:hi@hibuddy.in" }),
        ).toBe("system")
      }
    }
  })

  test("sends every click to the system browser when the Browser is unavailable", () => {
    for (const click of [BROWSER_PREFERRED, SYSTEM_PREFERRED]) {
      for (const modified of [false, true]) {
        expect(
          resolveInAppBrowserLinkDestination({ ...click, modified, browserAvailable: false }),
        ).toBe("system")
      }
    }
  })

  test("offers the Browser only for plain clicks it could open while links go to the system browser", () => {
    expect(shouldOfferInAppBrowserForLink(SYSTEM_PREFERRED)).toBe(true)
    expect(shouldOfferInAppBrowserForLink(BROWSER_PREFERRED)).toBe(false)
    expect(shouldOfferInAppBrowserForLink({ ...SYSTEM_PREFERRED, modified: true })).toBe(false)
    expect(shouldOfferInAppBrowserForLink({ ...SYSTEM_PREFERRED, browserAvailable: false })).toBe(
      false,
    )
    expect(
      shouldOfferInAppBrowserForLink({ ...SYSTEM_PREFERRED, url: "mailto:hi@hibuddy.in" }),
    ).toBe(false)
  })
})

describe("Cmd/Ctrl-click destination setting", () => {
  const cases = [
    { linkTarget: "system", modifiedLinkTarget: "system" },
    { linkTarget: "system", modifiedLinkTarget: "browser" },
    { linkTarget: "browser", modifiedLinkTarget: "system" },
    { linkTarget: "browser", modifiedLinkTarget: "browser" },
  ] as const

  for (const { linkTarget, modifiedLinkTarget } of cases) {
    test(`sends clicks to ${linkTarget} and Cmd/Ctrl-clicks to ${modifiedLinkTarget}`, () => {
      const click = { ...BROWSER_PREFERRED, linkTarget, modifiedLinkTarget }
      expect(resolveInAppBrowserLinkDestination(click)).toBe(linkTarget)
      expect(resolveInAppBrowserLinkDestination({ ...click, modified: true })).toBe(
        modifiedLinkTarget,
      )
    })
  }

  test("still sends links the Browser cannot open, or cannot show, to the system browser", () => {
    for (const { linkTarget, modifiedLinkTarget } of cases) {
      const click = { ...BROWSER_PREFERRED, linkTarget, modifiedLinkTarget, modified: true }
      expect(resolveInAppBrowserLinkDestination({ ...click, url: "mailto:hi@hibuddy.in" })).toBe(
        "system",
      )
      expect(resolveInAppBrowserLinkDestination({ ...click, browserAvailable: false })).toBe(
        "system",
      )
    }
  })

  test("never offers the Browser for Cmd/Ctrl-clicks whatever they are set to", () => {
    for (const modifiedLinkTarget of ["system", "browser"] as const) {
      expect(
        shouldOfferInAppBrowserForLink({ ...SYSTEM_PREFERRED, modifiedLinkTarget, modified: true }),
      ).toBe(false)
      expect(shouldOfferInAppBrowserForLink({ ...SYSTEM_PREFERRED, modifiedLinkTarget })).toBe(true)
    }
  })
})
