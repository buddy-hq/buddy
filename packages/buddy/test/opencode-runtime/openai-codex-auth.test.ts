import { afterEach, describe, expect, mock, test } from "bun:test"
import {
  buildBuddyCodexErrorHtml,
  buildBuddyCodexSuccessHtml,
  createBuddyCodexLoader,
} from "../../src/opencode-runtime/plugins/openai-codex-auth"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function readRequestUrl(input: RequestInfo | URL) {
  if (input instanceof URL) return input.toString()
  if (input instanceof Request) return input.url
  return input
}

describe("OpenAI Codex auth hook", () => {
  test("brands the success callback page for Buddy", () => {
    const html = buildBuddyCodexSuccessHtml()

    expect(html).toContain("Buddy - Codex Authorization Successful")
    expect(html).toContain("return to Buddy")
    expect(html).not.toContain("return to OpenCode")
    expect(html).not.toContain("buddy://")
  })

  test("escapes untrusted error text in the callback page", () => {
    const html = buildBuddyCodexErrorHtml(`<script>alert("xss")</script>`)

    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;")
    expect(html).not.toContain(`<script>alert("xss")</script>`)
  })

  test("rewrites Codex model requests and injects oauth headers", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(null, { status: 200 })
    })
    const fetchStub = Object.assign(
      async (input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) => fetchMock(input, init),
      {
        preconnect: originalFetch.preconnect,
      },
    )
    globalThis.fetch = fetchStub

    const loader = createBuddyCodexLoader({
      getAuth: async () => ({
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: Date.now() + 60_000,
        accountId: "acct_123",
      }),
      setAuth: async () => undefined,
    })

    await loader.fetch("https://api.openai.com/v1/responses", {
      headers: {
        authorization: "Bearer old-token",
        "x-test": "1",
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [requestInput, init] = fetchMock.mock.calls[0] ?? []
    expect(readRequestUrl(requestInput)).toBe("https://chatgpt.com/backend-api/codex/responses")

    const headers = new Headers(init?.headers)
    expect(headers.get("authorization")).toBe("Bearer access-token")
    expect(headers.get("ChatGPT-Account-Id")).toBe("acct_123")
    expect(headers.get("x-test")).toBe("1")
  })
})
