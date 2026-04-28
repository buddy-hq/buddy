import {
  allLearningToolGroups,
  allLearningToolIds,
  allLearningToolMetadata,
  getLearningToolGroupPolicy,
  getLearningToolMetadata,
  type LearningToolGroup,
  type LearningToolGroupPolicy,
  type LearningToolId,
  type LearningToolMetadata,
} from "./tool-metadata"
import { allKnownLearningTools } from "./tool-registry"

type ToolIdentity = {
  id: string
}

function findDuplicateLearningToolIds(tools: readonly ToolIdentity[]): string[] {
  const ids = tools.map((tool) => tool.id)
  const counts = new Map<string, number>()

  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .toSorted((left, right) => left.localeCompare(right))
}

export function assertUniqueLearningToolIds(tools: readonly ToolIdentity[]): void {
  const duplicateToolIds = findDuplicateLearningToolIds(tools)
  if (duplicateToolIds.length === 0) {
    return
  }

  throw new Error(
    `Duplicate learning tool IDs detected: ${duplicateToolIds.join(", ")}. Each learning tool must have a unique ID.`,
  )
}

export function allLearningTools(): LearningToolMetadata[] {
  return allLearningToolMetadata()
}

export { allLearningToolGroups, allLearningToolIds }

export function assertLearningToolCatalog(): void {
  assertUniqueLearningToolIds(allKnownLearningTools())
}

export function getLearningToolGroup(group: LearningToolGroup): LearningToolMetadata[] {
  return allLearningToolMetadata().filter((tool) => tool.group === group)
}

export function getLearningToolGroupDescriptor(group: LearningToolGroup): LearningToolGroupPolicy {
  return getLearningToolGroupPolicy(group)
}

export function allLearningToolGroupDescriptors(): Record<
  LearningToolGroup,
  LearningToolGroupPolicy
> {
  return Object.fromEntries(
    allLearningToolGroups().map((group) => [group, getLearningToolGroupPolicy(group)]),
  ) as Record<LearningToolGroup, LearningToolGroupPolicy>
}

export function getLearningTool(toolID: LearningToolId): LearningToolMetadata | undefined {
  return getLearningToolMetadata(toolID)
}

export type { LearningToolGroup, LearningToolGroupPolicy as LearningToolGroupDescriptor }
