import { expect, test } from "bun:test"
import { APICallError } from "ai"
import { Plugin, type PluginContext } from "@buddy/opencode-adapter/plugin"
import { Credential, Integration } from "@buddy/opencode-adapter/gateway/integration"
import { Model, Provider } from "@buddy/opencode-adapter/gateway/provider"
import { applyOpenAICodexAccountModels } from "../../src/opencode-runtime/plugins/openai-codex-provider"

test("account inventory restores gated models and supplies account limits and reasoning levels", () => {
  const existing = { ...Model.Info.default(Provider.ID.make("openai"), Model.ID.make("gpt-5.6")), enabled: false, limit: { context: 400_000, output: 32_000 } }
  const result = applyOpenAICodexAccountModels(new Map([["gpt-5.6", existing]]), [
    { slug: "gpt-5.6", visibility: "list", context_window: 200_000, effective_context_window_percent: 90, max_output_tokens: 16_000, input_modalities: ["text"], supported_reasoning_levels: [{ effort: "high" }, { effort: "max" }] },
    { slug: "gpt-new", visibility: "list", supports_reasoning_summary_parameter: false },
  ])
  expect(result[0]).toMatchObject({ enabled: true, cost: [], limit: { context: 180_000, input: 180_000, output: 16_000 }, capabilities: { input: ["text"] }, variants: [{ id: "high", settings: { reasoningEffort: "high" } }, { id: "max", settings: { reasoningEffort: "max" } }] })
  expect(result[1]).toMatchObject({ id: "gpt-new", enabled: true, settings: { reasoningSummary: null } })
})

test("live account models override v2 gating and the image RPC returns only the image", async () => {
  const { createV2TestHost } = await import("../helpers/v2-host")
  const { createOpenAICodexPlugin } = await import("../../src/opencode-runtime/plugins/openai-codex-auth")
  const { listProviderCatalog } = await import("@buddy/opencode-adapter/gateway/provider")
  await using runtime = await createV2TestHost()
  let rejectImages = false
  const requests: { path: string; authorization: string | null; accountID: string | null; body: string | undefined }[] = []
  await runtime.host.plugin(createOpenAICodexPlugin({ fetch: async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    requests.push({ path: url.pathname, authorization: headers.get("authorization"), accountID: headers.get("ChatGPT-Account-Id"), body: init?.body?.toString() })
    if (url.pathname.endsWith("/models")) return Response.json({ models: [{ slug: "gpt-5.6", visibility: "list", context_window: 200_000, effective_context_window_percent: 90, supported_reasoning_levels: [{ effort: "high" }] }] })
    if (url.pathname.endsWith("/images/generations")) return Response.json({ data: [{ b64_json: "QUJD" }] })
    if (url.pathname.endsWith("/images/edits")) return rejectImages ? Response.json({ error: "Expired token" }, { status: 401 }) : Response.json({ data: [{ b64_json: "RURJVA==" }] })
    if (url.pathname.endsWith("/userinfo")) return Response.json({ email: "student@example.test" })
    throw new Error(`Unexpected request: ${url.pathname}`)
  } }))
  await runtime.host.integration.list({ location: { directory: runtime.path } })
  await runtime.host.credential.create({ integrationID: "openai", value: { type: "oauth", methodID: "chatgpt-browser", access: "private-access", refresh: "private-refresh", expires: Date.now() + 3_600_000, metadata: { accountID: "account-test" } } })
  const catalog = await listProviderCatalog(runtime.host, runtime.path)
  expect(catalog.all.find((provider) => provider.id === "openai")?.models["gpt-5.6"]).toMatchObject({ enabled: true, limit: { context: 180_000, input: 180_000 }, variants: { high: {} } })
  const image = await runtime.host.rpc.call({ location: { directory: runtime.path }, rpcID: "buddy.codex", method: "image", input: { prompt: "A tree", imageDataUrls: [] } })
  expect(image.output).toEqual({ base64: "QUJD", operation: "generate" })
  const imageRequest = requests.find((entry) => entry.path.endsWith("/images/generations"))
  expect(imageRequest?.authorization).toBe("Bearer private-access")
  expect(imageRequest?.accountID).toBe("account-test")
  expect(imageRequest?.body).toContain('"model":"gpt-image-2"')
  const identity = await runtime.host.rpc.call({ location: { directory: runtime.path }, rpcID: "buddy.codex", method: "identity", input: {} })
  expect(identity.output).toEqual({ status: "ready", email: "student@example.test" })
  expect(JSON.stringify([catalog, image, identity])).not.toContain("private-access")
  expect(JSON.stringify([catalog, image, identity])).not.toContain("private-refresh")
  const edit = await runtime.host.rpc.call({ location: { directory: runtime.path }, rpcID: "buddy.codex", method: "image", input: { prompt: "Add leaves", imageDataUrls: ["data:image/png;base64,QUJD"] } })
  expect(edit.output).toEqual({ base64: "RURJVA==", operation: "edit" })
  expect(JSON.parse(requests.find((entry) => entry.path.endsWith("/images/edits"))?.body ?? "{}")).toMatchObject({ images: [{ image_url: "data:image/png;base64,QUJD" }] })
  rejectImages = true
  await expect(runtime.host.rpc.call({ location: { directory: runtime.path }, rpcID: "buddy.codex", method: "image", input: { prompt: "Add leaves", imageDataUrls: ["data:image/png;base64,QUJD"] } })).rejects.toThrow()
  const integration = await runtime.host.integration.get({ location: { directory: runtime.path }, integrationID: "openai" })
  expect(integration.data?.connections.some((connection) => connection.status?.status === "needs_auth")).toBe(true)
  const usage = await runtime.host.rpc.call({ location: { directory: runtime.path }, rpcID: "buddy.codex", method: "usage", input: { refresh: false } })
  expect(usage.output).toEqual({ status: "reconnect_required" })
})

