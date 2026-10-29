import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import type { RuntimeExtension } from "@buddy/agent-runtime/extension"
import { Plugin } from "@opencode/plugin"
import type { AISDKHooks } from "@opencode/plugin/promise/aisdk"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { createOpenCodeHost } from "../src/host"
import { createRuntimeExtensionPlugin } from "../src/extension/plugin"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
type ModelInput = Parameters<LanguageModel["doStream"]>[0]

test.each([false, true])("provider headers and extension tool visibility (hidden: %s)", async (hidden) => {
  const root = path.join(TEST_SANDBOX.root, `provider-headers-${hidden}`)
  const paths = { data: path.join(root, "data"), config: path.join(root, "config"), state: path.join(root, "state"), cache: path.join(root, "cache"), tmp: path.join(root, "tmp") }
  const directory = path.join(root, "workspace")
  await Promise.all([...Object.values(paths), directory].map((entry) => fs.mkdir(entry, { recursive: true })))
  const providers = ["openai", "anthropic", "opencode", "opencode-go"]
  const requests: ModelInput[] = []
  const contextTools: string[][] = []
  const extension: RuntimeExtension = {
    async tools() {
      return [{
        id: "fixture_probe", description: "Return a fixture.", jsonSchema: { type: "object", properties: {} },
        async run() { return { title: "Fixture", output: "Fixture", metadata: {} } },
      }]
    },
    async notebookPlan() {
      return {
        agents: [{ id: "buddy", mode: "primary", permissions: [] }], defaultAgent: "buddy", permissions: [],
        providers: providers.map((id) => ({ id, npm: "@ai-sdk/perplexity", options: { apiKey: "local-fixture" }, models: { chat: {} } })),
        enabledProviders: providers, mcp: [], skills: [], excludedSkillRoots: [], commands: {}, diagnostics: [],
      }
    },
    hooks() {
      return {
        async hydrate() {}, async compaction() {}, async prompt() {}, async beforeTool() {},
        async context(input) {
          contextTools.push([...input.tools])
          return { system: input.system, textVerbosity: input.textVerbosity, ...(hidden ? { hiddenTools: ["fixture_probe"] } : undefined) }
        },
      }
    },
    chatgpt() { throw new Error("Unexpected ChatGPT account access") },
  }
  const preserved = {
    originator: "opencode", "session-id": "fixture-affinity", "chatgpt-account-id": "fixture-account",
    "x-codex-beta-features": "remote_compaction_v2", "x-opencode": "unrelated", "x-custom-header": "retained",
  }
  await using host = await createOpenCodeHost({
    clientName: "buddy-test", paths, databasePath: ":memory:", fetchModels: false,
    fs: { filewatcher: false, fff: false }, config: { project: false },
    plugins: [
      Plugin.define({ id: "buddy.test.provider-headers-fixture", async setup(ctx) {
        await ctx.session.hook("model.request", (event) => {
          Object.assign(event.headers, preserved, { "X-OpenCode-Future": "private" })
        })
        await ctx.aisdk.hook("language", (event) => {
          event.language = {
            specificationVersion: "v3", provider: "buddy-test", modelId: "chat", supportedUrls: {},
            async doGenerate() { throw new Error("Unexpected non-streaming request") },
            async doStream(request) {
              requests.push(request)
              return { stream: new ReadableStream({ start(controller) {
                controller.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                } })
                controller.close()
              } }) }
            },
          }
        })
      } }),
      createRuntimeExtensionPlugin(extension, async () => host),
    ],
  })
  for (const providerID of providers) {
    requests.length = 0
    const session = await host.session.create({ location: { directory }, title: "Header fixture", agent: "buddy", model: { providerID, id: "chat" } })
    await host.session.prompt({ sessionID: session.id, text: "Check request headers." })
    await host.session.wait({ sessionID: session.id })
    const headers = requests.at(-1)?.headers
    expect(contextTools.at(-1)).toContain("fixture_probe")
    const toolNames = requests.at(-1)?.tools?.map((tool) => tool.name)
    expect(toolNames).toBeDefined()
    if (hidden) expect(toolNames).not.toContain("fixture_probe")
    else expect(toolNames).toContain("fixture_probe")
    expect(headers).toMatchObject(preserved)
    const attribution = Object.keys(headers ?? {}).filter((name) => name.toLowerCase().startsWith("x-opencode-"))
    if (providerID === "opencode" || providerID === "opencode-go") {
      expect(headers).toMatchObject({
        "x-opencode-session-id": session.id, "x-opencode-session": session.id,
        "x-opencode-client": "buddy-test", "X-OpenCode-Future": "private",
      })
      expect(headers).toHaveProperty("x-opencode-project")
    } else {
      expect(attribution).toEqual([])
    }
  }
})
