import { describe, expect, test } from "bun:test"
import {
  inAppBrowserFaviconImageSources,
  inAppBrowserOriginFaviconUrl,
  publicWebsiteFaviconUrl,
} from "../src/lib/in-app-browser-favicon"

describe("Public website favicon lookup", () => {
  test("looks up only the public host, stripping page paths and credentials", () => {
    expect(
      publicWebsiteFaviconUrl("https://student:secret@developer.mozilla.org/en-US/?q=private#part"),
    ).toBe("https://www.google.com/s2/favicons?domain=developer.mozilla.org&sz=32")
    expect(publicWebsiteFaviconUrl("http://EXAMPLE.COM.:8080/page")).toBe(
      "https://www.google.com/s2/favicons?domain=example.com%3A8080&sz=32",
    )
    expect(publicWebsiteFaviconUrl("https://bücher.de/page")).toBe(
      "https://www.google.com/s2/favicons?domain=xn--bcher-kva.de&sz=32",
    )
  })

  test.each([
    "http://localhost:5173",
    "http://printer",
    "http://printer.local",
    "http://app.localhost",
    "http://home.arpa",
    "https://notebook.internal",
    "https://machine.ts.net",
    "https://example.test",
    "https://site.example",
    "https://site.invalid",
    "https://site.onion",
    "https://site.alt",
    "http://printer.lan",
    "http://app.home",
    "http://app.corp",
    "http://127.0.0.1",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://10.0.0.1",
    "http://172.16.0.1",
    "http://192.168.1.1",
    "http://169.254.169.254",
    "http://100.64.0.1",
    "http://192.0.2.1",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://[fd00::1]",
    "http://[fe80::1]",
    "https://8.8.8.8",
    "https://[2606:4700:4700::1111]",
    "https://example.com..",
    "https://-example.com",
  ])("does not disclose a local/reserved name or IP literal: %s", (url) => {
    expect(publicWebsiteFaviconUrl(url)).toBeUndefined()
  })

  test.each([
    "",
    "not a url",
    "about:blank",
    "file:///tmp/private",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    `https://example.com/${"a".repeat(10_000)}`,
  ])("rejects addresses outside bounded HTTP(S) pages: %s", (url) => {
    expect(publicWebsiteFaviconUrl(url)).toBeUndefined()
  })
})

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
    expect(
      inAppBrowserOriginFaviconUrl(`https://example.com/${"a".repeat(10_000)}`),
    ).toBeUndefined()
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
