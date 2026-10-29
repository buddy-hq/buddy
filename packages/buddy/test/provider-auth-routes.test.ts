import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import {
  providerAuthorizationSchema,
  providerListSchema,
  type ProviderOAuthStart,
} from "@buddy/agent-runtime/providers"
import { RuntimeError } from "@buddy/agent-runtime/errors"
import { createAuthRoutes } from "../src/routes/auth"
import { createProviderRoutes } from "../src/routes/provider"
import { getAgentRuntime, closeAgentRuntime } from "../src/runtime/agent-runtime"
import { temporaryDirectory } from "./helpers/temporary-directory"
import { writeProjectConfig } from "./helpers/project-config"
import { temporaryEnvironment } from "./helpers/temporary-environment"

test("provider routes complete the selected OAuth attempt and reject a cancelled attempt", async () => {
  await using project = await temporaryDirectory({ prefix: "provider-attempts-" })
  const directory = await fs.realpath(project.path)
  using environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: directory })
  void environment
  const runtime = await getAgentRuntime()
  await using cleanup = { [Symbol.asyncDispose]: closeAgentRuntime }
  void cleanup
  const attempts = new Map<string, { directory: string; providerID: string; methodID: string }>()
  let connected = false
  const providers = {
    ...runtime.providers,
    async catalog() {
      return { all: [], default: {}, connected: connected ? ["openai"] : [] }
    },
    async startOAuth(requestDirectory: string, providerID: string, input: ProviderOAuthStart) {
      if (input.methodID !== "fixture-code")
        throw new RuntimeError("not_found", "OAuth method is unavailable", {
          subject: "integration",
        })
      const attemptID = crypto.randomUUID()
      attempts.set(attemptID, { directory: requestDirectory, providerID, methodID: input.methodID })
      return {
        attemptID,
        methodID: input.methodID,
        url: "https://login.invalid/authorize",
        method: "code" as const,
        instructions: "Enter a code",
        expiresAt: Number.MAX_SAFE_INTEGER,
      }
    },
    async completeOAuth(
      requestDirectory: string,
      providerID: string,
      input: { attemptID: string; methodID?: string; code?: string },
    ) {
      const attempt = attempts.get(input.attemptID)
      if (!attempt || attempt.directory !== requestDirectory || attempt.providerID !== providerID)
        throw new RuntimeError("not_found", "Authorization attempt not found", {
          subject: "integration",
        })
      if (input.methodID !== attempt.methodID || input.code !== "fixture-access")
        throw new RuntimeError("invalid", "Invalid authorization response", { subject: "provider" })
      connected = true
      attempts.delete(input.attemptID)
    },
    async cancelOAuth(requestDirectory: string, providerID: string, attemptID: string) {
      const attempt = attempts.get(attemptID)
      if (attempt?.directory === requestDirectory && attempt.providerID === providerID)
        attempts.delete(attemptID)
    },
  }
  const app = new Hono().route(
    "/provider",
    createProviderRoutes({ getRuntime: async () => ({ providers, chatgpt: runtime.chatgpt }) }),
  )
  const headers = { "x-buddy-directory": directory, "content-type": "application/json" }
  const start = async () => {
    const response = await app.request("/provider/openai/oauth/authorize", {
      method: "POST",
      headers,
      body: JSON.stringify({ methodID: "fixture-code" }),
    })
    expect(response.status).toBe(200)
    return providerAuthorizationSchema.parse(await response.json())
  }
  const first = await start()
  const second = await start()
  const cancelled = await app.request("/provider/openai/oauth/cancel", {
    method: "POST",
    headers,
    body: JSON.stringify({ attemptID: second.attemptID }),
  })
  expect(await cancelled.json()).toBe(true)
  const completed = await app.request("/provider/openai/oauth/callback", {
    method: "POST",
    headers,
    body: JSON.stringify({
      attemptID: first.attemptID,
      methodID: first.methodID,
      code: "fixture-access",
    }),
  })
  expect(completed.status).toBe(200)
  expect(await completed.json()).toBe(true)
  const catalog = await app.request("/provider", { headers })
  expect(providerListSchema.parse(await catalog.json()).connected).toContain("openai")
  const stale = await app.request("/provider/openai/oauth/callback", {
    method: "POST",
    headers,
    body: JSON.stringify({
      attemptID: second.attemptID,
      methodID: second.methodID,
      code: "fixture-access",
    }),
  })
  expect(stale.status).toBe(404)
  const invalid = await app.request("/provider/openai/oauth/authorize", {
    method: "POST",
    headers,
    body: JSON.stringify({ methodID: "missing" }),
  })
  expect(invalid.status).toBe(404)
})

