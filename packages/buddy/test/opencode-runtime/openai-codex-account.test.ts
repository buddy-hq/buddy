import { describe, expect, test } from "bun:test"
import { createChatGPTAccountService } from "../../src/chatgpt/account"
import type { ChatGPTAuth, ChatGPTCredentials } from "@buddy/agent-runtime/chatgpt"

const DIRECTORY = "/tmp/buddy-openai-account-test"
const NOW = Date.parse("2026-06-10T12:00:00.000Z")
const SIGNAL = new AbortController().signal

function createService(
  input: NonNullable<Parameters<typeof createChatGPTAccountService>[2]> & {
    getAuth: ChatGPTCredentials["resolve"]
  },
) {
  const { getAuth, ...options } = input
  return createChatGPTAccountService(
    { directory: DIRECTORY },
    { resolve: getAuth, reject: async () => {} },
    options,
  )
}

function createAuth(): ChatGPTAuth {
  return {
    access: "access-token",
    refresh: "refresh-token",
    expires: NOW + 60_000,
    accountId: "account-123",
  }
}

function createDeferredResponse() {
  let resolveResponse: ((response: Response) => void) | undefined
  let started: (() => void) | undefined
  const requested = new Promise<void>((resolve) => {
    started = resolve
  })
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve
  })

  return {
    promise,
    requested,
    request() {
      started?.()
      return promise
    },
    resolve(response: Response) {
      if (!resolveResponse) throw new Error("Deferred response is not initialized")
      resolveResponse(response)
    },
  }
}

