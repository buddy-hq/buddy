import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Plugin, type PluginContext } from "@buddy/opencode-adapter/plugin"
import { Credential, Integration, startProviderOAuth, completeProviderOAuth, cancelProviderOAuth, listProviderAuth, setProviderKey, removeProviderCredentials, resolveIntegrationCredential } from "@buddy/opencode-adapter/gateway/integration"
import { Provider, createProviderCatalogPlugin } from "@buddy/opencode-adapter/gateway/provider"
import { createOpenAICodexCredentialResolver } from "../../src/opencode-runtime/plugins/openai-codex-credentials"
import { createV2TestHost } from "../helpers/v2-host"

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve(value: T) { if (!resolve) throw new Error("Deferred is uninitialized"); resolve(value) } }
}

function oauthValue(access: string) {
  return Credential.OAuth.make({ type: "oauth", methodID: Integration.MethodID.make("fixture-auto"), access, refresh: "refresh", expires: Date.now() + 3_600_000 })
}

test("independent OAuth attempt IDs target the correct completion and cancellation", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(createProviderCatalogPlugin())
  const attempts: ReturnType<typeof deferred<Credential.OAuth>>[] = []
  await runtime.host.plugin(Plugin.define({ id: "buddy.test.oauth", setup: async (ctx) => {
    await ctx.integration.transform((editor) => editor.method.update({ integrationID: "openai", method: { id: "fixture-auto", type: "oauth", label: "Fixture OAuth", form: [{ type: "string", key: "deployment", title: "Deployment", required: true, options: [{ label: "Public", value: "public" }] }] }, authorize: async (answers) => {
      expect(answers.deployment).toBe("public")
      const result = deferred<Credential.OAuth>()
      attempts.push(result)
      return { mode: "auto", url: "https://example.test/oauth", instructions: "Sign in", callback: result.promise }
    } }))
  } }))
  const methods = await listProviderAuth(runtime.host, runtime.path)
  expect(methods.openai?.some((method) => method.id === "chatgpt-browser")).toBe(true)
  expect(methods.openai?.find((method) => method.id === "fixture-auto")?.prompts).toEqual([{ type: "select", key: "deployment", message: "Deployment", required: true, options: [{ label: "Public", value: "public" }] }])
  const first = await startProviderOAuth(runtime.host, runtime.path, "openai", { methodID: "fixture-auto", answers: { deployment: "public" } })
  const second = await startProviderOAuth(runtime.host, runtime.path, "openai", { methodID: "fixture-auto", answers: { deployment: "public" } })
  expect(first.attemptID).not.toBe(second.attemptID)
  expect(first.methodID).toBe("fixture-auto")
  await cancelProviderOAuth(runtime.host, runtime.path, "openai", first.attemptID)
  const remaining = await runtime.host.integration.oauth.status({ location: { directory: runtime.path }, integrationID: "openai", attemptID: second.attemptID })
  expect(remaining.data.status).toBe("pending")
  attempts[1]?.resolve(oauthValue("second-access"))
  expect(await completeProviderOAuth(runtime.host, runtime.path, "openai", second)).toBe(true)
  const credentials = await runtime.host.credential.list()
  expect(credentials.some((entry) => entry.integrationID === "openai" && entry.value.type === "oauth" && entry.value.access === "second-access")).toBe(true)
})

test("disconnect removes all stored credentials while method lists never expose their values", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(createProviderCatalogPlugin())
  await setProviderKey(runtime.host, runtime.path, "openai", "first-secret")
  await setProviderKey(runtime.host, runtime.path, "openai", "second-secret")
  const methods = await listProviderAuth(runtime.host, runtime.path)
  expect(JSON.stringify(methods)).not.toContain("secret")
  await removeProviderCredentials(runtime.host, runtime.path, "openai")
  expect((await runtime.host.credential.list()).filter((entry) => entry.integrationID === "openai")).toEqual([])
})

test("a disconnected provider alias resolves its integration for key set and removal", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(Plugin.define({ id: "buddy.test.provider-alias", setup: async (ctx) => {
    await ctx.provider.transform((editor) => editor.add({ info: { ...Provider.Info.empty(Provider.ID.make("anthropic-alias")), name: "Anthropic alias", integrationID: Integration.ID.make("anthropic") }, models: [] }))
  } }))
  await runtime.host.plugin(createProviderCatalogPlugin())
  const methods = await listProviderAuth(runtime.host, runtime.path)
  expect(methods["anthropic-alias"]).toEqual(methods.anthropic)
  await setProviderKey(runtime.host, runtime.path, "anthropic-alias", "alias-secret")
  const connected = await runtime.host.integration.get({ location: { directory: runtime.path }, integrationID: "anthropic" })
  expect(connected.data?.connections.some((connection) => connection.type === "credential")).toBe(true)
  await removeProviderCredentials(runtime.host, runtime.path, "anthropic-alias")
  expect((await runtime.host.credential.list()).filter((entry) => entry.integrationID === "anthropic")).toEqual([])
})

