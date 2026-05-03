import { registerBuddyTools, unregisterBuddyTools } from "../runtime/register-buddy-tools"
import { allBuddyFeatures } from "./feature-registry"
import type { BuddyTool } from "./create-buddy-tool"
import type { DefinedBuddyFeature } from "./define-buddy-feature"
import { dynamicToolSearchTools } from "../runtime/dynamic-tool-discovery"

function collectFeatureTools(feature: DefinedBuddyFeature): BuddyTool[] {
  const tools: BuddyTool[] = [...feature.tools]

  for (const subagent of feature.subagents) {
    for (const tool of subagent.tools ?? []) {
      tools.push(tool)
    }
  }

  return tools
}

async function registerRuntimeTools(
  directory: string,
  flags: Record<string, boolean>,
): Promise<void> {
  const toolsToRegister: BuddyTool[] = [...dynamicToolSearchTools]
  const toolsToUnregister: string[] = []
  const registeredToolIDs = new Set<string>(dynamicToolSearchTools.map((tool) => tool.id))

  for (const feature of allBuddyFeatures()) {
    const featureTools = collectFeatureTools(feature)

    if (flags[feature.id] === false) {
      toolsToUnregister.push(...featureTools.map((tool) => tool.id))
    } else {
      for (const tool of featureTools) {
        if (registeredToolIDs.has(tool.id)) continue
        registeredToolIDs.add(tool.id)
        toolsToRegister.push(tool)
      }
    }
  }

  if (toolsToUnregister.length > 0) {
    await unregisterBuddyTools(directory, toolsToUnregister).catch((error) => {
      console.warn("Failed to unregister Buddy tools:", error)
    })
  }

  if (toolsToRegister.length > 0) {
    await registerBuddyTools(directory, toolsToRegister).catch((error) => {
      console.warn("Failed to register Buddy tools:", error)
    })
  }
}

export { registerRuntimeTools }
