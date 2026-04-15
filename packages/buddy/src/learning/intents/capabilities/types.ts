import type { Intent } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { Persona, WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { BuddyTool } from "../../tools/create-buddy-tool"
import type { BuddyToolCapabilityConstraints } from "../../tools/tool-capability-constraints"
import {
  allLearningToolIds,
  getLearningToolMetadata,
  type LearningToolId,
  type LearningToolMetadata,
} from "../../tools/tool-metadata"
import type { SkillCapabilityKey } from "./skill-capabilities"

type ExplicitIntent = Exclude<Intent, "auto">

type DirectToolCapabilityInput = LearningToolId | BuddyTool | LearningToolMetadata
type ToolCapabilityTool = {
  id: string
  capability?: BuddyToolCapabilityConstraints
}

export type ToolCapability = {
  tool: ToolCapabilityTool
  personas?: Persona[]
  workspaceStates?: WorkspaceState[]
}

export type ToolCapabilityInput =
  | DirectToolCapabilityInput
  | {
      tool: DirectToolCapabilityInput
      personas?: Persona[]
      workspaceStates?: WorkspaceState[]
    }

export type IntentCapabilityManifest = {
  intent: ExplicitIntent
  toolCapabilities: ToolCapability[]
  skillCapabilityKeys: SkillCapabilityKey[]
}

function isKnownLearningToolID(value: string): value is LearningToolId {
  return allLearningToolIds().some((toolID) => toolID === value)
}

function isDirectToolCapabilityInput(
  value: ToolCapabilityInput,
): value is DirectToolCapabilityInput {
  return typeof value === "string" || (typeof value === "object" && value !== null && "id" in value)
}

function resolveLearningToolMetadata(input: DirectToolCapabilityInput): ToolCapabilityTool {
  if (typeof input !== "string" && "group" in input) {
    return input
  }

  const toolID = typeof input === "string" ? input : input.id
  if (isKnownLearningToolID(toolID)) {
    const tool = getLearningToolMetadata(toolID)
    if (tool) {
      return tool
    }
  }

  if (typeof input !== "string") {
    return {
      id: input.id,
      ...(input.capability ? { capability: input.capability } : {}),
    }
  }

  throw new Error(`Unknown learning tool "${toolID}"`)
}

export function createToolCapability(input: ToolCapabilityInput): ToolCapability {
  if (isDirectToolCapabilityInput(input)) {
    return {
      tool: resolveLearningToolMetadata(input),
    }
  }

  return {
    tool: resolveLearningToolMetadata(input.tool),
    ...(input.personas ? { personas: [...input.personas] } : {}),
    ...(input.workspaceStates ? { workspaceStates: [...input.workspaceStates] } : {}),
  }
}

export function createIntentCapabilities(input: {
  intent: ExplicitIntent
  tools?: ToolCapabilityInput[]
  skills?: SkillCapabilityKey[]
}): IntentCapabilityManifest {
  return {
    intent: input.intent,
    toolCapabilities: (input.tools ?? []).map((tool) => createToolCapability(tool)),
    skillCapabilityKeys: [...(input.skills ?? [])],
  }
}
