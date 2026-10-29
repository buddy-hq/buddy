import { createHash } from "node:crypto"
import z from "zod"
import type { ConnectionInfo } from "@opencode/client"
import { ChatGPTReconnectRequired, chatGPTIdentitySchema, chatGPTModelAvailabilitySchema, chatGPTUsageSchema, type ChatGPTAccountModel, type ChatGPTAuth } from "@buddy/agent-runtime/chatgpt"
import type { RuntimeExtension } from "@buddy/agent-runtime/extension"
import { Plugin, type PluginContext } from "../plugin"
import { resolveIntegrationCredential } from "../gateway/integration"
import { Model, Provider, registerProviderCatalog } from "../gateway/provider"

const OPENAI_PROVIDER_ID = "openai"
const CHATGPT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex"
const rejectedAccessTokenDigests = new Map<string, string>()

export async function returnChatGPTError<Output, Failure>(context: {
  readonly signal: AbortSignal
  readonly error: (type: "chatgpt.reconnect_required" | "chatgpt.request_failed", message: string, data: Record<string, never>) => Failure
}, handler: () => Promise<Output>): Promise<Output | Failure> {
  try {
    return await handler()
  } catch (error) {
    if (context.signal.aborted) throw error
    if (error instanceof ChatGPTReconnectRequired) return context.error("chatgpt.reconnect_required", error.message, {})
    return context.error("chatgpt.request_failed", error instanceof Error ? error.message : String(error), {})
  }
}

export async function keepChatGPTRequestOnCodex(event: { baseURL?: string }, isChatGPT: () => Promise<boolean>): Promise<void> {
  if (event.baseURL === undefined || event.baseURL === CHATGPT_CODEX_BASE_URL || URL.parse(event.baseURL)?.origin === "https://api.openai.com") return
  if (await isChatGPT().catch(() => true)) event.baseURL = CHATGPT_CODEX_BASE_URL
}

function createCredentialResolver(ctx: PluginContext) {
  return async (): Promise<ChatGPTAuth | undefined> => {
    const connection = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
    if (!connection || connection.type !== "credential" || connection.method !== "oauth") return undefined
    const integration = await ctx.integration.get({ integrationID: OPENAI_PROVIDER_ID })
    const needsAuth = integration.data.connections.some((entry) => entry.type === "credential" && entry.id === connection.id && entry.status?.status === "needs_auth")
    const rejectedAccessDigest = rejectedAccessTokenDigests.get(connection.id)
    if (needsAuth && rejectedAccessDigest === undefined) throw new ChatGPTReconnectRequired()
    let credential
    try { credential = await resolveIntegrationCredential(ctx, connection) } catch (error) {
      if (!(error instanceof Error && /Request failed: (400|401)/u.test(error.message))) {
        if (needsAuth) throw new ChatGPTReconnectRequired()
        throw error
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 500))
      const current = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
      if (current?.type !== "credential" || current.id !== connection.id) throw new ChatGPTReconnectRequired()
      try { credential = await resolveIntegrationCredential(ctx, current) } catch (retryError) {
        if (needsAuth || (retryError instanceof Error && /Request failed: (400|401)/u.test(retryError.message))) {
          throw new ChatGPTReconnectRequired()
        }
        throw retryError
      }
    }
    if (needsAuth) {
      if (credential?.type !== "oauth" || createHash("sha256").update(credential.access).digest("hex") === rejectedAccessDigest) throw new ChatGPTReconnectRequired()
      await ctx.integration.connection.status({ integrationID: OPENAI_PROVIDER_ID, connection, status: undefined })
      rejectedAccessTokenDigests.delete(connection.id)
    }
    if (credential?.type !== "oauth" || !["chatgpt-browser", "chatgpt-headless"].includes(credential.methodID)) return undefined
    const current = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
    if (current?.type !== "credential" || current.id !== connection.id) return undefined
    const accountID = z.string().safeParse(credential.metadata?.accountID)
    return { access: credential.access, refresh: credential.refresh, expires: credential.expires, accountId: accountID.success ? accountID.data : undefined, credentialID: connection.id }
  }
}

