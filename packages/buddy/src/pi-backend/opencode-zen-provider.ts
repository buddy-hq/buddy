import type { ModelRegistry } from "@earendil-works/pi-coding-agent"
import fs from "node:fs"
import path from "node:path"
import { snapshot as openCodeModelsSnapshot } from "../../../../vendor/opencode/packages/core/src/models-snapshot.js"
import { Global } from "../storage/global"

const OPENCODE_PROVIDER_ID = "opencode" as const
const OPENAI_COMPLETIONS_API = "openai-completions" as const
const PUBLIC_API_KEY = "public" as const
const RECOMMENDED_OPENCODE_MODEL_ID = "ring-2.6-1t-free" as const
const DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
} as const
const DEFAULT_CONTEXT_WINDOW = 128_000
const DEFAULT_MAX_TOKENS = 16_384

type SnapshotCost = {
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
}

type SnapshotLimit = {
  context?: number
  output?: number
}

type SnapshotModalities = {
  input?: string[]
}

type SnapshotModel = {
  id?: string
  name?: string
  attachment?: boolean
  reasoning?: boolean
  status?: string
  cost?: SnapshotCost
  limit?: SnapshotLimit
  modalities?: SnapshotModalities
}

type SnapshotProvider = {
  id?: string
  name?: string
  api?: string
  models?: Record<string, SnapshotModel>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readSnapshotModel(value: unknown): SnapshotModel | undefined {
  if (!isRecord(value)) return undefined

  const id = typeof value.id === "string" ? value.id : undefined
  const name = typeof value.name === "string" ? value.name : undefined
  const attachment = typeof value.attachment === "boolean" ? value.attachment : undefined
  const reasoning = typeof value.reasoning === "boolean" ? value.reasoning : undefined
  const status = typeof value.status === "string" ? value.status : undefined

  const cost = isRecord(value.cost)
    ? {
        ...(typeof value.cost.input === "number" ? { input: value.cost.input } : {}),
        ...(typeof value.cost.output === "number" ? { output: value.cost.output } : {}),
        ...(typeof value.cost.cache_read === "number" ? { cache_read: value.cost.cache_read } : {}),
        ...(typeof value.cost.cache_write === "number"
          ? { cache_write: value.cost.cache_write }
          : {}),
      }
    : undefined

  const limit = isRecord(value.limit)
    ? {
        ...(typeof value.limit.context === "number" ? { context: value.limit.context } : {}),
        ...(typeof value.limit.output === "number" ? { output: value.limit.output } : {}),
      }
    : undefined

  const modalities =
    isRecord(value.modalities) && Array.isArray(value.modalities.input)
      ? {
          input: value.modalities.input.filter(
            (entry): entry is string => typeof entry === "string",
          ),
        }
      : undefined

  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(attachment !== undefined ? { attachment } : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(status ? { status } : {}),
    ...(cost && Object.keys(cost).length > 0 ? { cost } : {}),
    ...(limit && Object.keys(limit).length > 0 ? { limit } : {}),
    ...(modalities ? { modalities } : {}),
  }
}

function readSnapshotProvider(value: unknown): SnapshotProvider | undefined {
  if (!isRecord(value)) return undefined

  const id = typeof value.id === "string" ? value.id : undefined
  const name = typeof value.name === "string" ? value.name : undefined
  const api = typeof value.api === "string" ? value.api : undefined
  const models = isRecord(value.models)
    ? Object.fromEntries(
        Object.entries(value.models).flatMap(([key, model]) => {
          const parsed = readSnapshotModel(model)
          if (!parsed) return []
          return [[key, parsed] as const]
        }),
      )
    : undefined

  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(api ? { api } : {}),
    ...(models ? { models } : {}),
  }
}

function readOpenCodeSnapshotProvider() {
  const provider = readSnapshotProvider(openCodeModelsSnapshot[OPENCODE_PROVIDER_ID])
  if (!provider?.api || !provider.name || !provider.models) {
    throw new Error("OpenCode Zen provider snapshot is missing required metadata.")
  }
  return provider
}