test("token-sharing OAuth never authorizes the legacy Codex image endpoint", async () => {
  const { createV2TestHost } = await import("../helpers/v2-host")
  const { createOpenAICodexPlugin } = await import("../../src/opencode-runtime/plugins/openai-codex-auth")
  await using runtime = await createV2TestHost()
  let calls = 0
  await runtime.host.plugin(createOpenAICodexPlugin({ fetch: async () => { calls += 1; throw new Error("Unexpected legacy Codex request") } }))
  await runtime.host.integration.list({ location: { directory: runtime.path } })
  await runtime.host.credential.create({ integrationID: "openai", value: { type: "oauth", methodID: "chatgpt-token-sharing", access: "private-sharing-access", refresh: "private-refresh", expires: Date.now() + 3_600_000 } })
  await expect(runtime.host.rpc.call({ location: { directory: runtime.path }, rpcID: "buddy.codex", method: "image", input: { prompt: "A tree", imageDataUrls: [] } })).rejects.toThrow()
  expect(calls).toBe(0)
})

test("code-only usage limits stop retrying a real v2 session turn", async () => {
  const { createV2TestHost } = await import("../helpers/v2-host")
  const { createOpenAICodexPlugin } = await import("../../src/opencode-runtime/plugins/openai-codex-auth")
  await using runtime = await createV2TestHost()
  let calls = 0
  await runtime.host.plugin(createOpenAICodexPlugin({ fetch: async () => { throw new Error("Unexpected account request") } }))
  await runtime.host.plugin(Plugin.define({ id: "buddy.test.codex-quota", setup: async (ctx) => {
    await ctx.provider.transform((editor) => editor.add({ info: { ...Provider.Info.empty(Provider.ID.make("openai")), activation: "enabled", package: "aisdk:@ai-sdk/perplexity", settings: { apiKey: "fixture" } }, models: [Model.Info.default(Provider.ID.make("openai"), Model.ID.make("fixture"))] }))
    await ctx.session.hook("title", (event) => { event.result = "Quota fixture" })
    await ctx.aisdk.hook("language", (event) => {
      event.language = {
        specificationVersion: "v3", provider: "buddy-test", modelId: "fixture", supportedUrls: {},
        async doGenerate() { throw new Error("Unexpected generation") },
        async doStream() {
          calls += 1
          throw new APICallError({ message: "Request throttled", url: "https://example.test/responses", requestBodyValues: {}, statusCode: 429, responseBody: JSON.stringify({ error: { code: "usage_limit_reached" } }), isRetryable: true })
        },
      }
    }, { providerID: "openai" })
  } }))
  const session = await runtime.host.session.create({ location: { directory: runtime.path }, model: { providerID: "openai", id: "fixture" } })
  await runtime.host.session.prompt({ sessionID: session.id, text: "Exercise a quota failure" })
  await runtime.host.session.wait({ sessionID: session.id })
  expect(calls).toBe(1)
  const messages = await runtime.host.message.list({ sessionID: session.id })
  expect(messages.data.some((message) => message.type === "assistant" && message.error?.status === 429)).toBe(true)
})

