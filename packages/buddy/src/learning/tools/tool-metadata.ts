import type { BuddyToolCapabilityConstraints } from "./tool-capability-constraints"
import type { LearningToolGroup, LearningToolGroupPolicy } from "./learning-tool-group-policies"
import { allLearningToolGroups, getLearningToolGroupPolicy } from "./learning-tool-group-policies"
import {
  allRegisteredLearningTools,
  getRegisteredLearningToolGroup,
  type RegisteredLearningTool,
} from "./tool-registry"

type LearningToolId = RegisteredLearningTool["id"]
type LearningToolMetadata = {
  id: LearningToolId
  group: LearningToolGroup
  capability?: BuddyToolCapabilityConstraints
}

function cloneCapabilityConstraints(
  capability: BuddyToolCapabilityConstraints | undefined,
): BuddyToolCapabilityConstraints {
  if (!capability) {
    return {}
  }

  return {
    ...(capability.surfaces ? { surfaces: [...capability.surfaces] } : {}),
    ...(capability.workspaceStates ? { workspaceStates: [...capability.workspaceStates] } : {}),
    ...(capability.runtimeDependency ? { runtimeDependency: capability.runtimeDependency } : {}),
  }
}

function allLearningToolMetadata(): LearningToolMetadata[] {
  const metadata: LearningToolMetadata[] = []

  for (const group of allLearningToolGroups()) {
    for (const tool of getRegisteredLearningToolGroup(group)) {
      metadata.push({
        id: tool.id,
        group,
        ...(tool.capability ? { capability: cloneCapabilityConstraints(tool.capability) } : {}),
      })
    }
  }

  return metadata
}

function allLearningToolIds(): LearningToolId[] {
  return allRegisteredLearningTools().map((tool) => tool.id)
}

function getLearningToolMetadata(toolID: LearningToolId): LearningToolMetadata | undefined {
  return allLearningToolMetadata().find((tool) => tool.id === toolID)
}

export {
  allLearningToolGroups,
  allLearningToolIds,
  allLearningToolMetadata,
  getLearningToolGroupPolicy,
  getLearningToolMetadata,
}

export type { LearningToolGroup, LearningToolGroupPolicy, LearningToolId, LearningToolMetadata }
