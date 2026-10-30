import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { RuntimeExtension } from "@buddy/agent-runtime/extension"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { createOpenCodeHost } from "../src/host"
import { createRuntimeExtensionPlugin } from "../src/extension/plugin"
import { NOTEBOOK_CONFIG_RPC } from "../src/extension/notebook"

test("model aliases inherit their target's configured limits", async () => {
  const root = path.join(TEST_SANDBOX.root, "provider-model-alias")
  const paths = {
    data: path.join(root, "data"),
    config: path.join(root, "config"),
    state: path.join(root, "state"),
    cache: path.join(root, "cache"),
    tmp: path.join(root, "tmp"),
  }
  const directory = path.join(root, "workspace")
  await Promise.all(
    [...Object.values(paths), directory].map((entry) => fs.mkdir(entry, { recursive: true })),
  )
  const extension: RuntimeExtension = {
    async tools() {
      return []
    },
    async notebookPlan() {
      return {
        agents: [{ id: "buddy", mode: "primary", permissions: [] }],
        defaultAgent: "buddy",
        permissions: [],
        providers: [
          {
            id: "privateGateway",
            npm: "@ai-sdk/perplexity",
            options: { apiKey: "local-fixture" },
            models: {
              real: { limit: { context: 64000, output: 4000 } },
              alias: { modelID: "real" },
            },
          },
        ],
        enabledProviders: ["privateGateway"],
        mcp: [],
        skills: [],
        excludedSkillRoots: [],
        commands: {},
        diagnostics: [],
      }
    },
    hooks() {
      return {
        async hydrate() {},
        async compaction() {},
        async prompt() {},
        async beforeTool() {},
        async permission(input) {
          return input.effect
        },
        async context(input) {
          return { system: input.system, textVerbosity: input.textVerbosity }
        },
      }
    },
    chatgpt() {
      throw new Error("Unexpected ChatGPT account access")
    },
  }
  await using host = await createOpenCodeHost({
    clientName: "buddy-test",
    paths,
    databasePath: ":memory:",
    fetchModels: false,
    fs: { filewatcher: false, fff: false },
    config: { project: false },
    plugins: [createRuntimeExtensionPlugin(extension, async () => host)],
  })
  await host.rpc.call({
    rpcID: NOTEBOOK_CONFIG_RPC.id,
    method: "ready",
    input: {},
    location: { directory },
  })
  const models = await host.model.list({ location: { directory } })
  const real = models.data.find(
    (model) => model.providerID === "privateGateway" && model.id === "real",
  )
  const alias = models.data.find(
    (model) => model.providerID === "privateGateway" && model.id === "alias",
  )
  expect(real?.limit).toMatchObject({ context: 64000, output: 4000 })
  expect(alias?.limit).toMatchObject({ context: 64000, output: 4000 })
})
