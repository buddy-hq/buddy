import { afterEach, expect, test } from "bun:test"
import { clearConfigOverlay, setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Provider } from "@buddy/opencode-adapter/provider"
import {
  ensureProviderServicePatched,
  registerProviderResolver,
} from "@buddy/opencode-adapter/provider-live"
import { tmpdir } from "../helpers/tmpdir"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

test("a refreshed provider list changes both picker inventory and runtime model lookup", async () => {
  await using project = await tmpdir({ git: true })
  setConfigOverlay(project.path, {
    model: "openai/gpt-5.6-sol",
    small_model: "openai/gpt-6-sol",
    provider: {
      openai: {
        npm: "@ai-sdk/openai",
        models: {
          "gpt-5.6-sol": {
            reasoning: true,
            tool_call: true,
            limit: { context: 400_000, input: 272_000, output: 128_000 },
          },
        },
      },
    },
  })
  await ensureProviderServicePatched()

  const initial = Provider.parseModel("openai/gpt-5.6-sol")
  const refreshed = Provider.parseModel("openai/gpt-6-sol")
  let accountModelID = initial.modelID
  const unregister = registerProviderResolver(initial.providerID, async ({ provider }) => {
    const base = provider.models[initial.modelID]
    if (!base) throw new Error("Expected a configured OpenAI model")
    return {
      ...provider,
      models: {
        [accountModelID]: {
          ...base,
          id: accountModelID,
          api: { ...base.api, id: accountModelID },
        },
      },
    }
  })

  try {
    await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () => {
        expect(Object.keys((await Provider.list())[initial.providerID]?.models ?? {})).toEqual([
          "gpt-5.6-sol",
        ])
        accountModelID = refreshed.modelID
        expect(Object.keys((await Provider.list())[initial.providerID]?.models ?? {})).toEqual([
          "gpt-6-sol",
        ])
        expect((await Provider.getModel(refreshed.providerID, refreshed.modelID)).api.id).toBe(
          "gpt-6-sol",
        )
        expect(await Provider.defaultModel()).toEqual({
          providerID: refreshed.providerID,
          modelID: refreshed.modelID,
        })
        expect((await Provider.getSmallModel(initial.providerID))?.id).toBe(refreshed.modelID)
        await expect(Provider.getModel(initial.providerID, initial.modelID)).rejects.toMatchObject({
          _tag: "ProviderModelNotFoundError",
        })
      },
    })
  } finally {
    unregister()
    clearConfigOverlay(project.path)
  }
})
