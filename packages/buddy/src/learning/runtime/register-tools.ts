import type { Config } from "@buddy/backend/config"
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
  configuredToolToggles?: Config.Info["tools"],
): Promise<void> {
  const toolsToRegister: BuddyTool[] = [...dynamicToolSearchTools]
  const toolsToUnregister = new Set<string>()
  const registeredToolIDs = new Set<string>(dynamicToolSearchTools.map((tool) => tool.id))

  for (const feature of allBuddyFeatures()) {
    const featureTools = collectFeatureTools(feature)

    if (flags[feature.id] === false) {
      for (const tool of featureTools) {
        toolsToUnregister.add(tool.id)
      }
    } else {
      for (const tool of featureTools) {
        if (configuredToolToggles?.[tool.id] === false) {
          toolsToUnregister.add(tool.id)
          continue
        }

        if (registeredToolIDs.has(tool.id)) continue
        registeredToolIDs.add(tool.id)
        toolsToRegister.push(tool)
      }
    }
  }

  if (toolsToUnregister.size > 0) {
    await unregisterBuddyTools(directory, [...toolsToUnregister]).catch((error) => {
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