function freeOpenCodeModels(provider: SnapshotProvider) {
  return Object.entries(provider.models ?? {})
    .flatMap(([modelID, model]) => {
      const inputCost = model.cost?.input
      if (inputCost !== 0) return []
      const input: Array<"text" | "image"> = model.modalities?.input?.includes("image")
        ? ["text", "image"]
        : ["text"]

      return [
        {
          id: model.id ?? modelID,
          name: model.name ?? modelID,
          api: OPENAI_COMPLETIONS_API,
          reasoning: model.reasoning === true,
          input,
          cost: {
            input: model.cost?.input ?? DEFAULT_COST.input,
            output: model.cost?.output ?? DEFAULT_COST.output,
            cacheRead: model.cost?.cache_read ?? DEFAULT_COST.cacheRead,
            cacheWrite: model.cost?.cache_write ?? DEFAULT_COST.cacheWrite,
          },
          contextWindow: model.limit?.context ?? DEFAULT_CONTEXT_WINDOW,
          maxTokens: model.limit?.output ?? DEFAULT_MAX_TOKENS,
        },
      ]
    })
    .toSorted((left, right) => left.name.localeCompare(right.name))
}

let activeOpenCodeProvider: SnapshotProvider | undefined

function getCacheFilePath(): string {
  return path.join(Global.Path.cache, "models.json")
}

function readProviderFromCacheOrSnapshot(): SnapshotProvider {
  const cachePath = getCacheFilePath()
  try {
    if (fs.existsSync(cachePath)) {
      const content = fs.readFileSync(cachePath, "utf8")
      const parsedRoot = JSON.parse(content)
      if (isRecord(parsedRoot)) {
        const providerData = parsedRoot[OPENCODE_PROVIDER_ID]
        const provider = readSnapshotProvider(providerData)
        if (provider?.api && provider.name && provider.models) {
          return provider
        }
      }
    }
  } catch {
    // Fall back to snapshot silently on read or parse failure
  }

  return readOpenCodeSnapshotProvider()
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function checkAndUpdateCacheInBackground(registry: ModelRegistry) {
  const cachePath = getCacheFilePath()
  let shouldUpdate = false

  try {
    if (!fs.existsSync(cachePath)) {
      shouldUpdate = true
    } else {
      const stat = fs.statSync(cachePath)
      const age = Date.now() - stat.mtimeMs
      if (age >= CACHE_TTL_MS) {
        shouldUpdate = true
      }
    }
  } catch {
    shouldUpdate = true
  }

  if (!shouldUpdate) {
    return
  }

  fetch("https://models.dev/api.json")
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`)
      }
      const text = await response.text()
      const parsedRoot = JSON.parse(text)
      if (!isRecord(parsedRoot)) {
        throw new Error("Invalid models JSON format")
      }
      const providerData = parsedRoot[OPENCODE_PROVIDER_ID]
      const provider = readSnapshotProvider(providerData)
      if (!provider?.api || !provider.name || !provider.models) {
        throw new Error("Parsed models lack required opencode provider metadata")
      }

      // Ensure directory exists and write to cache
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      fs.writeFileSync(cachePath, text, "utf8")

      // Update in-memory models and re-register
      activeOpenCodeProvider = provider
      const models = freeOpenCodeModels(provider)
      registry.registerProvider(OPENCODE_PROVIDER_ID, {
        name: provider.name,
        api: OPENAI_COMPLETIONS_API,
        baseUrl: provider.api,
        apiKey: PUBLIC_API_KEY,
        models,
      })
    })
    .catch((error) => {
      // Ignore background errors
      console.warn("Failed to update OpenCode models cache in background:", error)
    })
}

export function registerOpenCodeZenProvider(registry: ModelRegistry) {
  const provider = readProviderFromCacheOrSnapshot()
  activeOpenCodeProvider = provider
  const models = freeOpenCodeModels(provider)

  registry.registerProvider(OPENCODE_PROVIDER_ID, {
    name: provider.name,
    api: OPENAI_COMPLETIONS_API,
    baseUrl: provider.api,
    apiKey: PUBLIC_API_KEY,
    models,
  })

  // Trigger background check and async update
  checkAndUpdateCacheInBackground(registry)
}

export function getOpenCodeModelStatus(
  modelID: string,
): "alpha" | "beta" | "deprecated" | "active" {
  const provider = activeOpenCodeProvider ?? readProviderFromCacheOrSnapshot()
  if (!provider.models) return "active"
  const model = provider.models[modelID]
  if (!model) return "active"
  const status = model.status
  if (status === "alpha" || status === "beta" || status === "deprecated" || status === "active") {
    return status
  }
  return "active"
}

export { OPENCODE_PROVIDER_ID, RECOMMENDED_OPENCODE_MODEL_ID }
