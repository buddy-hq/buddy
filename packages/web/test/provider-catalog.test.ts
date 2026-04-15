import { describe, expect, test } from "bun:test"
import {
  resolveAutoModelSelection,
  resolveConnectedModelSelection,
} from "../src/lib/provider-catalog"
import type { ProviderInfo, ProviderModelInfo } from "../src/state/chat-types"

function createModel(providerID: string, modelID: string): ProviderModelInfo {
  return {
    id: modelID,
    providerID,
    name: modelID,
    family: "",
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
  connected?: boolean
  modelIDs: string[]
}): ProviderInfo {
  return {
    id: input.id,
    name: input.id,
    source: "custom",
    env: [],
    connected: input.connected ?? true,
    methods: [],
    models: input.modelIDs.map((modelID) => createModel(input.id, modelID)),
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
})

describe("resolveConnectedModelSelection", () => {
  test("returns selected model when provider and model are connected", () => {
    expect(
      resolveConnectedModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"] })],
        selection: { providerID: "openai", modelID: "gpt-5" },
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5" })
  })

  test("returns undefined when provider is disconnected", () => {
    expect(
      resolveConnectedModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"], connected: false })],
        selection: { providerID: "openai", modelID: "gpt-5" },
      }),
    ).toBeUndefined()
  })

  test("returns undefined when model is missing from connected provider", () => {
    expect(
      resolveConnectedModelSelection({
        providers: [createProvider({ id: "openai", modelIDs: ["gpt-5"] })],
        selection: { providerID: "openai", modelID: "gpt-5-mini" },
      }),
    ).toBeUndefined()
  })
})
