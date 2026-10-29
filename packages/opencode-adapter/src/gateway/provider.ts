import z from "zod"
import { providerSchema, type providerListSchema, type providerModelSchema } from "@buddy/agent-runtime/providers"
import { Schema } from "effect"
import { Plugin, type PluginContext } from "../plugin"
import { Model } from "@opencode/schema/model"
export { Model } from "@opencode/schema/model"
export { Provider } from "@opencode/schema/provider"
import type { OpenCodeClient, ModelInfo, ProviderInfo, IntegrationInfo } from "@opencode/client"

const catalogSchema = z.object({ providers: z.array(providerSchema.extend({ integrationID: z.string().optional() })) })
export type ProviderCatalogClient = Pick<OpenCodeClient, "provider" | "model" | "integration" | "rpc">

function modalities(values: readonly string[]) {
  return { text: values.includes("text"), audio: values.includes("audio"), image: values.includes("image"), video: values.includes("video"), pdf: values.includes("pdf") }
}

function projectModel(model: ModelInfo | Model.Info): z.infer<typeof providerModelSchema> {
  const cost = model.cost.find((entry) => !entry.tier)
  const reasoning = model.variants.some((variant) => z.string().safeParse(variant.settings?.reasoningEffort).success) || /^(gpt-5|o\d)/u.test(model.modelID)
  return {
    id: model.id, providerID: model.providerID, api: { id: model.modelID, url: "", npm: model.package ?? "" }, name: model.name, family: model.family, free: (cost?.input ?? 0) === 0,
    capabilities: { temperature: !reasoning, reasoning, attachment: model.capabilities.input.some((value) => value !== "text"), toolcall: model.capabilities.tools, input: modalities(model.capabilities.input), output: modalities(model.capabilities.output), interleaved: model.compatibility?.reasoningField ? { field: model.compatibility.reasoningField } : false },
    cost: { input: cost?.input ?? 0, output: cost?.output ?? 0, cache: cost?.cache ?? { read: 0, write: 0 }, tiers: model.cost.flatMap((entry) => entry.tier ? [{ ...entry, tier: entry.tier }] : []) },
    limit: model.limit, status: model.status, options: {}, headers: {}, release_date: model.time.released > 0 ? new Date(model.time.released).toISOString().slice(0, 10) : "",
    variants: Object.fromEntries(model.variants.map((variant) => [variant.id, {}])), enabled: model.enabled,
  }
}

export async function registerProviderCatalog(ctx: PluginContext, prepare?: () => Promise<void>) {
  return ctx.rpc.register({ id: "buddy.providers", methods: { catalog: { input: z.object({}), output: catalogSchema }, integrations: { input: z.object({}), output: z.record(z.string(), z.string()) } }, events: {} }, {
    integrations: async () => {
      let mapping: Record<string, string> = {}
      const registration = await ctx.provider.transform((editor) => { mapping = Object.fromEntries(editor.list().map((record) => [record.provider.id, record.provider.integrationID ?? record.provider.id])) })
      try { await ctx.provider.list(); return mapping } finally { await registration.dispose() }
    },
    catalog: async () => {
      await prepare?.()
      let providers: z.infer<typeof catalogSchema>["providers"] = []
      const available = new Set((await ctx.provider.list()).data.map((provider) => provider.id))
      const registration = await ctx.model.transform((editor) => {
        providers = editor.provider.list().map((record) => ({
          id: record.provider.id, name: record.provider.name, integrationID: record.provider.integrationID, bundled: record.provider.id === "opencode",
          source: record.provider.activation === "enabled" ? "config" : "api", env: [], options: {},
          models: Object.fromEntries((available.has(record.provider.id) ? editor.list(record.provider.id) : Array.from(record.models.values())).map((model) => [model.id, projectModel(Schema.decodeUnknownSync(Model.Info)(JSON.parse(JSON.stringify(model))))])),
        }))
      })
      try { await ctx.model.list(); return catalogSchema.parse(JSON.parse(JSON.stringify({ providers }))) } finally { await registration.dispose() }
    },
  })
}

export function createProviderCatalogPlugin() {
  return Plugin.define({ id: "buddy.providers", setup: async (ctx) => { await registerProviderCatalog(ctx) } })
}

function sourceFor(provider: ProviderInfo | undefined, integration: IntegrationInfo | undefined): z.infer<typeof providerSchema>["source"] {
  if (integration?.connections.some((connection) => connection.type === "env")) return "env"
  if (provider?.activation === "enabled") return "config"
  return "api"
}

export async function readProviderIntegrations(client: Pick<ProviderCatalogClient, "rpc">, directory: string) {
  const result = await client.rpc.call({ location: { directory }, rpcID: "buddy.providers", method: "integrations", input: {} })
  return z.record(z.string(), z.string()).parse(result.output)
}

export async function readProviderDefinitions(client: Pick<ProviderCatalogClient, "rpc">, directory: string) {
  const result = await client.rpc.call({ location: { directory }, rpcID: "buddy.providers", method: "catalog", input: {} })
  return catalogSchema.parse(result.output).providers
}

export async function listProviderCatalog(client: ProviderCatalogClient, directory: string): Promise<z.infer<typeof providerListSchema>> {
  const location = { directory }
  const definitions = await readProviderDefinitions(client, directory)
  const [available, models, integrations, selected] = await Promise.all([
    client.provider.list({ location }), client.model.list({ location }), client.integration.list({ location }), client.model.default({ location }),
  ])
  const all = definitions.map((definition) => {
    const provider = available.data.find((entry) => entry.id === definition.id)
    const integration = integrations.data.find((entry) => entry.id === (definition.integrationID ?? definition.id))
    const providerModels = Object.fromEntries(provider ? [] : Object.entries(definition.models))
    for (const model of models.data.filter((entry) => entry.providerID === definition.id)) providerModels[model.id] = projectModel(model)
    const env = integration?.methods.flatMap((method) => method.type === "env" ? method.names : []) ?? []
    return { id: definition.id, name: definition.name, bundled: definition.id === "opencode", source: sourceFor(provider, integration), env, options: {}, models: providerModels }
  })
  const defaults: Record<string, string> = {}
  for (const provider of all) {
    const candidates = Object.values(provider.models).filter((model) => model.enabled && model.status !== "deprecated")
    const preferred = selected.data?.providerID === provider.id ? candidates.find((model) => model.id === selected.data?.id) : undefined
    const fallback = preferred ?? candidates.toSorted((left, right) => right.release_date.localeCompare(left.release_date))[0]
    if (fallback) defaults[provider.id] = fallback.id
  }
  return { all, default: defaults, connected: available.data.map((provider) => provider.id) }
}