describe("OpenAI Codex account service", () => {
  test("reads the email for an existing ChatGPT login without requiring another sign-in", async () => {
    const service = createService({
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe("https://auth.openai.com/api/accounts/oauth/userinfo")
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token")
        return Response.json({ email: "learner@example.com", email_verified: true })
      },
      now: () => NOW,
      getAuth: async () => createAuth(),
    })

    expect(await service.identity()).toEqual({
      status: "ready",
      email: "learner@example.com",
    })
  })

  test("never exposes an email from an account that changed during the request", async () => {
    const response = createDeferredResponse()
    let auth = createAuth()
    const service = createService({
      fetch: async () => response.request(),
      now: () => NOW,
      getAuth: async () => auth,
    })

    const identity = service.identity()
    await response.requested
    auth = { ...auth, refresh: "another-account-refresh", access: "another-account-access" }
    response.resolve(Response.json({ email: "old-account@example.com" }))

    expect(await identity).toEqual({ status: "unavailable" })
  })

  test("treats a missing account email as unavailable", async () => {
    const service = createService({
      fetch: async () => Response.json({ sub: "user_123" }),
      now: () => NOW,
      getAuth: async () => createAuth(),
    })

    expect(await service.identity()).toEqual({ status: "unavailable" })
  })

  test("returns vendor fallback while loading, then exposes only listed account models", async () => {
    const service = createService({
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
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
      },
      now: () => NOW,
      getAuth: async () => createAuth(),
    })

    expect(await service.models({ refresh: false })).toEqual({
      status: "loading",
    })
    await service.accountModels(SIGNAL)
    expect(await service.models({ refresh: false })).toEqual({
      status: "ready",
      modelIDs: ["gpt-5.5"],
      fetchedAt: "2026-06-10T12:00:00.000Z",
      refreshing: false,
    })
  })

  test("retains account-specific context metadata for runtime model resolution", async () => {
    const auth = createAuth()
    const service = createService({
      fetch: async () =>
        Response.json({
          models: [
            {
              slug: "gpt-5.6-terra",
              visibility: "list",
              context_window: 272_000,
              max_context_window: 272_000,
              effective_context_window_percent: 95,
              input_modalities: ["text", "image"],
              supports_reasoning_summary_parameter: true,
              supported_reasoning_levels: [
                { effort: "low", description: "Fast responses" },
                { effort: "max", description: "Maximum reasoning" },
              ],
            },
            {
              slug: "codex-auto-review",
              visibility: "hide",
              context_window: 272_000,
              effective_context_window_percent: 95,
            },
          ],
        }),
      now: () => NOW,
      getAuth: async () => auth,
    })

    expect(await service.accountModels(SIGNAL)).toEqual([
      {
        id: "gpt-5.6-terra",
        contextWindow: 258_400,
        inputModalities: ["text", "image"],
        reasoningSummary: true,
        reasoningEfforts: ["low", "max"],
      },
    ])
  })

  test("does not back off account model loading after a catalog request is aborted", async () => {
    let firstRequest = true
    const started = createDeferredResponse()
    const request = async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (firstRequest) {
        firstRequest = false
        started.request()
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
    }
    const service = createService({
      fetch: request,
      now: () => NOW,
      getAuth: async () => createAuth(),
    })
    const abortController = new AbortController()

    const catalog = service.accountModels(abortController.signal)
    await started.requested
    abortController.abort()

    expect(await catalog).toBeUndefined()
    expect(await service.models({ refresh: false })).toEqual({
      status: "loading",
    })
    await service.accountModels(SIGNAL)
    expect(await service.models({ refresh: false })).toMatchObject({
      status: "ready",
      modelIDs: ["gpt-5.5"],
    })
  })

  test("uses the cached ETag on an explicit model refresh", async () => {
    let firstRequest = true
    const request = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      if (firstRequest) {
        firstRequest = false
        expect(headers.get("if-none-match")).toBeNull()
        return Response.json(
          { models: [{ slug: "gpt-5.5", visibility: "list" }] },
          { headers: { etag: '"models-v1"' } },
        )
      }
      expect(headers.get("if-none-match")).toBe('"models-v1"')
      return new Response(null, { status: 304 })
    }
    const service = createService({
      fetch: request,
      now: () => NOW,
      getAuth: async () => createAuth(),
    })

    await service.models({ refresh: true })
    expect(await service.models({ refresh: true })).toMatchObject({
      status: "ready",
      modelIDs: ["gpt-5.5"],
    })
  })

  test("serves cached models while updating newly available models in the background", async () => {
    let now = NOW
    const updatedResponse = createDeferredResponse()
    let requests = 0
    const service = createService({
      fetch: async () => {
        requests += 1
        if (requests === 1) {
          return Response.json({ models: [{ slug: "gpt-5.6-sol", visibility: "list" }] })
        }
        return updatedResponse.promise
      },
      now: () => now,
      getAuth: async () => createAuth(),
    })

    expect((await service.accountModels(SIGNAL))?.map((model) => model.id)).toEqual(["gpt-5.6-sol"])
    now += 5 * 60 * 1_000 + 1
    expect((await service.accountModels(SIGNAL))?.map((model) => model.id)).toEqual(["gpt-5.6-sol"])
    expect(requests).toBe(2)

    updatedResponse.resolve(
      Response.json({
        models: [
          { slug: "gpt-5.6-sol", visibility: "list" },
          { slug: "gpt-6-sol", visibility: "list" },
        ],
      }),
    )
    expect((await service.models({ refresh: true })).status).toBe("ready")
    expect((await service.accountModels(SIGNAL))?.map((model) => model.id)).toEqual([
      "gpt-5.6-sol",
      "gpt-6-sol",
    ])
  })

  test("treats an empty account model response as unavailable", async () => {
    const service = createService({
      fetch: async () => Response.json({ models: [] }),
      now: () => NOW,
      getAuth: async () => createAuth(),
    })

    expect(await service.models({ refresh: true })).toEqual({
      status: "error",
    })
  })

  test("marks an unauthorized model refresh as requiring reconnection", async () => {
    let rejected = false
    const service = createService({
      fetch: async () =>
        rejected
          ? Response.json({ plan_type: "plus", models: [{ slug: "gpt-5.5", visibility: "list" }] })
          : Response.json({}, { status: 401 }),
      now: () => NOW,
      getAuth: async () => createAuth(),
    })

    expect(await service.models({ refresh: true })).toEqual({
      status: "reconnect_required",
    })
    rejected = true
    expect(await service.models({ refresh: false })).toEqual({
      status: "reconnect_required",
    })
    expect(await service.usage({ refresh: false })).toEqual({ status: "reconnect_required" })
  })

  test("keeps transient model refresh failures distinct from invalid authentication", async () => {
    const service = createService({
      fetch: async () => Response.json({}, { status: 503 }),
      now: () => NOW,
      getAuth: async () => createAuth(),
    })

    expect(await service.models({ refresh: true })).toEqual({ status: "error" })
  })

  test("clears reconnect-required state when the account receives new credentials", async () => {
    let auth = createAuth()
    let firstRequest = true
    const request = async () => {
      if (firstRequest) {
        firstRequest = false
        return Response.json({}, { status: 401 })
      }
      return Response.json({ models: [{ slug: "gpt-5.5", visibility: "list" }] })
    }
    const service = createService({
      fetch: request,
      now: () => NOW,
      getAuth: async () => auth,
    })

    expect(await service.models({ refresh: true })).toEqual({
      status: "reconnect_required",
    })

    auth = { ...auth, access: "new-access-token", refresh: "new-refresh-token" }
    expect(await service.models({ refresh: false })).toEqual({ status: "loading" })
    await service.accountModels(SIGNAL)
    expect(await service.models({ refresh: false })).toMatchObject({
      status: "ready",
      modelIDs: ["gpt-5.5"],
    })
  })

  test("normalizes plan usage and reuses it for sixty seconds", async () => {
    let now = NOW
    let plan = "plus"
    const request = async () =>
      Response.json({
        plan_type: plan,
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
      })
    const service = createService({
      fetch: request,
      now: () => now,
      getAuth: async () => createAuth(),
    })

    const first = await service.usage({ refresh: false })
    expect(first).toMatchObject({
      status: "ready",
      plan: "plus",
      rateLimit: {
        primary: { usedPercent: 12.4, windowSeconds: 18_000 },
        secondary: { usedPercent: 31, windowSeconds: 604_800 },
      },
      credits: { hasCredits: true, unlimited: false, balance: 4.5 },
    })

    plan = "pro"
    now += 59_000
    expect(await service.usage({ refresh: false })).toEqual(first)

    now += 2_000
    expect(await service.usage({ refresh: false })).toMatchObject({ status: "ready", plan: "pro" })
  })

  test("does not mask invalid authentication with cached usage", async () => {
    let firstRequest = true
    const request = async () => {
      if (firstRequest) {
        firstRequest = false
        return Response.json({ plan_type: "plus" })
      }
      return Response.json({}, { status: 401 })
    }
    const service = createService({
      fetch: request,
      now: () => NOW,
      getAuth: async () => createAuth(),
    })

    expect(await service.usage({ refresh: false })).toMatchObject({ status: "ready" })
    expect(await service.usage({ refresh: true })).toEqual({
      status: "reconnect_required",
    })
    expect(await service.usage({ refresh: false })).toEqual({
      status: "reconnect_required",
    })
  })

  test("does not share in-flight model results across account changes", async () => {
    const accountAResponse = createDeferredResponse()
    const accountBResponse = createDeferredResponse()
    let auth = createAuth()
    const service = createService({
      fetch: async (_input, init) => {
        const accountId = new Headers(init?.headers).get("ChatGPT-Account-Id")
        if (accountId === "account-a") return accountAResponse.request()
        if (accountId === "account-b") return accountBResponse.request()
        throw new Error(`Unexpected account: ${accountId ?? "missing"}`)
      },
      now: () => NOW,
      getAuth: async () => auth,
    })

    auth = {
      ...createAuth(),
      access: "access-a",
      refresh: "refresh-a",
      accountId: "account-a",
    }
    const accountARefresh = service.models({ refresh: true })
    await accountAResponse.requested

    auth = {
      ...createAuth(),
      access: "access-b",
      refresh: "refresh-b",
      accountId: "account-b",
    }
    const accountBRefresh = service.models({ refresh: true })
    await accountBResponse.requested

    accountAResponse.resolve(Response.json({ models: [{ slug: "model-a", visibility: "list" }] }))
    expect(await accountARefresh).toMatchObject({
      status: "ready",
      modelIDs: ["model-a"],
    })
    expect(await service.models({ refresh: false })).toEqual({ status: "loading" })

    accountBResponse.resolve(Response.json({ models: [{ slug: "model-b", visibility: "list" }] }))
    expect(await accountBRefresh).toMatchObject({
      status: "ready",
      modelIDs: ["model-b"],
    })
    expect(await service.models({ refresh: false })).toMatchObject({
      status: "ready",
      modelIDs: ["model-b"],
    })
  })

  test("does not share in-flight usage results across account changes", async () => {
    const accountAResponse = createDeferredResponse()
    const accountBResponse = createDeferredResponse()
    let auth = createAuth()
    const service = createService({
      fetch: async (_input, init) => {
        const accountId = new Headers(init?.headers).get("ChatGPT-Account-Id")
        if (accountId === "account-a") return accountAResponse.request()
        if (accountId === "account-b") return accountBResponse.request()
        throw new Error(`Unexpected account: ${accountId ?? "missing"}`)
      },
      now: () => NOW,
      getAuth: async () => auth,
    })

    auth = {
      ...createAuth(),
      access: "access-a",
      refresh: "refresh-a",
      accountId: "account-a",
    }
    const accountAUsage = service.usage({ refresh: false })
    await accountAResponse.requested

    auth = {
      ...createAuth(),
      access: "access-b",
      refresh: "refresh-b",
      accountId: "account-b",
    }
    const accountBUsage = service.usage({ refresh: false })
    await accountBResponse.requested

    accountAResponse.resolve(Response.json({ plan_type: "plus" }))
    expect(await accountAUsage).toMatchObject({ status: "ready", plan: "plus" })

    accountBResponse.resolve(Response.json({ plan_type: "pro" }))
    expect(await accountBUsage).toMatchObject({ status: "ready", plan: "pro" })
    expect(await service.usage({ refresh: false })).toMatchObject({
      status: "ready",
      plan: "pro",
    })
  })

  test("does not call account endpoints for a non-OAuth OpenAI connection", async () => {
    const service = createService({
      fetch: async () => {
        throw new Error("Unexpected account request")
      },
      now: () => NOW,
      getAuth: async () => undefined,
    })

    expect(await service.models({ refresh: false })).toEqual({
      status: "not_connected",
    })
    expect(await service.usage({ refresh: false })).toEqual({ status: "not_connected" })
  })
})
