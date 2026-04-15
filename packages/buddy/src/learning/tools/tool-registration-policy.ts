import { AdvancedMathRuntimeService } from "../../local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../../local-runtimes/standards/service"
import {
  allLearningToolGroups,
  getLearningToolGroupPolicy,
  type LearningToolGroup,
} from "./tool-metadata"
import {
  ADVANCED_MATH_RUNTIME_DEPENDENCY,
  STANDARDS_RUNTIME_DEPENDENCY,
  type LearningToolRuntimeDependency,
} from "./tool-capability-constraints"

type LearningToolRegistrationFlags = Record<LearningToolGroup, boolean>

function dependencyReady(dependency: LearningToolRuntimeDependency | undefined): boolean {
  switch (dependency) {
    case ADVANCED_MATH_RUNTIME_DEPENDENCY:
      return AdvancedMathRuntimeService.isReady()
    case STANDARDS_RUNTIME_DEPENDENCY:
      return StandardsRuntimeService.isReady()
    default:
      return true
  }
}

export function resolveLearningToolRegistrationFlags(input?: {
  overrides?: Partial<Record<LearningToolGroup, boolean>>
}): LearningToolRegistrationFlags {
  return Object.fromEntries(
    allLearningToolGroups().map((group) => {
      const explicitOverride = input?.overrides?.[group]
      if (typeof explicitOverride === "boolean") {
        return [group, explicitOverride]
      }

      return [group, dependencyReady(getLearningToolGroupPolicy(group).runtimeDependency)]
    }),
  ) as LearningToolRegistrationFlags
}

export type { LearningToolRegistrationFlags }
