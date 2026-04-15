import { INTENT_CAPABILITY_MANIFESTS } from "./intent-manifests"
import { type ToolCapability, type ToolCapabilityInput, createToolCapability } from "./types"

type ListedToolCapability = {
  key: string
  toolId: string
  personas?: ToolCapability["personas"]
  workspaceStates?: ToolCapability["workspaceStates"]
}

function dedupeToolCapabilities(capabilities: readonly ToolCapability[]): ToolCapability[] {
  const capabilityMap = new Map<string, ToolCapability>()
  for (const capability of capabilities) {
    capabilityMap.set(capability.tool.id, capability)
  }
  return [...capabilityMap.values()]
}

function collectManagedToolCapabilities(): ToolCapability[] {
  return dedupeToolCapabilities(
    INTENT_CAPABILITY_MANIFESTS.flatMap((manifest) => manifest.toolCapabilities),
  )
}

export const TOOL_CAPABILITY_REGISTRY = collectManagedToolCapabilities()

export function listToolCapabilities(): ListedToolCapability[] {
  return collectManagedToolCapabilities().map((capability) =>
    Object.assign(
      { key: capability.tool.id, toolId: capability.tool.id },
      capability.personas ? { personas: [...capability.personas] } : {},
      capability.workspaceStates ? { workspaceStates: [...capability.workspaceStates] } : {},
    ),
  )
}

export { createToolCapability }

export type { ToolCapability, ToolCapabilityInput }
