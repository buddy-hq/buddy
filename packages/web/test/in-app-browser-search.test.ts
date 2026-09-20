import { describe, expect, test } from "bun:test"
import { IN_APP_BROWSER_URL_MAX_LENGTH } from "@buddy/browser-contract"
import {
  DEFAULT_IN_APP_BROWSER_SEARCH_ENGINE,
  inAppBrowserSearchEngineLabel,
  parseInAppBrowserSearchEngine,
  resolveInAppBrowserInput,
} from "../src/lib/in-app-browser-search"

function resolvedUrl(input: string, engine: "duckduckgo" | "google"): URL {
  const result = resolveInAppBrowserInput(input, engine)
  if (result["_tag"] !== "resolved") throw new Error(`Expected ${input} to resolve.`)
  return new URL(result.url)
}

describe("in-app Browser search", () => {
  test("parses only supported persisted search providers", () => {
    expect(DEFAULT_IN_APP_BROWSER_SEARCH_ENGINE).toBe("google")
    expect(parseInAppBrowserSearchEngine("duckduckgo")).toBe("duckduckgo")
    expect(parseInAppBrowserSearchEngine("google")).toBe("google")
    expect(parseInAppBrowserSearchEngine("askjeeves")).toBeUndefined()
    expect(inAppBrowserSearchEngineLabel("duckduckgo")).toBe("DuckDuckGo")
  })

  test("routes single words and phrases through the selected provider", () => {
    const duckDuckGo = resolvedUrl("weather", "duckduckgo")
    const google = resolvedUrl("weather today", "google")

    expect(duckDuckGo.origin).toBe("https://duckduckgo.com")
    expect(duckDuckGo.searchParams.get("q")).toBe("weather")
    expect(google.origin).toBe("https://www.google.com")
    expect(google.pathname).toBe("/search")
    expect(google.searchParams.get("q")).toBe("weather today")

    for (const query of [
      "TypeError: cannot read properties of undefined",
      "error: build failed",
      "note: see reference",
      "TODO: ship it",
    ]) {
      expect(resolvedUrl(query, "duckduckgo").searchParams.get("q")).toBe(query)
    }
  })

  test("round-trips Unicode and query punctuation without manual encoding", () => {
    const query = "café & tea + #recipes"
    expect(resolvedUrl(query, "duckduckgo").searchParams.get("q")).toBe(query)
  })

  test("keeps recognizable web and local addresses as URLs", () => {
    expect(resolveInAppBrowserInput("example.com/docs", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "https://example.com/docs",
    })
    expect(resolveInAppBrowserInput("localhost:3000", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "http://localhost:3000/",
    })
    expect(resolveInAppBrowserInput("127.0.0.1:4000", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "http://127.0.0.1:4000/",
    })
    expect(resolveInAppBrowserInput("[::1]:5173", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "http://[::1]:5173/",
    })
    expect(resolveInAppBrowserInput("http://printer", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "http://printer/",
    })
    expect(resolveInAppBrowserInput("github.com/@octocat", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "https://github.com/@octocat",
    })
    expect(resolveInAppBrowserInput("intranet/admin", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "https://intranet/admin",
    })
    expect(resolveInAppBrowserInput("Intranet/admin", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "https://intranet/admin",
    })
    expect(resolveInAppBrowserInput("BuildServer:3000/dashboard", "duckduckgo")).toEqual({
      _tag: "resolved",
      kind: "url",
      url: "https://buildserver:3000/dashboard",
    })
  })

  test("searches ambiguous single-label hosts, email addresses, and search operators", () => {
    expect(resolveInAppBrowserInput("printer", "duckduckgo")).toMatchObject({
      _tag: "resolved",
      kind: "search",
    })
    expect(resolveInAppBrowserInput("person@example.com", "duckduckgo")).toMatchObject({
      _tag: "resolved",
      kind: "search",
    })
    for (const query of ["site:example.com", "site:example.com cats", "after:2020"]) {
      expect(resolvedUrl(query, "google").searchParams.get("q")).toBe(query)
    }
    for (const query of ["3.5", "1.2", "24/7", "TCP/IP"]) {
      expect(resolvedUrl(query, "google").searchParams.get("q")).toBe(query)
    }
  })

  test("rejects malformed explicit addresses and unsupported protocols", () => {
    expect(resolveInAppBrowserInput("https://", "duckduckgo")).toEqual({
      _tag: "rejected",
      reason: "invalid-address",
    })
    for (const input of [
      "file:///tmp/private.txt",
      "javascript:alert(1)",
      "javascript:123",
      "javascript:\nalert(1)",
      "\u200Bjavascript:alert(1)",
      "data:text/plain,hello",
      "mailto:person@example.com",
      "file:123",
      "sms:123",
      "tel:80",
      "slack:channel",
      "vbscript: alert(1)",
    ]) {
      expect(resolveInAppBrowserInput(input, "duckduckgo")).toEqual({
        _tag: "rejected",
        reason: "unsupported-protocol",
      })
    }
  })

  test("rejects empty, oversized, and encoding-expanded input", () => {
    expect(resolveInAppBrowserInput("   ", "duckduckgo")).toEqual({
      _tag: "rejected",
      reason: "empty",
    })
    expect(
      resolveInAppBrowserInput("x".repeat(IN_APP_BROWSER_URL_MAX_LENGTH + 1), "google"),
    ).toEqual({
      _tag: "rejected",
      reason: "too-long",
    })
    expect(resolveInAppBrowserInput("🙂".repeat(1_000), "google")).toEqual({
      _tag: "rejected",
      reason: "too-long",
    })
  })
})