test("Buddy credential resolution shares one refresh across concurrent notebook consumers", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(createProviderCatalogPlugin())
  const refreshed = deferred<Credential.OAuth>()
  const started = deferred<void>()
  let calls = 0
  let context: PluginContext | undefined
  await runtime.host.plugin(Plugin.define({ id: "buddy.test.refresh", setup: async (ctx) => {
    context = ctx
    await ctx.integration.transform((editor) => editor.method.update({ integrationID: "anthropic", method: { id: "fixture-auto", type: "oauth", label: "Fixture OAuth" }, authorize: async () => ({ mode: "auto", url: "https://example.test", instructions: "Sign in", callback: Promise.resolve(oauthValue("access")) }), refresh: async () => { calls += 1; started.resolve(); return refreshed.promise } }))
  } }))
  await runtime.host.integration.list({ location: { directory: runtime.path } })
  await runtime.host.credential.create({ integrationID: "anthropic", value: { type: "oauth", methodID: "fixture-auto", access: "expired", refresh: "refresh", expires: 0 } })
  if (!context) throw new Error("Plugin did not activate")
  const firstContext = context
  const connection = await context.integration.connection.active("anthropic")
  if (!connection) throw new Error("Connection is missing")
  const secondDirectory = path.join(runtime.path, "second-notebook")
  await fs.mkdir(secondDirectory)
  await runtime.host.integration.list({ location: { directory: secondDirectory } })
  expect(context).not.toBe(firstContext)
  const first = resolveIntegrationCredential(firstContext, connection)
  await started.promise
  const second = resolveIntegrationCredential(context, connection)
  refreshed.resolve(oauthValue("refreshed"))
  expect((await first)?.type).toBe("oauth")
  expect((await second)?.type).toBe("oauth")
  expect(calls).toBe(1)
})

test("a failed older credential resolution cannot mark a successfully refreshed Codex connection as needing auth", async () => {
  await using runtime = await createV2TestHost()
  const started = deferred<void>()
  const failed = deferred<void>()
  let refreshToNew = false
  let context: PluginContext | undefined
  await runtime.host.plugin(Plugin.define({ id: "buddy.test.codex-refresh-rejection", async setup(ctx) {
    context = ctx
    await ctx.integration.transform((editor) => editor.method.update({ integrationID: "openai", method: { id: "chatgpt-browser", type: "oauth", label: "Fixture OAuth" }, authorize: async () => { throw new Error("Unexpected authorization") }, refresh: async (credential) => refreshToNew ? Credential.OAuth.make({ ...credential, access: "new-access", refresh: "new-refresh", expires: Number.MAX_SAFE_INTEGER }) : credential }))
  } }))
  await runtime.host.integration.list({ location: { directory: runtime.path } })
  const saved = await runtime.host.credential.create({ integrationID: "openai", value: { type: "oauth", methodID: "chatgpt-browser", access: "old-access", refresh: "old-refresh", expires: 0 } })
  if (!context) throw new Error("Plugin did not activate")
  const activeContext = context
  const oldResolver = createOpenAICodexCredentialResolver({ ...activeContext, integration: { ...activeContext.integration, connection: { ...activeContext.integration.connection, resolve: async (connection) => {
    expect(await activeContext.integration.connection.resolve(connection)).toMatchObject({ access: "old-access" })
    started.resolve()
    await failed.promise
    throw new Error("Request failed: 401")
  } } } })
  const oldRefresh = oldResolver().then(() => "unexpected-success", () => "rejected")
  await started.promise
  const connection = await context.integration.connection.active("openai")
  if (!connection || connection.type !== "credential") throw new Error("Connection is missing")
  expect(connection.id).toBe(saved.id)
  refreshToNew = true
  expect(await context.integration.connection.resolve(connection)).toMatchObject({ access: "new-access" })
  failed.resolve()
  expect(await oldRefresh).toBe("rejected")
  expect((await context.integration.get({ integrationID: "openai" })).data.connections.some((entry) => entry.status?.status === "needs_auth")).toBe(false)
  expect(await createOpenAICodexCredentialResolver(context)()).toMatchObject({ access: "new-access" })
})
