import { describe, expect, mock, test } from "bun:test"
import { Schema } from "effect"
import type { Model, Provider } from "@opencode-ai/sdk/v2"
import { Provider as RuntimeProvider } from "@buddy/opencode-adapter/provider"
import {
  applyOpenAICodexAccountModels,
  createOpenAICodexProviderHook,
  resolveOpenAICodexModelVariants,
} from "../../src/opencode-runtime/plugins/openai-codex-provider"
import type { OpenAICodexAccountModel } from "../../src/opencode-runtime/plugins/openai-codex-account"

const DIRECTORY = "/tmp/buddy-openai-provider-test"
const MODEL_ID = "gpt-5.6-terra"
const TEST_MODEL_CATALOG_RESOLUTION_TIMEOUT_MS = 5

function createModel(id = MODEL_ID): Model {
  return {
    id,
    providerID: "openai",
    api: {
      id,
      url: "https://api.openai.com/v1",
      npm: "@ai-sdk/openai",
    },
    name: id,
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
      cache: { read: 0, write: 0 },
    },
    limit: {
      context: 1_050_000,
      input: 922_000,
      output: 128_000,
    },
    status: "active",
    options: {},
    headers: {},
    release_date: "2026-01-01",
  }
}

function createProvider(): Provider {
  const model = createModel()
  return {
    id: "openai",
    name: "OpenAI",
    source: "api",
    env: ["OPENAI_API_KEY"],
    options: {},
    models: {
      [model.id]: model,
      "api-only-model": createModel("api-only-model"),
    },
  }
}

function createAccountModel(): OpenAICodexAccountModel {
  return {
    slug: MODEL_ID,
    visibility: "list",
    context_window: 272_000,
    max_context_window: 272_000,
    effective_context_window_percent: 95,
    supported_reasoning_levels: [
      { effort: "low" },
      { effort: "medium" },
      { effort: "high" },
      { effort: "xhigh" },
      { effort: "max" },
      { effort: "ultra" },
    ],
  }
}

