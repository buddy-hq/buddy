import type { PluginContext } from "@buddy/opencode-adapter/plugin"
import type { OpenCodeTypes } from "@buddy/opencode-adapter/host"
import { Model, Provider } from "@buddy/opencode-adapter/gateway/provider"
import type { OpenAICodexAccountModel } from "./openai-codex-account"
import type { OpenAICodexStoredAuth } from "./openai-codex-credentials"

export function applyOpenAICodexAccountModels(models: ReadonlyMap<string, Model.Info>, accountModels: readonly OpenAICodexAccountModel[]): Model.Info[] {
  return accountModels.map((accountModel) => {
    const existing = models.get(accountModel.slug)
    const context = accountModel.context_window ?? accountModel.max_context_window
    const effectiveContext = context ? Math.floor(context * (accountModel.effective_context_window_percent ?? 100) / 100) : existing?.limit.context ?? 128_000
    return {
      ...existing,
      id: Model.ID.make(accountModel.slug), modelID: Model.ID.make(accountModel.slug), providerID: Provider.ID.make("openai"), name: accountModel.display_name ?? existing?.name ?? accountModel.slug,
      capabilities: { tools: existing?.capabilities.tools ?? true, input: accountModel.input_modalities ?? existing?.capabilities.input ?? ["text", "image"], output: existing?.capabilities.output ?? ["text"] },
      variants: accountModel.supported_reasoning_levels?.map(({ effort }) => ({ id: Model.VariantID.make(effort), settings: { reasoningEffort: effort } })) ?? existing?.variants ?? [],
      time: existing?.time ?? { released: 0 }, cost: [], status: "active", enabled: true,
      settings: { ...existing?.settings, include: ["reasoning.encrypted_content"], reasoningSummary: accountModel.supports_reasoning_summary_parameter === false ? null : "auto" },
      limit: { context: effectiveContext, input: effectiveContext, output: accountModel.max_output_tokens ?? existing?.limit.output ?? 32_000 },
    }
  })
}

export async function registerOpenAICodexModels(ctx: PluginContext, input: {
  resolveAuth: () => Promise<OpenAICodexStoredAuth | undefined>
  resolveModels: (signal: AbortSignal) => Promise<OpenAICodexAccountModel[] | undefined>
}) {
  let inventory: OpenAICodexAccountModel[] | undefined
  let connection: OpenCodeTypes.ConnectionInfo | undefined
  let pending: Promise<void> | undefined
  await ctx.provider.transform((editor) => {
    if (!inventory || !connection) return
    const provider = editor.get("openai")
    if (!provider) return
    editor.add({ info: provider.provider, models: applyOpenAICodexAccountModels(provider.models, inventory), sourceConnection: connection })
  })
  await ctx.model.transform((editor) => {
    if (!inventory || !connection) return
    const provider = editor.provider.get("openai")
    if (provider?.sourceConnection?.type !== "credential" || connection.type !== "credential" || provider.sourceConnection.id !== connection.id) return
    for (const model of applyOpenAICodexAccountModels(provider.models, inventory)) editor.update("openai", model.id, (draft) => {
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
