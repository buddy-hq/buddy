import { createOpenCodeRuntime } from "@buddy/opencode-adapter/runtime"
import { expect, test } from "bun:test"
import { Plugin, type PluginContext } from "@buddy/opencode-adapter/plugin"
import {
  Model,
  Provider,
  createProviderCatalogPlugin,
  listProviderCatalog,
  readProviderDefinitions,
} from "@buddy/opencode-adapter/gateway/provider"
import { createNotebookTestHost } from "../helpers/opencode"
import { createGitRepo } from "../helpers/repo"
import { writeProjectConfig } from "../helpers/project-config"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"
import { createV2TestHost } from "../helpers/v2-host"

test("catalog includes disconnected providers, disabled models, defaults and no secrets", async () => {
  await using runtime = await createV2TestHost()
  await runtime.host.plugin(
    Plugin.define({
      id: "buddy.test.catalog",
      setup: async (ctx) => {
        await ctx.provider.transform((editor) => {
          editor.add({
            info: {
              id: Provider.ID.make("fixture"),
              name: "Fixture",
              activation: "enabled",
              package: "@ai-sdk/openai",
              settings: { apiKey: "secret-setting" },
              headers: { Authorization: "secret-header" },
            },
            models: [
              {
                ...Model.Info.default(Provider.ID.make("fixture"), Model.ID.make("enabled")),
                time: { released: 1 },
              },
              {
                ...Model.Info.default(Provider.ID.make("fixture"), Model.ID.make("disabled")),
                enabled: false,
              },
            ],
          })
        })
        await ctx.model.transform((editor) => {
          editor.default.set("fixture", "enabled")
        })
      },
    }),
  )
  await runtime.host.plugin(createProviderCatalogPlugin())
  const catalog = await listProviderCatalog(runtime.host, runtime.path)
  const provider = catalog.all.find((entry) => entry.id === "fixture")
  expect(provider?.models.enabled?.id).toBe("enabled")
  expect(provider?.models.disabled).toBeUndefined()
  const fullCatalog = await runtime.host.rpc.call({
    location: { directory: runtime.path },
    rpcID: "buddy.providers",
    method: "catalog",
    input: {},
  })
  expect(JSON.stringify(fullCatalog.output)).toContain('"enabled":false')
  expect(catalog.default.fixture).toBe("enabled")
  expect(catalog.connected).toContain("fixture")
  expect(catalog.all.some((entry) => entry.id === "anthropic")).toBe(true)
  expect(catalog.connected).not.toContain("anthropic")
  expect(JSON.stringify(catalog)).not.toContain("secret-setting")
  expect(JSON.stringify(catalog)).not.toContain("secret-header")
})

for (const policy of [{ whitelist: ["keep"] }, { blacklist: ["removed"] }, {}]) {
  test(`catalog respects transformed models under ${JSON.stringify(policy)}`, async () => {
    await using repo = await createGitRepo("catalog-model-policy")
    writeProjectConfig(
      repo.path,
      JSON.stringify({
        provider: {
          fixture: {
            npm: "@ai-sdk/openai-compatible",
            options: { apiKey: "fixture-key", baseURL: "https://example.invalid" },
            ...policy,
            models: {
              keep: { release_date: "2020-01-01" },
              removed: { release_date: "2026-01-01" },
            },
          },
        },
      }),
    )
    let context: PluginContext | undefined
    await using runtime = await createNotebookTestHost({
      plugins: [
        createProviderCatalogPlugin(),
        Plugin.define({
          id: "buddy.test.model-removal",
          async setup(ctx) {
            context = ctx
          },
        }),
      ],
    })
    await syncNotebookRuntimeConfig(repo.path, { runtime: createOpenCodeRuntime(runtime.host) })
    if (Object.keys(policy).length === 0) {
      if (!context) throw new Error("Plugin did not activate")
      await context.model.transform((editor) => editor.remove("fixture", "removed"))
    }
    const native = (
      await runtime.host.model.list({ location: { directory: repo.path } })
    ).data.filter((model) => model.providerID === "fixture")
    expect(native.map((model) => model.id)).toEqual(["keep"])
    const definitions = await readProviderDefinitions(runtime.host, repo.path)
    expect(
      Object.keys(definitions.find((provider) => provider.id === "fixture")?.models ?? {}),
    ).toEqual(["keep"])
    const catalog = await listProviderCatalog(runtime.host, repo.path)
    expect(catalog.connected).toContain("fixture")
    expect(
      Object.keys(catalog.all.find((provider) => provider.id === "fixture")?.models ?? {}),
    ).toEqual(["keep"])
    expect(catalog.default.fixture).toBe("keep")
  })
}
