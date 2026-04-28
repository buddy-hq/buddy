import {
  allLearningToolGroups,
  getLearningToolGroupPolicy,
  type LearningToolGroup,
  type LearningToolGroupPolicy,
} from "./learning-tool-group-policies"
import type { BuddyTool } from "./create-buddy-tool"
import { allFeatureLearningToolGroups } from "./feature-learning-tool-groups"
import {
  staticLearningTools,
  type LearningToolGroupDefinition,
} from "./learning-tool-group-definition"
import { toolDiscoveryLearningToolGroup } from "./tool-discovery-learning-tool-group"

type RegisteredLearningTool = BuddyTool
type RegisteredLearningToolGroupDescriptor = LearningToolGroupPolicy & {
  tools: readonly RegisteredLearningTool[]
}

const registeredLearningToolGroups = [
  ...allFeatureLearningToolGroups(),
  toolDiscoveryLearningToolGroup,
]

function buildRegisteredLearningToolGroupDescriptors(
  groups: readonly LearningToolGroupDefinition[],
): Record<LearningToolGroup, RegisteredLearningToolGroupDescriptor> {
  const descriptors: Partial<Record<LearningToolGroup, RegisteredLearningToolGroupDescriptor>> = {}

  for (const group of groups) {
    descriptors[group.group] = {
      ...getLearningToolGroupPolicy(group.group),
      tools: staticLearningTools(group),
    }
  }

  if (!hasAllRegisteredLearningToolGroupDescriptors(descriptors)) {
    throw new Error("Registered learning tool groups must cover every learning tool group")
  }

  return descriptors
}

function hasAllRegisteredLearningToolGroupDescriptors(
  input: Partial<Record<LearningToolGroup, RegisteredLearningToolGroupDescriptor>>,
): input is Record<LearningToolGroup, RegisteredLearningToolGroupDescriptor> {
  return allLearningToolGroups().every((group) => input[group] !== undefined)
}

const registeredLearningToolGroupDescriptors = buildRegisteredLearningToolGroupDescriptors(
  registeredLearningToolGroups,
)

function allKnownLearningTools(): BuddyTool[] {
  const tools: BuddyTool[] = []
  for (const group of registeredLearningToolGroups) {
    tools.push(...group.tools)
  }
  return tools
}

function allRegisteredLearningTools(): RegisteredLearningTool[] {
  const tools: RegisteredLearningTool[] = []
  for (const group of allLearningToolGroups()) {
    tools.push(...registeredLearningToolGroupDescriptors[group].tools)
  }
  return tools
}

function getRegisteredLearningToolGroup(
  group: LearningToolGroup,
): readonly RegisteredLearningTool[] {
  return registeredLearningToolGroupDescriptors[group].tools
}

function getRegisteredLearningToolGroupDescriptor(
  group: LearningToolGroup,
): RegisteredLearningToolGroupDescriptor {
  return registeredLearningToolGroupDescriptors[group]
}

export {
  allKnownLearningTools,
  allRegisteredLearningTools,
  getRegisteredLearningToolGroup,
  getRegisteredLearningToolGroupDescriptor,
  registeredLearningToolGroupDescriptors,
}

export type { RegisteredLearningTool, RegisteredLearningToolGroupDescriptor }
