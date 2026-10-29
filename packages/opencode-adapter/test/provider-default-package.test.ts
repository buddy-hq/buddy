import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { RuntimeExtension } from "@buddy/agent-runtime/extension"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { createOpenCodeHost } from "../src/host"
import { createRuntimeExtensionPlugin } from "../src/extension/plugin"
import { NOTEBOOK_CONFIG_RPC } from "../src/extension/notebook"

test("custom providers without a package default to the OpenAI-compatible transport", async () => {
  const root = path.join(TEST_SANDBOX.root, "provider-default-package")
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
            options: { baseURL: "http://127.0.0.1:9/v1", apiKey: "local-fixture" },
            models: { chat: {} },
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
  const providers = await host.provider.list({ location: { directory } })
  const provider = providers.data.find((entry) => entry.id === "privateGateway")
  expect(provider).toBeDefined()
  expect(provider?.package).toContain("openai-compatible")
})