async function rejectCredentials(ctx: PluginContext, auth: ChatGPTAuth): Promise<void> {
  const connection = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
  if (connection?.type !== "credential" || connection.id !== auth.credentialID) return
  const credential = await resolveIntegrationCredential(ctx, connection).catch(() => undefined)
  if (credential?.type !== "oauth" || credential.access !== auth.access || credential.refresh !== auth.refresh || credential.expires !== auth.expires) return
  const active = await ctx.integration.connection.active(OPENAI_PROVIDER_ID)
  if (active?.type !== "credential" || active.id !== connection.id) return
  rejectedAccessTokenDigests.set(auth.credentialID, createHash("sha256").update(auth.access).digest("hex"))
  await ctx.integration.connection.status({ integrationID: OPENAI_PROVIDER_ID, connection: active, status: { status: "needs_auth", message: "Reconnect your ChatGPT account" } })
}

function applyAccountModels(models: ReadonlyMap<string, Model.Info>, accountModels: readonly ChatGPTAccountModel[]): Model.Info[] {
  return accountModels.map((accountModel) => {
    const existing = models.get(accountModel.id)
    const effectiveContext = accountModel.contextWindow ?? existing?.limit.context ?? 128_000
    return {
      ...existing,
      id: Model.ID.make(accountModel.id), modelID: Model.ID.make(accountModel.id), providerID: Provider.ID.make("openai"), name: accountModel.name ?? existing?.name ?? accountModel.id,
      capabilities: { tools: existing?.capabilities.tools ?? true, input: accountModel.inputModalities ? [...accountModel.inputModalities] : existing?.capabilities.input ?? ["text", "image"], output: existing?.capabilities.output ?? ["text"] },
      variants: accountModel.reasoningEfforts?.map((effort) => ({ id: Model.VariantID.make(effort), settings: { reasoningEffort: effort } })) ?? existing?.variants ?? [],
      time: existing?.time ?? { released: 0 }, cost: [], status: "active", enabled: true,
      settings: { ...existing?.settings, include: ["reasoning.encrypted_content"], reasoningSummary: accountModel.reasoningSummary === false ? null : "auto" },
      limit: { context: effectiveContext, input: effectiveContext, output: accountModel.maxOutputTokens ?? existing?.limit.output ?? 32_000 },
    }
  })
}

async function registerAccountModels(ctx: PluginContext, input: {
  resolveAuth: () => Promise<ChatGPTAuth | undefined>
  resolveModels: (signal: AbortSignal) => Promise<readonly ChatGPTAccountModel[] | undefined>
}) {
  let inventory: readonly ChatGPTAccountModel[] | undefined
  let connection: ConnectionInfo | undefined
  let pending: Promise<void> | undefined
  await ctx.provider.transform((editor) => {
    if (!inventory || !connection) return
    const provider = editor.get("openai")
    if (!provider) return
    editor.add({ info: provider.provider, models: applyAccountModels(provider.models, inventory), sourceConnection: connection })
  })
  await ctx.model.transform((editor) => {
    if (!inventory || !connection) return
    const provider = editor.provider.get("openai")
    if (provider?.sourceConnection?.type !== "credential" || connection.type !== "credential" || provider.sourceConnection.id !== connection.id) return
    for (const model of applyAccountModels(provider.models, inventory)) editor.update("openai", model.id, (draft) => {
      draft.enabled = true; draft.cost = []; draft.limit = { ...model.limit }; draft.capabilities = { tools: model.capabilities.tools, input: [...model.capabilities.input], output: [...model.capabilities.output] }; draft.variants = model.variants.map((variant) => ({ ...variant })); draft.settings = model.settings ? { ...model.settings } : undefined
    })
  })
  async function refresh() {
    const auth = await input.resolveAuth().catch(() => undefined)
    const active = await ctx.integration.connection.active("openai")
    if (!auth || active?.type !== "credential" || active.id !== auth.credentialID) {
      const changed = inventory !== undefined
      inventory = undefined; connection = undefined
      if (changed) { await ctx.provider.reload(); await ctx.model.reload() }
      return
    }
    const models = await input.resolveModels(AbortSignal.timeout(5_000))
    const current = await ctx.integration.connection.active("openai")
    if (current?.type !== "credential" || current.id !== active.id) return
    if (models === inventory && connection?.type === "credential" && connection.id === active.id) return
    inventory = models; connection = active
    await ctx.provider.reload(); await ctx.model.reload()
  }
  return async () => {
    if (pending) return pending
    pending = refresh()
    try { await pending } finally { pending = undefined }
  }
}

