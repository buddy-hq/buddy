import { afterEach, describe, expect, mock, test } from "bun:test"
import { createOpenAICodexAccountService } from "../../src/opencode-runtime/plugins/openai-codex-account"
import type { OpenAICodexStoredAuth } from "../../src/opencode-runtime/plugins/openai-codex-credentials"

const DIRECTORY = "/tmp/buddy-openai-account-test"
const NOW = Date.parse("2026-06-10T12:00:00.000Z")
const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function createAuth(): OpenAICodexStoredAuth {
  return {
    type: "oauth",
    access: "access-token",
    refresh: "refresh-token",
    expires: Date.now() + 60_000,
    accountId: "account-123",
  }
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

describe("OpenAI Codex account service", () => {
  test("returns vendor fallback while loading, then exposes only listed account models", async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(input.toString())
      expect(url.pathname).toBe("/backend-api/codex/models")
      expect(url.searchParams.has("client_version")).toBe(true)
      const headers = new Headers(init?.headers)
      expect(headers.get("authorization")).toBe("Bearer access-token")
      expect(headers.get("ChatGPT-Account-Id")).toBe("account-123")
      return Response.json(
        {
          models: [
            { slug: "gpt-5.5", visibility: "list" },
            { slug: "codex-auto-review", visibility: "hide" },
          ],
        },
        { headers: { etag: '"models-v1"' } },
      )
    })
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => NOW,
      getAuth: async () => createAuth(),
      setAuth: async () => undefined,
    })

    expect(await service.readModelAvailability(DIRECTORY)).toEqual({
      status: "loading",
    })
    await Bun.sleep(0)
    expect(await service.readModelAvailability(DIRECTORY)).toEqual({
      status: "ready",
      modelIDs: ["gpt-5.5"],
      fetchedAt: "2026-06-10T12:00:00.000Z",
      refreshing: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("retains account-specific context metadata for runtime model resolution", async () => {
    const fetchMock = mock(async () =>
      Response.json({
        models: [
          {
            slug: "gpt-5.6-terra",
            visibility: "list",
            context_window: 272_000,
            max_context_window: 272_000,
            effective_context_window_percent: 95,
          },
          {
            slug: "codex-auto-review",
            visibility: "hide",
            context_window: 272_000,
            effective_context_window_percent: 95,
          },
        ],
      }),
    )
    const auth = createAuth()
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => NOW,
      getAuth: async () => auth,
      setAuth: async () => undefined,
    })

    expect(await service.resolveModelCatalog(DIRECTORY)).toEqual([
      {
        slug: "gpt-5.6-terra",
        visibility: "list",
        context_window: 272_000,
        max_context_window: 272_000,
        effective_context_window_percent: 95,
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test("does not overwrite or resolve against an account changed during token refresh", async () => {
    const tokenResponse = createDeferredResponse()
    const refreshFetchMock = mock(
      async (_input: RequestInfo | URL, _init?: RequestInit) => tokenResponse.promise,
    )
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: Parameters<typeof fetch>[1]) =>
        refreshFetchMock(input, init),
      {
        preconnect: originalFetch.preconnect,
      },
    )

    let auth: OpenAICodexStoredAuth = {
      type: "oauth",
      access: "expired-account-a",
      refresh: "refresh-account-a",
      expires: 0,
      accountId: "account-a",
    }
    const modelFetchMock = mock(async () =>
      Response.json({
        models: [{ slug: "model-a", visibility: "list", context_window: 100_000 }],
      }),
    )
    const setAuth = mock(async (_directory: string, nextAuth: OpenAICodexStoredAuth) => {
      auth = nextAuth
    })
    const service = createOpenAICodexAccountService({
      fetch: modelFetchMock,
      now: () => NOW,
      getAuth: async () => auth,
      setAuth,
    })

    const catalog = service.resolveModelCatalog(DIRECTORY)
    await Bun.sleep(0)
    expect(refreshFetchMock).toHaveBeenCalledTimes(1)

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

    expect(await catalog).toBeUndefined()
    expect(setAuth).not.toHaveBeenCalled()
    expect(modelFetchMock).not.toHaveBeenCalled()
    expect(auth.accountId).toBe("account-b")
  })

  test("does not back off account model loading after a catalog request is aborted", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        return await new Promise<Response>((_resolve, reject) => {
          const rejectAborted = () =>
            reject(new DOMException("Catalog request aborted", "AbortError"))
          if (init?.signal?.aborted) {
            rejectAborted()
            return
          }
          init?.signal?.addEventListener("abort", rejectAborted, { once: true })
        })
      }
      return Response.json({
        models: [{ slug: "gpt-5.5", visibility: "list" }],
      })
    })
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => NOW,
      getAuth: async () => createAuth(),
      setAuth: async () => undefined,
    })
    const abortController = new AbortController()

    const catalog = service.resolveModelCatalog(DIRECTORY, abortController.signal)
    await Bun.sleep(0)
    abortController.abort()

    expect(await catalog).toBeUndefined()
    expect(await service.readModelAvailability(DIRECTORY)).toEqual({
      status: "loading",
    })
    await Bun.sleep(0)
    expect(await service.readModelAvailability(DIRECTORY)).toMatchObject({
      status: "ready",
      modelIDs: ["gpt-5.5"],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("uses the cached ETag on an explicit model refresh", async () => {
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      if (fetchMock.mock.calls.length === 1) {
        expect(headers.get("if-none-match")).toBeNull()
        return Response.json(
          { models: [{ slug: "gpt-5.5", visibility: "list" }] },
          { headers: { etag: '"models-v1"' } },
        )
      }
      expect(headers.get("if-none-match")).toBe('"models-v1"')
      return new Response(null, { status: 304 })
    })
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => NOW,
      getAuth: async () => createAuth(),
      setAuth: async () => undefined,
    })

    await service.refreshModelAvailability(DIRECTORY)
    expect(await service.refreshModelAvailability(DIRECTORY)).toMatchObject({
      status: "ready",
      modelIDs: ["gpt-5.5"],
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("treats an empty account model response as unavailable", async () => {
    const service = createOpenAICodexAccountService({
      fetch: async () => Response.json({ models: [] }),
      now: () => NOW,
      getAuth: async () => createAuth(),
      setAuth: async () => undefined,
    })

    expect(await service.refreshModelAvailability(DIRECTORY)).toEqual({
      status: "error",
    })
  })

  test("marks an unauthorized model refresh as requiring reconnection", async () => {
    const service = createOpenAICodexAccountService({
      fetch: async () => Response.json({}, { status: 401 }),
      now: () => NOW,
      getAuth: async () => createAuth(),
      setAuth: async () => undefined,
    })

    expect(await service.refreshModelAvailability(DIRECTORY)).toEqual({
      status: "reconnect_required",
    })
    expect(await service.readModelAvailability(DIRECTORY)).toEqual({
      status: "reconnect_required",
    })
  })

  test("uses a rejected ChatGPT model credential immediately without probing account endpoints", async () => {
    const auth = createAuth()
    const fetchMock = mock(async () => Response.json({}))
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => NOW,
      getAuth: async () => auth,
      setAuth: async () => undefined,
    })

    service.markAuthenticationRejected(auth)

    expect(await service.readModelAvailability(DIRECTORY)).toEqual({
      status: "reconnect_required",
    })
    expect(await service.readUsage(DIRECTORY)).toEqual({
      status: "reconnect_required",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test("keeps transient model refresh failures distinct from invalid authentication", async () => {
    const service = createOpenAICodexAccountService({
      fetch: async () => Response.json({}, { status: 503 }),
      now: () => NOW,
      getAuth: async () => createAuth(),
      setAuth: async () => undefined,
    })

    expect(await service.refreshModelAvailability(DIRECTORY)).toEqual({ status: "error" })
  })

  test("clears reconnect-required state when the account receives new credentials", async () => {
    let auth = createAuth()
    const fetchMock = mock(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return Response.json({}, { status: 401 })
      }
      return Response.json({ models: [{ slug: "gpt-5.5", visibility: "list" }] })
    })
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => NOW,
      getAuth: async () => auth,
      setAuth: async () => undefined,
    })

    expect(await service.refreshModelAvailability(DIRECTORY)).toEqual({
      status: "reconnect_required",
    })

    auth = { ...auth, access: "new-access-token", refresh: "new-refresh-token" }
    expect(await service.readModelAvailability(DIRECTORY)).toEqual({ status: "loading" })
    await Bun.sleep(0)
    expect(await service.readModelAvailability(DIRECTORY)).toMatchObject({
      status: "ready",
      modelIDs: ["gpt-5.5"],
    })
  })

  test("normalizes plan usage and reuses it for sixty seconds", async () => {
    let now = NOW
    const fetchMock = mock(async () =>
      Response.json({
        plan_type: "plus",
        rate_limit: {
          primary_window: {
            used_percent: 12.4,
            reset_at: 1_749_600_000,
            limit_window_seconds: 18_000,
          },
          secondary_window: {
            used_percent: 31,
            reset_at: 1_750_118_400,
            limit_window_seconds: 604_800,
          },
        },
        credits: {
          has_credits: true,
          unlimited: false,
          balance: "4.5",
        },
      }),
    )
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => now,
      getAuth: async () => createAuth(),
      setAuth: async () => undefined,
    })

    const first = await service.readUsage(DIRECTORY)
    expect(first).toMatchObject({
      status: "ready",
      plan: "plus",
      rateLimit: {
        primary: { usedPercent: 12.4, windowSeconds: 18_000 },
        secondary: { usedPercent: 31, windowSeconds: 604_800 },
      },
      credits: { hasCredits: true, unlimited: false, balance: 4.5 },
    })

    now += 59_000
    expect(await service.readUsage(DIRECTORY)).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    now += 2_000
    await service.readUsage(DIRECTORY)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test("does not mask invalid authentication with cached usage", async () => {
    const fetchMock = mock(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return Response.json({ plan_type: "plus" })
      }
      return Response.json({}, { status: 401 })
    })
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => NOW,
      getAuth: async () => createAuth(),
      setAuth: async () => undefined,
    })

    expect(await service.readUsage(DIRECTORY)).toMatchObject({ status: "ready" })
    expect(await service.readUsage(DIRECTORY, true)).toEqual({
      status: "reconnect_required",
    })
    expect(await service.readUsage(DIRECTORY)).toEqual({
      status: "reconnect_required",
    })
  })

  test("does not share in-flight model results across account changes", async () => {
    const accountAResponse = createDeferredResponse()
    const accountBResponse = createDeferredResponse()
    let auth = createAuth()
    const service = createOpenAICodexAccountService({
      fetch: async (_input, init) => {
        const accountId = new Headers(init?.headers).get("ChatGPT-Account-Id")
        if (accountId === "account-a") return accountAResponse.promise
        if (accountId === "account-b") return accountBResponse.promise
        throw new Error(`Unexpected account: ${accountId ?? "missing"}`)
      },
      now: () => NOW,
      getAuth: async () => auth,
      setAuth: async () => undefined,
    })

    auth = {
      ...createAuth(),
      access: "access-a",
      refresh: "refresh-a",
      accountId: "account-a",
    }
    const accountARefresh = service.refreshModelAvailability(DIRECTORY)

    auth = {
      ...createAuth(),
      access: "access-b",
      refresh: "refresh-b",
      accountId: "account-b",
    }
    const accountBRefresh = service.refreshModelAvailability(DIRECTORY)

    accountAResponse.resolve(Response.json({ models: [{ slug: "model-a", visibility: "list" }] }))
    expect(await accountARefresh).toMatchObject({
      status: "ready",
      modelIDs: ["model-a"],
    })
    expect(await service.readModelAvailability(DIRECTORY)).toEqual({ status: "loading" })

    accountBResponse.resolve(Response.json({ models: [{ slug: "model-b", visibility: "list" }] }))
    expect(await accountBRefresh).toMatchObject({
      status: "ready",
      modelIDs: ["model-b"],
    })
    expect(await service.readModelAvailability(DIRECTORY)).toMatchObject({
      status: "ready",
      modelIDs: ["model-b"],
    })
  })

  test("does not share in-flight usage results across account changes", async () => {
    const accountAResponse = createDeferredResponse()
    const accountBResponse = createDeferredResponse()
    let auth = createAuth()
    const service = createOpenAICodexAccountService({
      fetch: async (_input, init) => {
        const accountId = new Headers(init?.headers).get("ChatGPT-Account-Id")
        if (accountId === "account-a") return accountAResponse.promise
        if (accountId === "account-b") return accountBResponse.promise
        throw new Error(`Unexpected account: ${accountId ?? "missing"}`)
      },
      now: () => NOW,
      getAuth: async () => auth,
      setAuth: async () => undefined,
    })

    auth = {
      ...createAuth(),
      access: "access-a",
      refresh: "refresh-a",
      accountId: "account-a",
    }
    const accountAUsage = service.readUsage(DIRECTORY)

    auth = {
      ...createAuth(),
      access: "access-b",
      refresh: "refresh-b",
      accountId: "account-b",
    }
    const accountBUsage = service.readUsage(DIRECTORY)

    accountAResponse.resolve(Response.json({ plan_type: "plus" }))
    expect(await accountAUsage).toMatchObject({ status: "ready", plan: "plus" })

    accountBResponse.resolve(Response.json({ plan_type: "pro" }))
    expect(await accountBUsage).toMatchObject({ status: "ready", plan: "pro" })
    expect(await service.readUsage(DIRECTORY)).toMatchObject({
      status: "ready",
      plan: "pro",
    })
  })

  test("does not call account endpoints for a non-OAuth OpenAI connection", async () => {
    const fetchMock = mock(async () => Response.json({}))
    const service = createOpenAICodexAccountService({
      fetch: fetchMock,
      now: () => NOW,
      getAuth: async () => ({ type: "api", key: "api-key" }),
      setAuth: async () => undefined,
    })

    expect(await service.readModelAvailability(DIRECTORY)).toEqual({
      status: "not_connected",
    })
    expect(await service.readUsage(DIRECTORY)).toEqual({ status: "not_connected" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
