import type { BuddyTool } from "./create-buddy-tool"
import type { LearningToolGroup } from "./learning-tool-group-policies"

type LearningToolGroupDefinition<Group extends LearningToolGroup = LearningToolGroup> = {
  group: Group
  tools: readonly BuddyTool[]
}

function defineLearningToolGroup<const Group extends LearningToolGroup>(input: {
  group: Group
  tools: readonly BuddyTool[]
}): LearningToolGroupDefinition<Group> {
  return {
    group: input.group,
    tools: [...input.tools],
  }
}

function staticLearningTools(input: LearningToolGroupDefinition): BuddyTool[] {
  return input.tools.filter((tool) => !tool.dynamic)
}

function deferredLearningTools(input: LearningToolGroupDefinition): BuddyTool[] {
  return input.tools.filter((tool) => Boolean(tool.dynamic))
}

export { defineLearningToolGroup, deferredLearningTools, staticLearningTools }

export type { LearningToolGroupDefinition }