export function createChatGPTPlugin(createService: RuntimeExtension["chatgpt"]) {
  return Plugin.define({
    id: "buddy.codex",
    async setup(ctx) {
      const resolveAuth = createCredentialResolver(ctx)
      const onRejected = (auth: ChatGPTAuth) => rejectCredentials(ctx, auth)
      const service = createService(ctx.location, { resolve: resolveAuth, reject: onRejected })
      const syncModels = await registerAccountModels(ctx, { resolveAuth, resolveModels: (signal) => service.accountModels(signal) })
      await registerProviderCatalog(ctx, syncModels)
      await ctx.rpc.register({
        id: "buddy.codex", events: {}, methods: {
          identity: { input: z.object({}), output: chatGPTIdentitySchema, errors: { "chatgpt.reconnect_required": z.object({}), "chatgpt.request_failed": z.object({}) } },
          models: { input: z.object({ refresh: z.boolean() }), output: chatGPTModelAvailabilitySchema, errors: { "chatgpt.reconnect_required": z.object({}), "chatgpt.request_failed": z.object({}) } },
          usage: { input: z.object({ refresh: z.boolean() }), output: chatGPTUsageSchema, errors: { "chatgpt.reconnect_required": z.object({}), "chatgpt.request_failed": z.object({}) } },
          image: { input: z.object({ prompt: z.string(), imageDataUrls: z.array(z.string()) }), output: z.object({ base64: z.string(), operation: z.enum(["generate", "edit"]) }), errors: { "chatgpt.reconnect_required": z.object({}), "chatgpt.request_failed": z.object({}) } },
        },
      }, {
        identity: (_input, context) => returnChatGPTError(context, () => service.identity()),
        models: ({ refresh }, context) => returnChatGPTError(context, async () => {
          const result = await service.models({ refresh })
          await syncModels()
          return result
        }),
        usage: ({ refresh }, context) => returnChatGPTError(context, () => service.usage({ refresh })),
        image: (input, context) => returnChatGPTError(context, () => service.image({ ...input, signal: context.signal })),
      })
      await ctx.session.hook("model.request", (event) => keepChatGPTRequestOnCodex(event, () => resolveAuth().then((auth) => auth !== undefined, () => true)), { providerID: "openai" })
      await ctx.session.hook("retry", async (event) => {
        let usageLimit = false
        if (event.error.response?.body) {
          const result = z.object({ error: z.object({ code: z.string().optional(), type: z.string().optional() }) }).safeParse(await Promise.resolve().then(() => JSON.parse(event.error.response?.body ?? "{}")).catch(() => undefined))
          usageLimit = result.success && (result.data.error.code === "usage_limit_reached" || result.data.error.type === "usage_limit_reached")
        }
        if (usageLimit) event.decision = { retry: false }
      }, { providerID: "openai" })
      await ctx.session.hook("http.response", async (event) => {
        if (event.response.status !== 401) return
        const rejectedAccess = event.request.headers.get("authorization")?.replace(/^Bearer /iu, "")
        if (!rejectedAccess) return
        const auth = await resolveAuth().catch(() => undefined)
        if (auth?.access === rejectedAccess) await onRejected(auth)
      }, { providerID: "openai" })
      const controller = new AbortController()
      const events = (async () => {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type !== "credential.switched" || event.data.integrationID !== "openai") continue
          await service.credentialSwitched()
          await syncModels()
        }
      })().catch((error) => {
        if (!controller.signal.aborted) console.error("Buddy ChatGPT catalog subscription failed", error instanceof Error ? error.name : "UnknownError")
      })
      return async () => { controller.abort(); await events }
    },
  })
}
