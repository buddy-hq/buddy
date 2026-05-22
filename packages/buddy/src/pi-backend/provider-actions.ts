import type { Context } from "hono"
import {
  buddyProviderIDFromPi,
  BUDDY_OPENAI_PROVIDER_ID,
  PI_CODEX_PROVIDER_ID,
  piProviderCandidatesFromBuddy,
} from "./provider-aliases"
import {
  OPENCODE_PROVIDER_ID,
  RECOMMENDED_OPENCODE_MODEL_ID,
  getOpenCodeModelStatus,
} from "./opencode-zen-provider"
import { piRuntime } from "./runtime"
import type { PiModel } from "./types"

const API_AUTH_LABEL = "API key"
const OAUTH_AUTH_LABEL_SUFFIX = " OAuth"
const ACTIVE_MODEL_STATUS = "active"
const DEFAULT_RELEASE_DATE = "2026-01-01"
const PROVIDER_SOURCE_API = "api"
const PROVIDER_SOURCE_ENV = "env"
const PROVIDER_SOURCE_CUSTOM = "custom"
const PI_AUTH_SOURCE_STORED = "stored"
const PI_AUTH_SOURCE_ENVIRONMENT = "environment"
const THINKING_LEVEL_OFF = "off"
const THINKING_LEVEL_MINIMAL = "minimal"
const THINKING_LEVEL_LOW = "low"
const THINKING_LEVEL_MEDIUM = "medium"
const THINKING_LEVEL_HIGH = "high"
const THINKING_LEVEL_XHIGH = "xhigh"
const PI_THINKING_LEVELS = [
  THINKING_LEVEL_OFF,
  THINKING_LEVEL_MINIMAL,
  THINKING_LEVEL_LOW,
  THINKING_LEVEL_MEDIUM,
  THINKING_LEVEL_HIGH,
  THINKING_LEVEL_XHIGH,
] as const

type PiProviderSource =
  | typeof PROVIDER_SOURCE_API
  | typeof PROVIDER_SOURCE_ENV
  | typeof PROVIDER_SOURCE_CUSTOM

type ProviderAuthPresentation = {
  connected: boolean
  source: PiProviderSource
  env: string[]
}

function providerAuthPresentation(providerID: string): ProviderAuthPresentation {
  const authStorage = piRuntime.getAuthStorage()

  for (const piProviderID of piProviderCandidatesFromBuddy(providerID)) {
    if (authStorage.has(piProviderID)) {
      return {
        connected: true,
        source: PROVIDER_SOURCE_API,
        env: [],
      }
    }
  }

  for (const piProviderID of piProviderCandidatesFromBuddy(providerID)) {
    const authStatus = authStorage.getAuthStatus(piProviderID)
    if (authStatus.source === PI_AUTH_SOURCE_ENVIRONMENT) {
      return {
        connected: true,
        source: PROVIDER_SOURCE_ENV,
        env: authStatus.label ? [authStatus.label] : [],
      }
    }
    if (authStatus.source === PI_AUTH_SOURCE_STORED) {
      return {
        connected: true,
        source: PROVIDER_SOURCE_API,
        env: [],
      }
    }
  }

  return {
    connected: false,
    source: PROVIDER_SOURCE_CUSTOM,
    env: [],
  }
}

function piProviderIDForDisplay(providerID: string) {
  if (providerID === BUDDY_OPENAI_PROVIDER_ID) return PI_CODEX_PROVIDER_ID
  return providerID
}

function providerDisplayName(providerID: string) {
  return piRuntime.getModelRegistry().getProviderDisplayName(piProviderIDForDisplay(providerID))
}

function supportsImage(input: readonly string[]) {
  return input.includes("image")
}

function preferredDefaultModelID(providerID: string, models: readonly PiModel[]) {
  if (providerID === OPENCODE_PROVIDER_ID) {
    const recommended = models.find((model) => model.id === RECOMMENDED_OPENCODE_MODEL_ID)
    if (recommended) return recommended.id
  }

  return models[0]?.id
}

function modelThinkingVariants(model: PiModel): Record<string, Record<string, unknown>> {
  if (!model.reasoning) return {}

  return Object.fromEntries(
    PI_THINKING_LEVELS.filter((level) => {
      const mapped = model.thinkingLevelMap?.[level]
      if (mapped === null) return false
      if (level === THINKING_LEVEL_XHIGH) return mapped !== undefined
      return true
    }).map((level) => [level, {}]),
  )
}

