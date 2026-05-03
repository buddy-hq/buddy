import type { BuddyToolConstraints } from "./tool-constraint-types"
import { allBuddyTools } from "../runtime/feature-registry"

type LearningToolId = string
type LearningToolMetadata = {
  id: LearningToolId
  constraints?: BuddyToolConstraints
}

function allLearningToolMetadata(): LearningToolMetadata[] {
  return allBuddyTools().map((tool) => ({
    id: tool.id,
    ...(tool.constraints ? { constraints: tool.constraints } : {}),
  }))
}

function allLearningToolIds(): LearningToolId[] {
  return allLearningToolMetadata().map((tool) => tool.id)
}

function getLearningToolMetadata(toolID: LearningToolId): LearningToolMetadata | undefined {
  return allLearningToolMetadata().find((tool) => tool.id === toolID)
}

export { allLearningToolIds, allLearningToolMetadata, getLearningToolMetadata }

export type { LearningToolId, LearningToolMetadata }
