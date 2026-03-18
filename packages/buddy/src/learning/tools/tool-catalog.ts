import { freeformFigureTools } from "@buddy/backend/learning/capabilities/figures/freeform/tools/tools"
import { figureTools } from "@buddy/backend/learning/capabilities/figures/geometry/tools/tools"
import { teachingTools } from "@buddy/backend/learning/capabilities/lesson-workspace/tools/tools"
import { mathTools } from "@buddy/backend/learning/capabilities/math/tools/tools"
import { pedagogyTools } from "@buddy/backend/learning/capabilities/pedagogy/tools/tools"
import { goalTools } from "@buddy/backend/learning/curriculum/goals/tools/tools"
import { curriculumTools } from "@buddy/backend/learning/curriculum/planning/tools/tools"
import { learnerTools } from "@buddy/backend/learning/learner-model/tools/tools"
import type { BuddyTool } from "./create-buddy-tool"

const learningToolGroups = {
  pedagogy: pedagogyTools,
  curriculum: curriculumTools,
  figures: figureTools,
  freeformFigures: freeformFigureTools,
  goals: goalTools,
  learner: learnerTools,
  teaching: teachingTools,
  math: mathTools,
} as const

type LearningToolGroup = keyof typeof learningToolGroups
type LearningTool = (typeof learningToolGroups)[keyof typeof learningToolGroups][number]
export type LearningToolId = LearningTool["id"]

function findDuplicateLearningToolIds(tools: readonly BuddyTool[]): string[] {
  const ids = tools.map((tool) => tool.id)
  const counts = new Map<string, number>()

  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right))
}

export function assertUniqueLearningToolIds(tools: readonly BuddyTool[]): void {
  const duplicateToolIds = findDuplicateLearningToolIds(tools)
  if (duplicateToolIds.length === 0) {
    return
  }

  throw new Error(
    `Duplicate learning tool IDs detected: ${duplicateToolIds.join(", ")}. Each learning tool must have a unique ID.`,
  )
}

export function allLearningTools(): readonly LearningTool[] {
  return Object.values(learningToolGroups).flat() as LearningTool[]
}

export function allLearningToolIds(): LearningToolId[] {
  return allLearningTools().map((tool) => tool.id)
}

export function assertLearningToolCatalog(): void {
  assertUniqueLearningToolIds(allLearningTools())
}

export function getLearningToolGroup(group: LearningToolGroup): readonly BuddyTool[] {
  return learningToolGroups[group]
}

export { learningToolGroups }

export type { LearningToolGroup }
