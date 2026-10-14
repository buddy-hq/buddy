import { expect, test } from "bun:test"
import { Hono } from "hono"
import { Plugin } from "@buddy/opencode-adapter/plugin"
import { Credential, Integration, providerAuthorizationSchema } from "@buddy/opencode-adapter/gateway/integration"
import { providerListSchema } from "@buddy/opencode-adapter/gateway/provider"
import { createOpenAICodexPlugin } from "../src/opencode-runtime/plugins/openai-codex-auth"
import { createAuthRoutes } from "../src/routes/auth"
import { createProviderRoutes } from "../src/routes/provider"
import fs from "node:fs/promises"
import path from "node:path"
import { createNotebookTestHost } from "./helpers/opencode"
import { createGitRepo } from "./helpers/repo"
import { writeProjectConfig } from "./helpers/project-config"
import { temporaryEnvironment } from "./helpers/temporary-environment"

test("provider routes expose a disconnected catalog and isolate explicit OAuth attempts", async () => {
  await using runtime = await createNotebookTestHost()
  using environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: runtime.root })
  void environment
  await runtime.host.plugin(createOpenAICodexPlugin({ fetch: async () => { throw new Error("Unexpected account request") } }))
  await runtime.host.plugin(Plugin.define({ id: "buddy.test.route-auth", setup: async (ctx) => {
    await ctx.integration.transform((editor) => editor.method.update({ integrationID: "openai", method: { id: "fixture-code", type: "oauth", label: "Fixture code" }, authorize: async () => ({ mode: "code", url: "https://example.test/oauth", instructions: "Enter a code", callback: async (code) => Credential.OAuth.make({ type: "oauth", methodID: Integration.MethodID.make("fixture-code"), access: code, refresh: "private-refresh", expires: Date.now() + 3_600_000 }) }) }))
  } }))
  const input = { getClient: async () => runtime.host }
  const app = new Hono().route("/provider", createProviderRoutes(input)).route("/auth", createAuthRoutes(input))
  const headers = { "x-buddy-directory": runtime.root, "content-type": "application/json" }
  const catalogResponse = await app.request("/provider", { headers })
  expect(catalogResponse.status).toBe(200)
  const catalog = providerListSchema.parse(await catalogResponse.json())
  expect(catalog.all.some((provider) => provider.id === "openai")).toBe(true)
  expect(catalog.connected).not.toContain("openai")
  const start = async () => {
    const response = await app.request("/provider/openai/oauth/authorize", { method: "POST", headers, body: JSON.stringify({ methodID: "fixture-code" }) })
    expect(response.status).toBe(200)
    return providerAuthorizationSchema.parse(await response.json())
  }
  const first = await start()
  const second = await start()
  expect(first.attemptID).not.toBe(second.attemptID)
  const cancelled = await app.request("/provider/openai/oauth/cancel", { method: "POST", headers, body: JSON.stringify({ attemptID: second.attemptID }) })
  expect(cancelled.status).toBe(200)
  const completed = await app.request("/provider/openai/oauth/callback", { method: "POST", headers, body: JSON.stringify({ methodID: first.methodID, attemptID: first.attemptID, code: "private-access" }) })
  expect(completed.status).toBe(200)
  expect(await completed.json()).toBe(true)
  const account = await app.request("/provider/openai/account", { headers })
  expect(account.status).toBe(200)
  expect(await account.json()).toEqual({ status: "not_connected" })
  const methods = await app.request("/provider/auth", { headers })
  expect(await methods.text()).not.toMatch(/private-access|private-refresh/u)
  const invalidMethod = await app.request("/provider/openai/oauth/authorize", { method: "POST", headers, body: JSON.stringify({ methodID: "missing" }) })
  expect({ status: invalidMethod.status, body: await invalidMethod.json() }).toMatchObject({ status: 404 })
  const invalidAttempt = await app.request("/provider/openai/oauth/callback", { method: "POST", headers, body: JSON.stringify({ attemptID: second.attemptID }) })
  expect(invalidAttempt.status).toBe(404)
  const rawSecret = await app.request("/auth/openai", { method: "PUT", headers, body: JSON.stringify({ type: "oauth", access: "secret", refresh: "secret", expires: 0 }) })
  expect(rawSecret.status).toBe(400)
  const saved = await app.request("/auth/openai", { method: "PUT", headers, body: JSON.stringify({ type: "api", key: "private-key" }) })
  expect(saved.status).toBe(200)
  const removed = await app.request("/auth/openai", { method: "DELETE", headers })
  expect(removed.status).toBe(200)
  expect((await runtime.host.credential.list()).filter((credential) => credential.integrationID === "openai")).toEqual([])
})

test("cold provider and auth routes apply Buddy policy, external edits and validation without another runtime operation", async () => {
  await using repo = await createGitRepo("cold-provider-policy")
  using environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: repo.path })
  void environment
  await fs.writeFile(path.join(repo.path, "opencode.json"), JSON.stringify({ enabled_providers: ["fixture"], provider: { fixture: { npm: "@ai-sdk/openai-compatible", options: { apiKey: "raw-key", baseURL: "https://example.invalid" }, models: { keep: {} } } } }))
  writeProjectConfig(repo.path, JSON.stringify({ disabled_providers: ["fixture"] }))
  await using runtime = await createNotebookTestHost({ plugins: [createOpenAICodexPlugin({ fetch: async () => { throw new Error("Unexpected account request") } })] })
  const input = { getClient: async () => runtime.host }
  const app = new Hono().route("/provider", createProviderRoutes(input)).route("/auth", createAuthRoutes(input))
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
  expect((await runtime.host.provider.list({ location: { directory: repo.path } })).data.some((provider) => provider.id === "fixture")).toBe(false)
  writeProjectConfig(repo.path, JSON.stringify({ enabled_providers: ["fixture"] }))
  const keyResponse = await app.request("/auth/fixture", { method: "PUT", headers, body: JSON.stringify({ type: "api", key: "new-key" }) })
  expect(keyResponse.status).toBe(200)
  expect((await runtime.host.provider.list({ location: { directory: repo.path } })).data.some((provider) => provider.id === "fixture")).toBe(true)
  writeProjectConfig(repo.path, JSON.stringify({ mcp: { invalid: { enabled: true } } }))
  for (const [url, method, body] of [["/provider", "GET", undefined], ["/provider/auth", "GET", undefined], ["/auth/fixture", "PUT", JSON.stringify({ type: "api", key: "must-not-store" })], ["/auth/fixture", "DELETE", undefined], ["/provider/openai/account", "GET", undefined]]) {
    const response = await app.request(url ?? "", { method, headers, body })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: "Enabled MCP server needs a local command or remote URL" })
  }
  expect(JSON.stringify(await runtime.host.credential.list())).not.toContain("must-not-store")
})
