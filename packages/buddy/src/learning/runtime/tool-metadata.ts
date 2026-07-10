import type { BuddyToolConstraints } from "./tool-constraint-types"
import { allBuddyFeatures } from "../runtime/feature-registry"

type LearningToolId = string
type LearningToolMetadata = {
  id: LearningToolId
  featureID: string
  constraints?: BuddyToolConstraints
}

function allLearningToolMetadata(): LearningToolMetadata[] {
  const seen = new Set<string>()
  const metadata: LearningToolMetadata[] = []

  for (const feature of allBuddyFeatures()) {
    const tools = [
      ...feature.tools,
      ...feature.subagents.flatMap((subagent) => subagent.tools ?? []),
    ]
    for (const tool of tools) {
      if (seen.has(tool.id)) continue
      seen.add(tool.id)
      metadata.push({
        id: tool.id,
        featureID: feature.id,
        ...(tool.constraints ? { constraints: tool.constraints } : {}),
      })
    }
  }

  return metadata
}

function allLearningToolIds(): LearningToolId[] {
  return allLearningToolMetadata().map((tool) => tool.id)
}

function getLearningToolMetadata(toolID: LearningToolId): LearningToolMetadata | undefined {
  return allLearningToolMetadata().find((tool) => tool.id === toolID)
}

export { allLearningToolIds, allLearningToolMetadata, getLearningToolMetadata }

export type { LearningToolId, LearningToolMetadata }