for (const operation of ["image", "usage"] as const) {
  test(`a delayed ${operation} 401 preserves credentials refreshed natively under the same ID`, async () => {
    const { createV2TestHost } = await import("../helpers/v2-host")
    const { createOpenAICodexPlugin } = await import("../../src/opencode-runtime/plugins/openai-codex-auth")
    await using runtime = await createV2TestHost()
    let release: ((response: Response) => void) | undefined
    let started: (() => void) | undefined
    const pending = new Promise<Response>((resolve) => { release = resolve })
    const requested = new Promise<void>((resolve) => { started = resolve })
    let rejectOld = true
    let refreshToNew = false
    let context: PluginContext | undefined
    await runtime.host.plugin(createOpenAICodexPlugin({ fetch: async (input, init) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/models")) return Response.json({ models: [] })
      if (url.pathname.endsWith(operation === "image" ? "/images/generations" : "/usage") && rejectOld) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-A")
        started?.()
        return pending
      }
      if (url.pathname.endsWith("/usage")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-B")
        return Response.json({ plan_type: "plus" })
      }
      throw new Error(`Unexpected request ${url.pathname}`)
    } }))
    await runtime.host.plugin(Plugin.define({ id: "buddy.test.delayed-rejection", async setup(ctx) {
      context = ctx
      await ctx.integration.transform((editor) => editor.method.update({ integrationID: "openai", method: { id: "chatgpt-browser", type: "oauth", label: "Fixture refresh" }, authorize: async () => { throw new Error("Unexpected authorization") }, refresh: async (credential) => refreshToNew ? Credential.OAuth.make({ ...credential, access: "access-B", refresh: "refresh-B", expires: Number.MAX_SAFE_INTEGER }) : credential }))
    } }))
    await runtime.host.integration.list({ location: { directory: runtime.path } })
    const saved = await runtime.host.credential.create({ integrationID: "openai", value: { type: "oauth", methodID: Integration.MethodID.make("chatgpt-browser"), access: "access-A", refresh: "refresh-A", expires: 0 } })
    const request = runtime.host.rpc.call({ location: { directory: runtime.path }, rpcID: "buddy.codex", method: operation, input: operation === "image" ? { prompt: "A tree", imageDataUrls: [] } : { refresh: true } }).then((result) => ({ result }), (error) => ({ error }))
    await requested
    if (!context) throw new Error("Plugin did not activate")
    const connection = await context.integration.connection.active("openai")
    if (!connection || connection.type !== "credential") throw new Error("Connection is missing")
    expect(connection.id).toBe(saved.id)
    refreshToNew = true
    expect(await context.integration.connection.resolve(connection)).toMatchObject({ access: "access-B" })
    expect((await runtime.host.credential.list()).find((entry) => entry.id === saved.id)?.value).toMatchObject({ access: "access-B" })
    rejectOld = false
    if (!release) throw new Error("Pending request is missing")
    release(Response.json({ error: "old token rejected" }, { status: 401 }))
    await request
    const integration = await runtime.host.integration.get({ location: { directory: runtime.path }, integrationID: "openai" })
    expect(integration.data.connections.some((entry) => entry.status?.status === "needs_auth")).toBe(false)
    const usage = await runtime.host.rpc.call({ location: { directory: runtime.path }, rpcID: "buddy.codex", method: "usage", input: { refresh: true } })
    expect(usage.output).toMatchObject({ status: "ready", plan: "plus" })
  })
}
