import type { Persona, WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import {
  pedagogyDebugAttemptTool,
  pedagogyGuidedPracticeTool,
  pedagogyIndependentPracticeTool,
  pedagogyMasteryCheckTool,
  pedagogyReflectionTool,
  pedagogyRetrievalCheckTool,
  pedagogyStepwiseSolveTool,
  pedagogyTransferCheckTool,
} from "../../capabilities/pedagogy/tools/definitions"
import type { BuddyTool } from "../../tools"

export type ToolCapability = {
  tool: BuddyTool
  personas?: Persona[]
  workspaceStates?: WorkspaceState[]
}

export type ToolCapabilityInput =
  | BuddyTool
  | {
      tool: BuddyTool
      personas?: Persona[]
      workspaceStates?: WorkspaceState[]
    }

function isBuddyTool(value: ToolCapabilityInput): value is BuddyTool {
  return "id" in value
}

export function createToolCapability(input: ToolCapabilityInput): ToolCapability {
  if (isBuddyTool(input)) {
    return {
      tool: input,
    }
  }

  return {
    tool: input.tool,
    ...(input.personas ? { personas: [...input.personas] } : {}),
    ...(input.workspaceStates ? { workspaceStates: [...input.workspaceStates] } : {}),
  }
}

export function toolCapabilityKey(capability: ToolCapability): string {
  return capability.tool.id
}

export const TOOL_CAPABILITY_REGISTRY = [
  createToolCapability(pedagogyGuidedPracticeTool),
  createToolCapability(pedagogyIndependentPracticeTool),
  createToolCapability({
    tool: pedagogyDebugAttemptTool,
    personas: ["code-buddy"],
    workspaceStates: ["interactive"],
  }),
  createToolCapability({
    tool: pedagogyStepwiseSolveTool,
    personas: ["math-buddy"],
  }),
  createToolCapability(pedagogyMasteryCheckTool),
  createToolCapability(pedagogyReflectionTool),
  createToolCapability(pedagogyRetrievalCheckTool),
  createToolCapability(pedagogyTransferCheckTool),
] as const satisfies readonly ToolCapability[]

type ListedToolCapability = {
  key: string
  toolId: string
  personas?: Persona[]
  workspaceStates?: WorkspaceState[]
}

export function listToolCapabilities(): ListedToolCapability[] {
  return TOOL_CAPABILITY_REGISTRY.map((capability) => ({
    key: toolCapabilityKey(capability),
    toolId: capability.tool.id,
    ...(capability.personas ? { personas: [...capability.personas] } : {}),
    ...(capability.workspaceStates ? { workspaceStates: [...capability.workspaceStates] } : {}),
  }))
}
