import { afterEach, describe, expect, mock, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { BUDDY_ENV } from "../../src/storage/constants"
import {
  buildBuddyCodexErrorHtml,
  buildBuddyCodexSuccessHtml,
  createBuddyCodexLoader,
} from "../../src/opencode-runtime/plugins/openai-codex-auth"
import {
  resolveOpenAICodexAuth,
  type OpenAICodexStoredAuth,
} from "../../src/opencode-runtime/plugins/openai-codex-credentials"
import { traceOpenAIAuth } from "../../src/opencode-runtime/plugins/openai-auth-trace"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  delete process.env[BUDDY_ENV.OPENAI_AUTH_TRACE_FILE]
})

function readRequestUrl(input: RequestInfo | URL) {
  if (input instanceof URL) return input.toString()
  if (input instanceof Request) return input.url
  return input
}

function createDeferredResponse() {
  let resolveResponse: ((response: Response) => void) | undefined
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve
  })

  return {
    promise,
    resolve(response: Response) {
      if (!resolveResponse) throw new Error("Deferred response is not initialized")
      resolveResponse(response)
    },
  }
}

describe("OpenAI Codex auth hook", () => {
  test("writes structured auth diagnostics when the dev trace file is configured", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "buddy-openai-auth-trace-"))
    const traceFile = path.join(directory, "auth.jsonl")
    process.env[BUDDY_ENV.OPENAI_AUTH_TRACE_FILE] = traceFile

    try {
      await traceOpenAIAuth("test_event", { status: 200, ok: true })
      const entry: unknown = JSON.parse((await fs.readFile(traceFile, "utf8")).trim())

      expect(entry).toMatchObject({ event: "test_event", status: 200, ok: true })
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  test("brands the success callback page for Buddy", () => {
    const html = buildBuddyCodexSuccessHtml()

    expect(html).toContain("Buddy - Codex Authorization Successful")
    expect(html).toContain("go back to the Buddy app")
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
      async (input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) =>
        fetchMock(input, init),
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

  test("accepts refresh responses without rotated refresh or ID tokens", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = readRequestUrl(input)
      if (url === "https://auth.openai.com/oauth/token") {
        return Response.json({
          access_token: "refreshed-access-token",
          expires_in: 3_600,
        })
      }
      return new Response(null, { status: 200 })
    })
    const fetchStub = Object.assign(
      async (input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) =>
        fetchMock(input, init),
      {
        preconnect: originalFetch.preconnect,
      },
    )
    globalThis.fetch = fetchStub

    let auth: OpenAICodexStoredAuth = {
      type: "oauth",
      access: "expired-access-token",
      refresh: "existing-refresh-token",
      expires: 0,
      accountId: "acct_123",
    }
    const loader = createBuddyCodexLoader({
      getAuth: async () => auth,
      setAuth: async (nextAuth) => {
        auth = nextAuth
      },
    })

    await loader.fetch("https://api.openai.com/v1/responses")

    expect(auth.access).toBe("refreshed-access-token")
    expect(auth.refresh).toBe("existing-refresh-token")
    expect(auth.accountId).toBe("acct_123")
  })

  test("does not persist a completed refresh after the active account changes", async () => {
    const tokenResponse = createDeferredResponse()
    const fetchMock = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) => tokenResponse.promise,
    )
    const fetchStub = Object.assign(
      async (input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) =>
        fetchMock(input, init),
      {
        preconnect: originalFetch.preconnect,
      },
    )
    globalThis.fetch = fetchStub

    let auth: OpenAICodexStoredAuth = {
      type: "oauth",
      access: "expired-account-a",
      refresh: "refresh-account-a",
      expires: 0,
      accountId: "account-a",
    }
    const setAuth = mock(async (_nextAuth: OpenAICodexStoredAuth) => undefined)
    const refresh = resolveOpenAICodexAuth({
      getAuth: async () => auth,
      setAuth,
      issuer: "https://auth.openai.com",
    })
    await Bun.sleep(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    auth = {
      type: "oauth",
      access: "account-b",
      refresh: "refresh-account-b",
      expires: Date.now() + 60_000,
      accountId: "account-b",
    }
    tokenResponse.resolve(
      Response.json({
        access_token: "refreshed-account-a",
        refresh_token: "rotated-account-a",
      }),
    )

    expect(await refresh).toMatchObject({
      access: "refreshed-account-a",
      refresh: "rotated-account-a",
    })
    expect(setAuth).not.toHaveBeenCalled()
  })
})
