import "../happydom"
import { afterEach, expect, test } from "bun:test"
import { completeProviderOAuth, removeProviderAuth } from "../src/lib/provider-auth"
import { openAIAccountQueryKeys } from "../src/state/openai-account-query"
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

  await completeProviderOAuth({ providerID: "openai", methodIndex: 0 })

  expect(appQueryClient.getQueryData(openAIAccountQueryKeys.current())).toBeUndefined()
})

test("removing ChatGPT auth clears the previous account", async () => {
  appQueryClient.setQueryData(openAIAccountQueryKeys.current(), {
    status: "ready",
    email: "previous@example.com",
  })
  installTestFetch(async (input) => {
    expect(String(input)).toContain("/auth/openai")
    return Response.json(true)
  })

  await removeProviderAuth({ providerID: "openai" })

  expect(appQueryClient.getQueryData(openAIAccountQueryKeys.current())).toBeUndefined()
})
