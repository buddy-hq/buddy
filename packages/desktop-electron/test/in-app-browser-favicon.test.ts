import { describe, expect, test } from "bun:test"
import {
  IN_APP_BROWSER_FAVICON_MAX_CANDIDATES,
  IN_APP_BROWSER_FAVICON_MAX_RESPONSE_BYTES,
  captureInAppBrowserFavicon,
  inAppBrowserSafeHttpOrigin,
  selectInAppBrowserFaviconCandidates,
} from "../src/main/in-app-browser-favicon"

function captureResponse(response: Response): Promise<string | null> {
  return captureInAppBrowserFavicon({
    pageUrl: "https://example.com/",
    candidates: ["https://cdn.example/favicon"],
    signal: new AbortController().signal,
    fetchResponse: async () => response,
    rasterize: () => "data:image/png;base64,AAAA",
  })
}

describe("in-app Browser favicon capture", () => {
  test("accepts bounded image candidates and removes duplicates", () => {
    const candidates = Array.from(
      { length: IN_APP_BROWSER_FAVICON_MAX_CANDIDATES + 2 },
      (_, index) => `https://assets.example/icon-${index}.png`,
    )
    expect(
      selectInAppBrowserFaviconCandidates([
        "javascript:alert(1)",
        candidates[0] ?? "",
        ...candidates,
      ]),
    ).toEqual(candidates.slice(0, IN_APP_BROWSER_FAVICON_MAX_CANDIDATES))
    expect(inAppBrowserSafeHttpOrigin("https://example.com/page")).toBe("https://example.com")
    expect(inAppBrowserSafeHttpOrigin("about:blank")).toBeNull()
  })

  test("uses the Browser session, includes same-origin credentials, and returns PNG data", async () => {
    const requests: Array<{ credentials: RequestCredentials | undefined; url: string }> = []
    const dataUrl = await captureInAppBrowserFavicon({
      pageUrl: "https://example.com/account",
      candidates: ["https://example.com/favicon.png"],
      signal: new AbortController().signal,
      fetchResponse: async (url, init) => {
        requests.push({ url, credentials: init.credentials })
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        })
      },
      rasterize: () => "data:image/png;base64,AAAA",
    })

    expect(dataUrl).toBe("data:image/png;base64,AAAA")
    expect(requests).toEqual([{ url: "https://example.com/favicon.png", credentials: "include" }])
  })

  test("rejects oversized and non-image responses", async () => {
    expect(
      await captureResponse(
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "text/html" },
        }),
      ),
    ).toBeNull()
    expect(
      await captureResponse(
        new Response(new Uint8Array([1]), {
          headers: {
            "content-length": String(IN_APP_BROWSER_FAVICON_MAX_RESPONSE_BYTES + 1),
            "content-type": "image/png",
          },
        }),
      ),
    ).toBeNull()
  })
})
