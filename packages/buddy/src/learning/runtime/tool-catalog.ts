import {
  allLearningToolIds,
  allLearningToolMetadata,
  getLearningToolMetadata,
  type LearningToolId,
  type LearningToolMetadata,
} from "./tool-metadata"

export function allLearningTools(): LearningToolMetadata[] {
  return allLearningToolMetadata()
}

export { allLearningToolIds }

export function getLearningTool(toolID: LearningToolId): LearningToolMetadata | undefined {
  return getLearningToolMetadata(toolID)
}

export type { LearningToolId }
