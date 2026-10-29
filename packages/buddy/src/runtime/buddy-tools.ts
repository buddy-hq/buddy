import type { RuntimeTool } from "@buddy/agent-runtime/extension"
import { registerBuddyToolPresentationCatalog } from "./buddy-tool-presentation-catalog"

export async function allBuddyRuntimeTools(directory: string): Promise<readonly RuntimeTool[]> {
  const [{ allBuddyTools }, { getDynamicToolSearchTools }] = await Promise.all([
    import("../learning/runtime/feature-registry"), import("../learning/runtime/dynamic-tool-discovery"),
  ])
  const tools = [...allBuddyTools(), ...getDynamicToolSearchTools()]
  const seen = new Set<string>()
  for (const tool of tools) {
    if (seen.has(tool.id)) throw new Error(`Duplicate Buddy tool id "${tool.id}" in plugin export`)
    seen.add(tool.id)
  }
  registerBuddyToolPresentationCatalog(directory, tools)
  return tools
}