function providerDefaultSource(providerID: string): PiProviderSource {
  const registry = piRuntime.getModelRegistry()
  const authStatus = registry.getProviderAuthStatus(piProviderIDForDisplay(providerID))
  if (authStatus.source === PI_AUTH_SOURCE_ENVIRONMENT) return PROVIDER_SOURCE_ENV
  if (authStatus.source === PI_AUTH_SOURCE_STORED) return PROVIDER_SOURCE_API
  return PROVIDER_SOURCE_API
}

export async function readPiProviderCatalog() {
  const registry = piRuntime.getModelRegistry()
  const modelsByProvider = new Map<string, ReturnType<typeof registry.getAll>>()
  const connected: string[] = []
  const defaults: Record<string, string> = {}

  for (const model of registry.getAll()) {
    const providerID = buddyProviderIDFromPi(model.provider)
    if (providerID === BUDDY_OPENAI_PROVIDER_ID && model.provider !== PI_CODEX_PROVIDER_ID) {
      continue
    }
    const current = modelsByProvider.get(providerID) ?? []
    current.push(model)
    modelsByProvider.set(providerID, current)
  }

  const all = [...modelsByProvider.entries()]
    .map(([providerID, models]) => {
      const auth = providerAuthPresentation(providerID)
      if (auth.connected) {
        connected.push(providerID)
      }

      const sortedModels = models.toSorted((left, right) => left.name.localeCompare(right.name))
      const defaultModelID = preferredDefaultModelID(providerID, sortedModels)
      if (defaultModelID) {
        defaults[providerID] = defaultModelID
      }

      return {
        id: providerID,
        name: providerDisplayName(providerID),
        source: auth.connected ? auth.source : providerDefaultSource(providerID),
        env: auth.env,
        options: {},
        models: Object.fromEntries(
          sortedModels.map((model) => [
            model.id,
            {
              id: model.id,
              providerID,
              api: {
                id: model.api,
                url: model.baseUrl,
                npm: model.api,
              },
              name: model.name,
              family: model.name,
              capabilities: {
                temperature: true,
                reasoning: model.reasoning,
                attachment: supportsImage(model.input),
                toolcall: true,
                input: {
                  text: true,
                  audio: false,
                  image: supportsImage(model.input),
                  video: false,
                  pdf: false,
                },
                output: {
                  text: true,
                  audio: false,
                  image: false,
                  video: false,
                  pdf: false,
                },
                interleaved: false,
              },
              cost: {
                input: model.cost.input,
                output: model.cost.output,
                cache: {
                  read: model.cost.cacheRead,
                  write: model.cost.cacheWrite,
                },
              },
              limit: {
                context: model.contextWindow,
                input: model.contextWindow,
                output: model.maxTokens,
              },
              status:
                providerID === OPENCODE_PROVIDER_ID
                  ? getOpenCodeModelStatus(model.id)
                  : ACTIVE_MODEL_STATUS,
              options: {},
              headers: model.headers ?? {},
              release_date: DEFAULT_RELEASE_DATE,
              variants: modelThinkingVariants(model),
            },
          ]),
        ),
      }
    })
    .toSorted((left, right) => left.name.localeCompare(right.name))

  return {
    all,
    default: defaults,
    connected,
  }
}

export async function piListProviders(c: Context): Promise<Response> {
  return c.json(await readPiProviderCatalog())
}

export async function piProviderAuthMethods(c: Context): Promise<Response> {
  const registry = piRuntime.getModelRegistry()
  const methods: Record<string, Array<{ type: "api" | "oauth"; label: string }>> = {}
  const oauthProviderIDs = new Map(
    piRuntime
      .getAuthStorage()
      .getOAuthProviders()
      .map((provider) => [provider.id, provider.name]),
  )

  for (const model of registry.getAll()) {
    const providerID = buddyProviderIDFromPi(model.provider)
    if (providerID === BUDDY_OPENAI_PROVIDER_ID && model.provider !== PI_CODEX_PROVIDER_ID) {
      continue
    }
    const current = methods[providerID] ?? []
    if (!current.some((method) => method.type === "api")) {
      current.push({ type: "api", label: API_AUTH_LABEL })
    }
    const oauthName = oauthProviderIDs.get(model.provider)
    if (oauthName && !current.some((method) => method.type === "oauth")) {
      current.push({ type: "oauth", label: `${oauthName}${OAUTH_AUTH_LABEL_SUFFIX}` })
    }
    methods[providerID] = current
  }

  return c.json(methods)
}
