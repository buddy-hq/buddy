import "../happydom"
import { afterEach, expect, test } from "bun:test"
import type { ProviderAuthMethod } from "@buddy/sdk"
import { QueryObserver } from "@tanstack/react-query"
import {
  authorizeProviderOAuth,
  cancelProviderOAuth,
  completeProviderOAuth,
  removeProviderAuth,
  resolveProviderAuthAnswers,
} from "../src/lib/provider-auth"
import { openAIAccountQueryKeys } from "../src/state/openai-account-query"
import {
  openAIUsageQueryKeys,
  openAIUsageQueryOptions,
  type OpenAIUsageSnapshot,
} from "../src/state/openai-usage-query"
import { appQueryClient } from "../src/state/query-client"
import { installTestFetch, restoreTestFetch } from "./test-utils"

const originalFetch = globalThis.fetch

afterEach(() => {
  appQueryClient.clear()
  restoreTestFetch(originalFetch)
})

test("successful OAuth completion clears the previous ChatGPT account", async () => {
  appQueryClient.setQueryData(openAIAccountQueryKeys.current(), {
    status: "ready",
    email: "previous@example.com",
  })
  installTestFetch(async (input) => {
    expect(String(input)).toContain("/provider/openai/oauth/callback")
    return Response.json(true)
  })

  await completeProviderOAuth({
    providerID: "openai",
    methodID: "chatgpt-browser",
    attemptID: "con_test",
  })

  expect(appQueryClient.getQueryData(openAIAccountQueryKeys.current())).toBeUndefined()
})

test("switching ChatGPT accounts refetches usage for an already mounted observer", async () => {
  const previous: OpenAIUsageSnapshot = {
    status: "ready",
    plan: "plus",
    rateLimit: {
      primary: { usedPercent: 100, resetsAt: "2026-10-02T13:00:00.000Z", windowSeconds: 18_000 },
      secondary: null,
    },
    additionalRateLimits: [],
    credits: null,
    fetchedAt: "2026-10-02T12:00:00.000Z",
  }
  const current: OpenAIUsageSnapshot = {
    ...previous,
    rateLimit: {
      ...previous.rateLimit,
      primary: { usedPercent: 20, resetsAt: "2026-10-02T13:00:00.000Z", windowSeconds: 18_000 },
    },
  }
  appQueryClient.setQueryData(openAIUsageQueryKeys.current(), previous)
  installTestFetch(async (input) => {
    const url = String(input)
    if (url.includes("/provider/openai/oauth/callback")) return Response.json(true)
    expect(url).toContain("/provider/openai/usage")
    return Response.json(current)
  })
  const observer = new QueryObserver(appQueryClient, openAIUsageQueryOptions(true))
  const unsubscribe = observer.subscribe(() => {})
  try {
    expect(observer.getCurrentResult().data).toEqual(previous)
    await completeProviderOAuth({
      providerID: "openai",
      methodID: "chatgpt-browser",
      attemptID: "con_switch",
    })
    expect(observer.getCurrentResult().data).toEqual(current)
  } finally {
    unsubscribe()
  }
})

test("removing ChatGPT auth clears the previous account", async () => {
  appQueryClient.setQueryData(openAIAccountQueryKeys.current(), {
    status: "ready",
    email: "previous@example.com",
  })
  appQueryClient.setQueryData(openAIUsageQueryKeys.current(), { status: "ready" })
  installTestFetch(async (input) => {
    expect(String(input)).toContain("/auth/openai")
    return Response.json(true)
  })

  await removeProviderAuth({ providerID: "openai" })

  expect(appQueryClient.getQueryData(openAIAccountQueryKeys.current())).toBeUndefined()
  expect(appQueryClient.getQueryData(openAIUsageQueryKeys.current())).toBeUndefined()
})

test("OAuth completion and cancellation send the specific attempt IDs", async () => {
  const requests: { path: string; body: unknown }[] = []
  installTestFetch(async (input, init) => {
    const path = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
      .pathname
    if (path.endsWith("/provider/auth"))
      return Response.json({
        openai: [{ id: "chatgpt-browser", type: "oauth", label: "Codex browser (legacy)" }],
      })
    requests.push({
      path,
      body: input instanceof Request ? await input.json() : JSON.parse(String(init?.body)),
    })
    if (path.endsWith("/authorize"))
      return Response.json({
        url: "https://example.test/oauth",
        method: "auto",
        instructions: "Sign in",
        methodID: "chatgpt-browser",
        attemptID: "con_first",
        expiresAt: 9999999999999,
      })
    return Response.json(true)
  })
  const authorization = await authorizeProviderOAuth({ providerID: "openai", methodIndex: 0 })
  if (!authorization) throw new Error("Authorization was not returned")
  await completeProviderOAuth({
    providerID: "openai",
    methodID: authorization.methodID,
    attemptID: authorization.attemptID,
  })
  await cancelProviderOAuth({ providerID: "openai", attemptID: "con_second" })
  expect(requests.map((request) => request.body)).toEqual([
    { methodID: "chatgpt-browser", answers: {} },
    { methodID: "chatgpt-browser", attemptID: "con_first" },
    { attemptID: "con_second" },
  ])
})

test("provider form answers preserve hidden defaults and omit inactive fields", () => {
  const method: ProviderAuthMethod = {
    id: "device",
    type: "oauth",
    label: "GitHub Copilot",
    prompts: [
      {
        type: "select",
        key: "deployment",
        message: "Deployment",
        default: "public",
        options: [
          { label: "Public", value: "public" },
          { label: "Enterprise", value: "enterprise" },
        ],
      },
      {
        type: "text",
        key: "enterpriseURL",
        message: "Enterprise URL",
        when: [{ key: "deployment", op: "eq", value: "enterprise" }],
      },
      {
        type: "text",
        key: "server",
        message: "Server",
        hidden: true,
        default: "https://example.test",
      },
    ],
  }
  expect(resolveProviderAuthAnswers(method, { enterpriseURL: "https://previous.test" })).toEqual({
    deployment: "public",
    server: "https://example.test",
  })
  expect(
    resolveProviderAuthAnswers(method, {
      deployment: "enterprise",
      enterpriseURL: "https://company.test",
    }),
  ).toEqual({
    deployment: "enterprise",
    enterpriseURL: "https://company.test",
    server: "https://example.test",
  })
})