test("cold provider and auth routes apply Buddy policy, external edits and validation without another runtime operation", async () => {
  await using repo = await temporaryDirectory({ prefix: "cold-provider-policy-" })
  const directory = await fs.realpath(repo.path)
  using environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: repo.path })
  void environment
  await fs.writeFile(
    path.join(repo.path, "opencode.json"),
    JSON.stringify({
      enabled_providers: ["fixture"],
      provider: {
        fixture: {
          npm: "@ai-sdk/openai-compatible",
          options: { apiKey: "raw-key", baseURL: "https://example.invalid" },
          models: { keep: {} },
        },
      },
    }),
  )
  writeProjectConfig(repo.path, JSON.stringify({ disabled_providers: ["fixture"] }))
  const runtime = await getAgentRuntime()
  await using cleanup = { [Symbol.asyncDispose]: closeAgentRuntime }
  void cleanup
  const input = { getRuntime: async () => runtime }
  const app = new Hono()
    .route("/provider", createProviderRoutes(input))
    .route("/auth", createAuthRoutes(input))
  const headers = { "x-buddy-directory": repo.path, "content-type": "application/json" }
  const list = async () => {
    const response = await app.request("/provider", { headers })
    expect(response.status).toBe(200)
    return providerListSchema.parse(await response.json())
  }
  const cold = await list()
  expect(cold.connected).not.toContain("fixture")
  expect(cold.all.some((provider) => provider.id === "fixture")).toBe(false)
  writeProjectConfig(repo.path, JSON.stringify({ enabled_providers: ["fixture"] }))
  const edited = await list()
  expect(edited.connected).toContain("fixture")
  expect(edited.all.find((provider) => provider.id === "fixture")?.models.keep).toBeDefined()
  writeProjectConfig(repo.path, JSON.stringify({ disabled_providers: ["fixture"] }))
  const authResponse = await app.request("/provider/auth", { headers })
  expect(authResponse.status).toBe(200)
  expect((await runtime.providers.catalog(directory)).connected.includes("fixture")).toBe(false)
  writeProjectConfig(repo.path, JSON.stringify({ enabled_providers: ["fixture"] }))
  const keyResponse = await app.request("/auth/fixture", {
    method: "PUT",
    headers,
    body: JSON.stringify({ type: "api", key: "new-key" }),
  })
  expect(keyResponse.status).toBe(200)
  expect((await runtime.providers.catalog(directory)).connected.includes("fixture")).toBe(true)
  writeProjectConfig(repo.path, JSON.stringify({ mcp: { invalid: { enabled: true } } }))
  for (const [url, method, body] of [
    ["/provider", "GET", undefined],
    ["/provider/auth", "GET", undefined],
    ["/auth/fixture", "PUT", JSON.stringify({ type: "api", key: "must-not-store" })],
    ["/auth/fixture", "DELETE", undefined],
    ["/provider/openai/account", "GET", undefined],
  ]) {
    const response = await app.request(url ?? "", { method, headers, body })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: "Enabled MCP server needs a local command or remote URL",
    })
  }
  writeProjectConfig(repo.path, JSON.stringify({ enabled_providers: ["fixture"] }))
  expect(JSON.stringify(await runtime.providers.catalog(directory))).not.toContain("must-not-store")
})
