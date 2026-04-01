import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import type { BuddyTool } from "./create-buddy-tool"

export async function registerBuddyTools(
  directory: string,
  tools: readonly BuddyTool[],
): Promise<void> {
  await OpenCodeInstance.provide({
    directory,
    async fn() {
      for (const tool of tools) {
        await ToolRegistry.register(tool.toTool(directory))
      }
    },
  })
}

export async function unregisterBuddyTools(
  directory: string,
  toolIDs: readonly string[],
): Promise<void> {
  if (toolIDs.length === 0) return

  await OpenCodeInstance.provide({
    directory,
    async fn() {
      // OpenCode no longer exposes ToolRegistry custom-state mutation.
      // Keep unregister as a no-op until a public unregister API exists.
      void toolIDs
    },
  })
}
