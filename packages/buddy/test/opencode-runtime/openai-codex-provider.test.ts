import { describe, expect, mock, test } from "bun:test"
import type { Model, Provider } from "@opencode-ai/sdk/v2"
import {
  applyOpenAICodexAccountModels,
  createOpenAICodexProviderHook,
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
  }
}

describe("OpenAI Codex provider model overlay", () => {
  test("replaces generic API limits with account-effective ChatGPT limits", () => {
    const provider = createProvider()
    const models = applyOpenAICodexAccountModels(provider.models, [createAccountModel()])

    expect(Object.keys(models)).toEqual([MODEL_ID, "api-only-model"])
    expect(models[MODEL_ID]?.limit).toEqual({
      context: 258_400,
      input: 258_400,
      output: 128_000,
    })
    expect(models[MODEL_ID]?.capabilities).toBe(provider.models[MODEL_ID]?.capabilities)
    expect(models["api-only-model"]).toBe(provider.models["api-only-model"])
  })

  test("keeps the generic model unchanged when its account context limit is unavailable", () => {
    const provider = createProvider()
    const models = applyOpenAICodexAccountModels(provider.models, [
      {
        slug: MODEL_ID,
        visibility: "list",
      },
    ])

    expect(models[MODEL_ID]).toBe(provider.models[MODEL_ID])
    expect(models["api-only-model"]).toBe(provider.models["api-only-model"])
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
