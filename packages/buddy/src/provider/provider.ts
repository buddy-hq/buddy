import { sortBy } from "remeda"
import { Config } from "../config/config.js"
import { ModelsDev } from "./models.js"

type ModelLimit = {
  context: number
  input?: number
  output: number
}

export type ProviderModel = {
  providerID: string
  id: string
  name: string
  family?: string
  api: {
    id: string
    npm?: string
  }
  limit: ModelLimit
  modalities?: {
    input: string[]
    output: string[]
  }
  interleaved?:
    | true
    | {
        field: "reasoning_content" | "reasoning_details"
      }
  reasoning: boolean
  options: Record<string, unknown>
  variants?: Record<string, Record<string, unknown>>
}

export type ProviderInfo = {
  id: string
  name: string
  npm?: string
  api?: string
  env: string[]
  models: ProviderModel[]
}

const CONTEXT_LIMIT_FALLBACK = 128_000
const OUTPUT_LIMIT_FALLBACK = 32_000

function fromModelsDevModel(input: { providerID: string; modelID: string; model: ModelsDev.Model }): ProviderModel {
  const model = input.model
  return {
    providerID: input.providerID,
    id: input.modelID,
    name: model.name ?? input.modelID,
    family: model.family,
    api: {
      id: input.modelID,
      npm: model.provider?.npm,
    },
    limit: {
      context: model.limit.context,
      input: model.limit.input,
      output: model.limit.output,
    },
    modalities: model.modalities
      ? {
          input: model.modalities.input,
          output: model.modalities.output,
        }
      : undefined,
    interleaved: model.interleaved,
    reasoning: model.reasoning ?? false,
    options: model.options ?? {},
    variants: model.variants,
  }
}

function configuredProviderModels(config: Config.Info): Record<string, ProviderModel[]> {
  const result: Record<string, ProviderModel[]> = {}

  for (const [providerID, providerConfig] of Object.entries(config.provider ?? {})) {
    const models = Object.entries(providerConfig.models ?? {}).map(([modelID, options]) => ({
      providerID,
      id: modelID,
      name: modelID,
      api: {
        id: modelID,
      },
      limit: {
        context: CONTEXT_LIMIT_FALLBACK,
        output: OUTPUT_LIMIT_FALLBACK,
      },
      reasoning: false,
      options,
    }))

    if (models.length > 0) {
      result[providerID] = models
    }
  }

  return result
}

export namespace Provider {
  export async function list(): Promise<ProviderInfo[]> {
    const [catalog, config] = await Promise.all([ModelsDev.get(), Config.get()])
    const configured = configuredProviderModels(config)
    const providers = new Map<string, ProviderInfo>()

    for (const [providerID, provider] of Object.entries(catalog)) {
      providers.set(providerID, {
        id: providerID,
        name: provider.name,
        npm: provider.npm,
        api: provider.api,
        env: provider.env,
        models: sortBy(
          Object.entries(provider.models).map(([modelID, model]) => {
            return fromModelsDevModel({
              providerID,
              modelID,
              model,
            })
          }),
          (item) => item.id,
        ),
      })
    }

    for (const [providerID, models] of Object.entries(configured)) {
      const existing = providers.get(providerID)
      if (!existing) {
        providers.set(providerID, {
          id: providerID,
          name: providerID,
          env: [],
          models: sortBy(models, (item) => item.id),
        })
        continue
      }

      const byID = new Map(existing.models.map((item) => [item.id, item]))
      for (const model of models) {
        if (!byID.has(model.id)) byID.set(model.id, model)
      }
      existing.models = sortBy(Array.from(byID.values()), (item) => item.id)
    }

    return sortBy(Array.from(providers.values()), (item) => item.id)
  }

  export async function defaults() {
    const config = await Config.get()
    const providers = await list()
    const defaults: Record<string, string> = {}

    for (const provider of providers) {
      defaults[provider.id] = provider.models[0]?.id ?? ""
    }

    const model = config.model ?? ""
    const index = model.indexOf("/")
    if (index > 0 && index < model.length - 1) {
      defaults[model.slice(0, index)] = model.slice(index + 1)
    }

    return defaults
  }

  export async function findModel(input: { providerID?: string; modelID?: string }) {
    if (!input.providerID || !input.modelID) return undefined
    const providers = await list()
    const provider = providers.find((item) => item.id === input.providerID)
    if (!provider) return undefined
    return provider.models.find((item) => item.id === input.modelID)
  }

  export async function modelContextLimit(input: { providerID?: string; modelID?: string }) {
    const model = await findModel(input)
    return model?.limit.context ?? CONTEXT_LIMIT_FALLBACK
  }
}
