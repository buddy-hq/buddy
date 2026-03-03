import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import type { BuddyTool } from "./create-buddy-tool.js"

function createToolRegistrar(tools: readonly BuddyTool[]) {
  return async function ensureToolsRegistered(directory: string) {
    await OpenCodeInstance.provide({
      directory,
      async fn() {
        for (const tool of tools) {
          await ToolRegistry.register(tool.toTool(directory))
        }
      },
    })
  }
}

export { createToolRegistrar }
