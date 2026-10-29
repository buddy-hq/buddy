import type { ProviderAuthResponse, ProviderListResponse } from "@buddy/sdk"
import { describe, expect, test } from "bun:test"
import {
  getUsableProviders,
  resolveAutoModelSelection,
  resolveUsableModelSelection,
} from "../src/lib/provider-catalog"
import { normalizeProviderCatalog } from "../src/state/chat-actions"
import type { ProviderInfo, ProviderModelInfo } from "../src/state/chat-types"

const BUNDLED_PROVIDER_ID = "hosted"

function createModel(providerID: string, modelID: string): ProviderModelInfo {
  return {
    id: modelID,
    providerID,
    name: modelID,
    family: "",
    free: false,
    status: "active",
    limit: {
      context: 200_000,
      output: 16_384,
    },
    variants: [],
    capabilities: {
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: true,
        video: false,
        pdf: true,
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
  }
}

function createProvider(input: {
  id: string
  bundled?: boolean
  connected?: boolean
  modelIDs: string[]
}): ProviderInfo {
  return {
    id: input.id,
    name: input.id,
    bundled: input.bundled ?? false,
    source: "custom",
    env: [],
    connected: input.connected ?? true,
    methods: [],
    models: input.modelIDs.map((modelID) => createModel(input.id, modelID)),
  }
}

function createRawProviderModel(input: {
  providerID: string
  id: string
  name?: string
  free?: boolean
  status?: "active" | "alpha" | "beta" | "deprecated"
}) {
  return {
    id: input.id,
    providerID: input.providerID,
    api: {
      id: "test-api",
      url: "https://example.com",
      npm: "test-provider",
    },
    name: input.name ?? input.id,
    family: "test-family",
    free: input.free ?? false,
    capabilities: {
      temperature: true,
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: true,
        video: false,
        pdf: true,
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
      input: 0,
      output: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
    limit: {
      context: 200_000,
      output: 16_384,
    },
    status: input.status ?? "active",
    options: {},
    headers: {},
    release_date: "2026-01-01",
    variants: {},
    enabled: true,
  }
}

function createRawProviderCatalog(): ProviderListResponse {
  return {
    all: [
      {
        id: BUNDLED_PROVIDER_ID,
        name: "Hosted",
        bundled: true,
        source: "custom",
        env: [],
        options: {},
        models: {
          paid: createRawProviderModel({
            providerID: BUNDLED_PROVIDER_ID,
            id: "paid",
            name: "Paid Model",
          }),
          freeZed: createRawProviderModel({
            providerID: BUNDLED_PROVIDER_ID,
            id: "free-zed",
            name: "Zed Free",
            free: true,
          }),
          freeAlpha: createRawProviderModel({
            providerID: BUNDLED_PROVIDER_ID,
            id: "free-alpha",
            name: "Alpha Free",
            free: true,
          }),
          deprecatedFree: createRawProviderModel({
            providerID: BUNDLED_PROVIDER_ID,
            id: "deprecated-free",
            name: "Deprecated Free",
            free: true,
            status: "deprecated",
          }),
        },
      },
    ],
    default: {
      [BUNDLED_PROVIDER_ID]: "paid",
    },
    connected: [],
  }
}

function createProviderAuthMethods(): ProviderAuthResponse {
  return {
    [BUNDLED_PROVIDER_ID]: [{ id: "hosted-oauth", type: "oauth", label: "Sign in" }],
  }
}

describe("resolveAutoModelSelection", () => {
  test("prefers a valid agent model before configured and recent defaults", () => {
    expect(
      resolveAutoModelSelection({
        providers: [
          createProvider({ id: "openai", modelIDs: ["gpt-5", "gpt-5-mini"] }),
          createProvider({ id: "anthropic", modelIDs: ["claude-sonnet-4"] }),
        ],
        providerDefault: { openai: "gpt-5", anthropic: "claude-sonnet-4" },
        agentModel: { providerID: "anthropic", modelID: "claude-sonnet-4" },
        configuredModel: { providerID: "openai", modelID: "gpt-5-mini" },
        recentModels: [{ providerID: "openai", modelID: "gpt-5" }],
      }),
    ).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-4" })
  })

  test("ignores an invalid agent model and falls back to configured defaults", () => {
    expect(
      resolveAutoModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"] })],
        providerDefault: { openai: "gpt-5" },
        agentModel: { providerID: "openai", modelID: "missing-model" },
        configuredModel: { providerID: "openai", modelID: "gpt-5" },
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("returns a valid configured model when it is connected", () => {
    expect(
      resolveAutoModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"] })],
        providerDefault: { openai: "gpt-5" },
        configuredModel: { providerID: "openai", modelID: "gpt-5" },
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("ignores an invalid configured model and falls back to the first connected default", () => {
    expect(
      resolveAutoModelSelection({
        providers: [
          createProvider({ id: "openai", modelIDs: ["gpt-5"] }),
          createProvider({ id: "anthropic", modelIDs: ["claude-sonnet-4"] }),
        ],
        providerDefault: { openai: "gpt-5", anthropic: "claude-sonnet-4" },
        configuredModel: { providerID: "openai", modelID: "missing-model" },
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("uses the most recent valid model before provider defaults", () => {
    expect(
      resolveAutoModelSelection({
        providers: [
          createProvider({ id: "openai", modelIDs: ["gpt-5"] }),
          createProvider({ id: "anthropic", modelIDs: ["claude-sonnet-4"] }),
        ],
        providerDefault: { openai: "gpt-5" },
        recentModels: [{ providerID: "anthropic", modelID: "claude-sonnet-4" }],
      }),
    ).toEqual({ providerID: "anthropic", modelID: "claude-sonnet-4" })
  })

  test("skips invalid recent models and continues to provider defaults", () => {
    expect(
      resolveAutoModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"] })],
        providerDefault: { openai: "gpt-5" },
        recentModels: [{ providerID: "anthropic", modelID: "claude-sonnet-4" }],
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("uses the anonymous bundled provider as an automatic fallback without marking it connected", () => {
    expect(
      resolveAutoModelSelection({
        providers: [
          createProvider({
            id: BUNDLED_PROVIDER_ID,
            bundled: true,
            connected: false,
            modelIDs: ["free-model"],
          }),
        ],
        providerDefault: { [BUNDLED_PROVIDER_ID]: "free-model" },
      }),
    ).toEqual({ providerID: BUNDLED_PROVIDER_ID, modelID: "free-model" })
  })

  test("prefers a connected provider before falling back to the anonymous bundled provider", () => {
    expect(
      resolveAutoModelSelection({
        providers: [
          createProvider({
            id: BUNDLED_PROVIDER_ID,
            bundled: true,
            connected: false,
            modelIDs: ["free-model"],
          }),
          createProvider({ id: "xai", modelIDs: ["grok"] }),
        ],
        providerDefault: {
          [BUNDLED_PROVIDER_ID]: "free-model",
          xai: "grok",
        },
      }),
    ).toEqual({ providerID: "xai", modelID: "grok" })
  })
})

describe("normalizeProviderCatalog", () => {
  test("keeps only free models of the anonymous bundled provider and rewrites the default", () => {
    const catalog = normalizeProviderCatalog(
      createRawProviderCatalog(),
      createProviderAuthMethods(),
    )

    expect(catalog.default[BUNDLED_PROVIDER_ID]).toBe("free-alpha")
    expect(catalog.providers).toHaveLength(1)
    expect(catalog.providers[0]?.connected).toBe(false)
    expect(catalog.providers[0]?.models.map((model) => model.id)).toEqual([
      "free-alpha",
      "free-zed",
    ])
    expect(getUsableProviders(catalog.providers).map((provider) => provider.id)).toEqual([
      BUNDLED_PROVIDER_ID,
    ])
  })

  test("does not treat the anonymous bundled runtime as credential-connected", () => {
    const providers = createRawProviderCatalog()
    const provider = providers.all[0]
    if (!provider) throw new Error("Expected a bundled provider fixture")

    delete provider.models.paid
    providers.connected = [BUNDLED_PROVIDER_ID]

    const catalog = normalizeProviderCatalog(providers, createProviderAuthMethods())

    expect(catalog.providers[0]?.connected).toBe(false)
    expect(catalog.providers[0]?.source).toBe("custom")
    expect(catalog.providers[0]?.models.map((model) => model.id)).toEqual([
      "free-alpha",
      "free-zed",
    ])
    expect(getUsableProviders(catalog.providers)).toHaveLength(1)
  })

  test("treats the bundled provider as connected when its credential-backed catalog includes paid models", () => {
    const providers = createRawProviderCatalog()
    providers.connected = [BUNDLED_PROVIDER_ID]

    const catalog = normalizeProviderCatalog(providers, createProviderAuthMethods())

    expect(catalog.providers[0]?.connected).toBe(true)
    expect(catalog.default[BUNDLED_PROVIDER_ID]).toBe("paid")
    expect(catalog.providers[0]?.models.map((model) => model.id)).toEqual([
      "free-alpha",
      "paid",
      "free-zed",
    ])
  })

  test("uses the resolved runtime model list without filtering it a second time", () => {
    const providers: ProviderListResponse = {
      all: [
        {
          id: "openai",
          name: "OpenAI",
          source: "custom",
          env: [],
          options: {},
          models: {
            "gpt-5.5": createRawProviderModel({
              providerID: "openai",
              id: "gpt-5.5",
            }),
            "gpt-5.4": createRawProviderModel({
              providerID: "openai",
              id: "gpt-5.4",
            }),
          },
        },
      ],
      default: { openai: "gpt-5.4" },
      connected: ["openai"],
    }

    const optimistic = normalizeProviderCatalog(providers, {}, { status: "loading" })
    expect(optimistic.providers[0]?.models.map((model) => model.id)).toEqual(["gpt-5.4", "gpt-5.5"])

    const resolved = normalizeProviderCatalog(
      providers,
      {},
      {
        status: "ready",
        modelIDs: ["gpt-5.5"],
        fetchedAt: "2026-06-10T12:00:00.000Z",
        refreshing: false,
      },
    )
    expect(resolved.providers[0]?.models.map((model) => model.id)).toEqual(["gpt-5.4", "gpt-5.5"])
    expect(resolved.default.openai).toBe("gpt-5.4")

    const openAIProvider = providers.all[0]
    if (!openAIProvider) throw new Error("Expected the OpenAI provider")
    openAIProvider.models = {
      "gpt-6-sol": createRawProviderModel({ providerID: "openai", id: "gpt-6-sol" }),
    }
    const updated = normalizeProviderCatalog(providers, {}, resolved.openAIModelAvailability)
    expect(updated.providers[0]?.models.map((model) => model.id)).toEqual(["gpt-6-sol"])
    expect(updated.default.openai).toBe("gpt-6-sol")
  })
})

describe("resolveUsableModelSelection", () => {
  test("returns selected model when provider and model are connected", () => {
    expect(
      resolveUsableModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"] })],
        selection: { providerID: "openai", modelID: "gpt-5" },
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("returns undefined when provider is disconnected", () => {
    expect(
      resolveUsableModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"], connected: false })],
        selection: { providerID: "openai", modelID: "gpt-5" },
      }),
    ).toBeUndefined()
  })

  test("returns an anonymous bundled model without treating the provider as connected", () => {
    expect(
      resolveUsableModelSelection({
        providers: [
          createProvider({
            id: BUNDLED_PROVIDER_ID,
            bundled: true,
            modelIDs: ["free-model"],
            connected: false,
          }),
        ],
        selection: { providerID: BUNDLED_PROVIDER_ID, modelID: "free-model" },
      }),
    ).toEqual({ providerID: BUNDLED_PROVIDER_ID, modelID: "free-model" })
  })

  test("returns undefined when model is missing from usable provider", () => {
    expect(
      resolveUsableModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"] })],
        selection: { providerID: "openai", modelID: "gpt-5-mini" },
      }),
    ).toBeUndefined()
  })
})
