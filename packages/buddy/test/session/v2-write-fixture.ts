import fs from "node:fs/promises"
import path from "node:path"
import { createOpenCodeHost } from "@buddy/opencode-adapter/host"
import { Plugin, type AISDKHooks } from "@buddy/opencode-adapter/plugin"
import { withBuddyCommandDisplay } from "../../src/opencode-runtime/command-display"
import { createBuddyRuntimePlugin, type BuddyRuntimePluginOptions } from "../../src/opencode-runtime/plugins/buddy-runtime-plugin"
import { applyBuddyPromptContext } from "../../src/learning/agent-execution/transforms/prompt-context"
import { scriptedModelPlugin } from "../opencode-runtime/scripted-model"
import { temporaryDirectory } from "../helpers/temporary-directory"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>

export async function createWriteFixture(options: Pick<BuddyRuntimePluginOptions, "loadTools"> & { readonly compactionSummary?: string; readonly plugins?: readonly Plugin.Plugin[] } = {}) {
  const root = await temporaryDirectory({ prefix: "buddy-write-" })
  const directory = path.join(root.path, "workspace")
  const paths = { data: path.join(root.path, "data"), config: path.join(root.path, "config"), state: path.join(root.path, "state"), cache: path.join(root.path, "cache"), tmp: path.join(root.path, "tmp") }
  const requests: Parameters<LanguageModel["doStream"]>[0][] = []
  try {
    await Promise.all([directory, ...Object.values(paths)].map((entry) => fs.mkdir(entry, { recursive: true })))
    const created = await createOpenCodeHost({
      clientName: "buddy-test", paths, databasePath: ":memory:", fetchModels: false,
      fs: { filewatcher: false, fff: false },
      config: { project: false, content: JSON.stringify({
        model: "scripted/chat",
        providers: { scripted: { package: "aisdk:@ai-sdk/perplexity", settings: { apiKey: "test" }, models: { chat: {}, compact: {} } } },
        agents: { buddy: { system: "Fixture system." } },
        commands: { explain: { template: "Full expanded template: $ARGUMENTS" } },
      }) },
      plugins: [
        scriptedModelPlugin(requests),
        Plugin.define({ id: "buddy.test.prompt-context", async setup(ctx) {
          await ctx.session.hook("context", async (event) => applyBuddyPromptContext(event, await ctx.session.context({ sessionID: event.sessionID }), created))
          await ctx.session.hook("compaction", (event) => { if (options.compactionSummary !== undefined) event.result = { summary: options.compactionSummary } })
        } }),
        createBuddyRuntimePlugin({ getClient: async () => created, loadTools: options.loadTools ?? (async () => []) }),
        ...options.plugins ?? [],
      ],
    })
    const host = withBuddyCommandDisplay(created)
    return { host, directory, requests, async [Symbol.asyncDispose]() { try { await host.close() } finally { await root[Symbol.asyncDispose]() } } }
  } catch (error) { await root[Symbol.asyncDispose](); throw error }
}