describe("OpenAI Codex provider model overlay", () => {
  test("uses account-supported reasoning levels and excludes unsupported OpenCode levels", () => {
    expect(resolveOpenAICodexModelVariants(createAccountModel())).toEqual({
      low: { reasoningEffort: "low" },
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
      xhigh: { reasoningEffort: "xhigh" },
      max: { reasoningEffort: "max" },
    })
  })

  test("replaces generic API limits with account-effective ChatGPT limits", () => {
    const provider = createProvider()
    const models = applyOpenAICodexAccountModels(provider.models, [createAccountModel()])

    expect(Object.keys(models)).toEqual([MODEL_ID])
    expect(models[MODEL_ID]?.limit).toEqual({
      context: 258_400,
      input: 258_400,
      output: 128_000,
    })
    expect(models[MODEL_ID]?.variants).toEqual({
      low: { reasoningEffort: "low" },
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
      xhigh: { reasoningEffort: "xhigh" },
      max: { reasoningEffort: "max" },
    })
    expect(models[MODEL_ID]?.capabilities.input).toEqual({
      text: true,
      audio: false,
      image: true,
      video: false,
      pdf: false,
    })
    expect(models["api-only-model"]).toBeUndefined()
  })

  test("keeps the generic model limits while enabling stateless reasoning", () => {
    const provider = createProvider()
    const models = applyOpenAICodexAccountModels(provider.models, [
      {
        slug: MODEL_ID,
        visibility: "list",
      },
    ])

    expect(models[MODEL_ID]).toEqual({
      ...provider.models[MODEL_ID],
      capabilities: {
        ...provider.models[MODEL_ID]?.capabilities,
        input: { text: true, audio: false, image: true, video: false, pdf: false },
      },
      options: {
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    })
    expect(models["api-only-model"]).toBeUndefined()
  })

  test("creates a usable account model when the runtime catalog has not listed it yet", () => {
    const provider = createProvider()
    const models = applyOpenAICodexAccountModels(provider.models, [
      {
        slug: "gpt-6-sol",
        display_name: "GPT-6 Sol",
        visibility: "list",
        context_window: 400_000,
        max_output_tokens: 128_000,
        input_modalities: ["text", "image"],
        supported_reasoning_levels: [{ effort: "none" }, { effort: "high" }],
      },
    ])

    expect(Object.keys(models)).toEqual(["gpt-6-sol"])
    expect(models["gpt-6-sol"]).toMatchObject({
      id: "gpt-6-sol",
      name: "GPT-6 Sol",
      api: { id: "gpt-6-sol", npm: "@ai-sdk/openai" },
      limit: { context: 400_000, input: 400_000, output: 128_000 },
      capabilities: {
        attachment: true,
        input: { text: true, image: true, pdf: false },
      },
      options: {
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
      variants: {
        none: { reasoningEffort: "none" },
        high: { reasoningEffort: "high" },
      },
    })
    try {
      Schema.decodeUnknownSync(RuntimeProvider.Info)({ ...provider, models })
    } catch (error) {
      throw new Error(String(error), { cause: error })
    }
  })

  test("does not claim attachments that a new account model cannot accept", () => {
    const models = applyOpenAICodexAccountModels(createProvider().models, [
      {
        slug: "gpt-6-luna",
        visibility: "list",
        input_modalities: ["text"],
        supports_reasoning_summary_parameter: false,
      },
    ])

    expect(models["gpt-6-luna"]?.capabilities.attachment).toBe(false)
    expect(models["gpt-6-luna"]?.capabilities.input).toEqual({
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    })
    expect(models["gpt-6-luna"]?.options).toEqual({
      include: ["reasoning.encrypted_content"],
      reasoningSummary: null,
    })
  })

  test("uses account attachment limits for a model already in the generic catalog", () => {
    const provider = createProvider()
    const models = applyOpenAICodexAccountModels(provider.models, [
      {
        slug: MODEL_ID,
        visibility: "list",
        input_modalities: ["text"],
        supports_reasoning_summary_parameter: false,
      },
    ])

    expect(models[MODEL_ID]?.capabilities.attachment).toBe(false)
    expect(models[MODEL_ID]?.capabilities.input).toEqual({
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    })
    expect(models[MODEL_ID]?.options).toEqual({
      include: ["reasoning.encrypted_content"],
      reasoningSummary: null,
    })
  })

  test("formats a new model slug when the account omits its display name", () => {
    const models = applyOpenAICodexAccountModels(createProvider().models, [
      { slug: "gpt-6-luna", visibility: "list" },
    ])

    expect(models["gpt-6-luna"]?.name).toBe("GPT-6 Luna")
  })

  test("uses the maximum account context when the current context is omitted", () => {
    const provider = createProvider()
    const models = applyOpenAICodexAccountModels(provider.models, [
      {
        slug: MODEL_ID,
        visibility: "list",
        max_context_window: 300_000,
      },
    ])

    expect(models[MODEL_ID]?.limit).toEqual({
      context: 300_000,
      input: 300_000,
      output: 128_000,
    })
  })

  test("uses account models only for an OAuth-backed OpenAI provider", async () => {
    const provider = createProvider()
    const resolveModelCatalog = mock(async () => [createAccountModel()])
    const hook = createOpenAICodexProviderHook({
      directory: DIRECTORY,
      accountService: { resolveModelCatalog },
    })
    if (!hook.models) throw new Error("OpenAI provider hook did not expose a model resolver")

    const oauthModels = await hook.models(provider, {
      auth: {
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: Date.now() + 60_000,
        accountId: "account-123",
      },
    })
    expect(oauthModels[MODEL_ID]?.limit).toMatchObject({
      context: 258_400,
      input: 258_400,
    })
    expect(resolveModelCatalog).toHaveBeenCalledTimes(1)

    const apiModels = await hook.models(provider, {
      auth: { type: "api", key: "api-key" },
    })
    expect(apiModels).toBe(provider.models)
    expect(resolveModelCatalog).toHaveBeenCalledTimes(1)
  })

  test("falls back to generic provider models when account metadata cannot be loaded", async () => {
    const provider = createProvider()
    const hook = createOpenAICodexProviderHook({
      directory: DIRECTORY,
      accountService: {
        resolveModelCatalog: async () => undefined,
      },
    })
    if (!hook.models) throw new Error("OpenAI provider hook did not expose a model resolver")

    const models = await hook.models(provider, {
      auth: {
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: Date.now() + 60_000,
      },
    })

    expect(models).toBe(provider.models)
  })

  test("falls back to generic provider models when account metadata loading rejects", async () => {
    const provider = createProvider()
    const hook = createOpenAICodexProviderHook({
      directory: DIRECTORY,
      accountService: {
        resolveModelCatalog: async () => {
          throw new Error("account endpoint failed")
        },
      },
    })
    if (!hook.models) throw new Error("OpenAI provider hook did not expose a model resolver")

    const models = await hook.models(provider, {
      auth: {
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: Date.now() + 60_000,
      },
    })

    expect(models).toBe(provider.models)
  })

  test("bounds account metadata loading and aborts a hung catalog request", async () => {
    const provider = createProvider()
    let requestAborted = false
    const hook = createOpenAICodexProviderHook({
      directory: DIRECTORY,
      modelCatalogResolutionTimeoutMs: TEST_MODEL_CATALOG_RESOLUTION_TIMEOUT_MS,
      accountService: {
        resolveModelCatalog: async (_directory, signal) =>
          await new Promise<undefined>((resolve) => {
            signal?.addEventListener(
              "abort",
              () => {
                requestAborted = true
                resolve(undefined)
              },
              { once: true },
            )
          }),
      },
    })
    if (!hook.models) throw new Error("OpenAI provider hook did not expose a model resolver")

    const models = await hook.models(provider, {
      auth: {
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: Date.now() + 60_000,
      },
    })

    expect(models).toBe(provider.models)
    expect(requestAborted).toBe(true)
  })
})
