import type { Plugin } from "@buddy/opencode-adapter/plugin"
import { createBuddyRuntimePlugin, type BuddyRuntimePluginOptions } from "./buddy-runtime-plugin"
import { createOpenAICodexPlugin } from "./openai-codex-auth"

export function createBuddyOpenCodePlugins(options: BuddyRuntimePluginOptions): Plugin.Plugin[] {
  return [createBuddyRuntimePlugin(options, "catalog"), createOpenAICodexPlugin()]
}

export function createBuddyOpenCodeInstances(options: BuddyRuntimePluginOptions) {
  return { key: () => "buddy.runtime.v1", configure: () => ({ plugins: [createBuddyRuntimePlugin(options)] }) }
}
