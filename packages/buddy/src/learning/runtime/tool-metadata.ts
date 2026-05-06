import type { BuddyToolConstraints } from "./tool-constraint-types"
import { allBuddyTools } from "../runtime/feature-registry"

type LearningToolId = string
type LearningToolMetadata = {
  id: LearningToolId
  constraints?: BuddyToolConstraints
}

function allLearningToolMetadata(): LearningToolMetadata[] {
  return allBuddyTools().map((tool) => {
    const metadata: LearningToolMetadata = {
      id: tool.id,
    }

    if (tool.constraints) {
      metadata.constraints = tool.constraints
    }

    return metadata
  })
}

function allLearningToolIds(): LearningToolId[] {
  return allLearningToolMetadata().map((tool) => tool.id)
}

function getLearningToolMetadata(toolID: LearningToolId): LearningToolMetadata | undefined {
  return allLearningToolMetadata().find((tool) => tool.id === toolID)
}

export { allLearningToolIds, allLearningToolMetadata, getLearningToolMetadata }

export type { LearningToolId, LearningToolMetadata }
