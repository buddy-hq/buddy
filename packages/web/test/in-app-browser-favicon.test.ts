import { describe, expect, test } from "bun:test"
import {
  inAppBrowserFaviconImageSources,
  inAppBrowserOriginFaviconUrl,
} from "../src/lib/in-app-browser-favicon"

describe("Browser favicon display sources", () => {
  test("asks the live page origin for its conventional favicon", () => {
    expect(inAppBrowserOriginFaviconUrl("https://mail.google.com/mail/u/0/?tab=rm")).toBe(
      "https://mail.google.com/favicon.ico",
    )
    expect(inAppBrowserOriginFaviconUrl("http://localhost:5173/app#ready")).toBe(
      "http://localhost:5173/favicon.ico",
    )
    expect(inAppBrowserOriginFaviconUrl("http://127.0.0.1/status")).toBe(
      "http://127.0.0.1/favicon.ico",
    )
  })

  test("never puts embedded credentials on the favicon request", () => {
    expect(inAppBrowserOriginFaviconUrl("https://student:secret@mail.google.com/inbox")).toBe(
      "https://mail.google.com/favicon.ico",
    )
  })

  test("rejects addresses that are not bounded http(s) pages", () => {
    expect(inAppBrowserOriginFaviconUrl("about:blank")).toBeUndefined()
    expect(inAppBrowserOriginFaviconUrl("file:///tmp/private")).toBeUndefined()
    expect(inAppBrowserOriginFaviconUrl("javascript:alert(1)")).toBeUndefined()
    expect(inAppBrowserOriginFaviconUrl("data:image/png;base64,AAAA")).toBeUndefined()
    expect(inAppBrowserOriginFaviconUrl(`https://example.com/${"a".repeat(10_000)}`)).toBeUndefined()
  })

  test("tries a captured raster before the live origin favicon", () => {
    expect(
      inAppBrowserFaviconImageSources({
        capturedDataUrl: "data:image/png;base64,AAAA",
        pageUrl: "https://mail.google.com/mail/u/0/",
      }),
    ).toEqual(["data:image/png;base64,AAAA", "https://mail.google.com/favicon.ico"])
  })

  test("skips a captured value that is not a data image and still uses the page origin", () => {
    expect(
      inAppBrowserFaviconImageSources({
        capturedDataUrl: "javascript:alert(1)",
        pageUrl: "https://hibuddy.in/docs",
      }),
    ).toEqual(["https://hibuddy.in/favicon.ico"])
  })

  test("has no image source for a blank tab without a captured icon", () => {
    expect(
      inAppBrowserFaviconImageSources({
        capturedDataUrl: null,
        pageUrl: "about:blank",
      }),
    ).toEqual([])
  })
})
