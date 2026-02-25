import type { ModelMessage } from "ai"
import { ProviderTransform } from "opencode/provider/transform"

const KIMI_REASONING_MODEL_MARKERS = ["k2p5", "kimi-k2.5", "kimi-k2p5"] as const
const DEFAULT_OUTPUT_TOKEN_FALLBACK = 32_000

export interface ProviderModelIdentity {
  providerID: string
  modelID: string
}

export interface AdapterInterleavedConfig {
  field?: string
}

export interface AdapterModelLimit {
  output?: number
}

export interface AdapterProviderModel {
  providerID?: string
  id?: string
  api: {
    npm?: string
    id: string
  }
  interleaved?: AdapterInterleavedConfig | boolean | null
  modalities?: {
    input: string[]
  }
  limit: AdapterModelLimit
}

export interface MaxOutputTokenOptions {
  model?: ProviderModelIdentity
  outputTokenCap?: number
  fallback?: number
  resolveModel(input: ProviderModelIdentity | undefined): Promise<AdapterProviderModel | undefined>
}

export interface ProviderOptionOptions {
  model: ProviderModelIdentity
  outputTokenCap?: number
  fallback?: number
}

function isKimiReasoningModel(modelID: string) {
  const lower = modelID.toLowerCase()
  return KIMI_REASONING_MODEL_MARKERS.some((marker) => lower.includes(marker))
}

function normalizeOutputTokenLimit(limit?: number, fallback = DEFAULT_OUTPUT_TOKEN_FALLBACK) {
  if (typeof limit === "number" && limit > 0) {
    return limit
  }
  return fallback
}

const openCodeProviderTransform = ProviderTransform

export namespace OpenCodeAdapterProviderTransform {
  export async function maxOutputTokens(options: MaxOutputTokenOptions) {
    const fallback = normalizeOutputTokenLimit(options.fallback)
    const cap = options.outputTokenCap

    const resolved = await options.resolveModel(options.model)
    const modelMax = resolved?.limit.output
    if (typeof modelMax === "number" && modelMax > 0) {
      if (typeof cap === "number" && cap > 0) return Math.min(modelMax, cap)
      return modelMax
    }

    if (typeof cap === "number" && cap > 0) return cap
    return fallback
  }

  export function providerOptions(options: ProviderOptionOptions): Record<string, unknown> | undefined {
    if (options.model.providerID !== "anthropic") return undefined
    if (!isKimiReasoningModel(options.model.modelID)) return undefined

    const fallback = normalizeOutputTokenLimit(options.outputTokenCap, options.fallback)
    return {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: Math.max(1, Math.min(16_000, Math.floor(fallback / 2 - 1))),
        },
      },
    }
  }

  export function message(messages: ModelMessage[], model?: AdapterProviderModel) {
    if (!model) return messages
    const inputModalities = model.modalities?.input ?? ["text"]
    const upstreamModel = {
      providerID: model.providerID ?? "anthropic",
      id: model.id ?? model.api.id,
      api: {
        id: model.api.id,
        npm: model.api.npm ?? "",
      },
      limit: {
        output: model.limit.output ?? DEFAULT_OUTPUT_TOKEN_FALLBACK,
      },
      capabilities: {
        interleaved:
          model.interleaved === true ? { field: "reasoning_content" as const } : (model.interleaved ?? undefined),
        input: {
          text: inputModalities.includes("text"),
          audio: inputModalities.includes("audio"),
          image: inputModalities.includes("image"),
          video: inputModalities.includes("video"),
          pdf: inputModalities.includes("pdf"),
        },
      },
    }

    return openCodeProviderTransform.message(messages, upstreamModel as any, {})
  }
}
