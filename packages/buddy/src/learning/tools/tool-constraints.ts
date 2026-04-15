import type { WorkspaceState } from "../shared/teaching-vocabulary"
import { AdvancedMathRuntimeService } from "../../local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../../local-runtimes/standards/service"
import type { PersonaDefinition } from "../shared/runtime-types"
import {
  ADVANCED_MATH_RUNTIME_DEPENDENCY,
  STANDARDS_RUNTIME_DEPENDENCY,
  type LearningToolConstraintSource,
} from "./tool-capability-constraints"

function toolMatchesPersonaSurfaces(
  tool: LearningToolConstraintSource,
  persona: PersonaDefinition,
): boolean {
  const requiredSurfaces = tool.capability?.surfaces
  if (!requiredSurfaces || requiredSurfaces.length === 0) {
    return true
  }

  return requiredSurfaces.some((surface) => persona.surfaces.includes(surface))
}

function toolMatchesWorkspaceState(
  tool: LearningToolConstraintSource,
  workspaceState: WorkspaceState,
): boolean {
  const requiredWorkspaceStates = tool.capability?.workspaceStates
  if (!requiredWorkspaceStates || requiredWorkspaceStates.length === 0) {
    return true
  }

  return requiredWorkspaceStates.includes(workspaceState)
}

export function toolMatchesPersonaWorkspaceConstraints(input: {
  tool: LearningToolConstraintSource
  persona: PersonaDefinition
  workspaceState: WorkspaceState
}): boolean {
  return (
    toolMatchesPersonaSurfaces(input.tool, input.persona) &&
    toolMatchesWorkspaceState(input.tool, input.workspaceState)
  )
}

export function toolMatchesRuntimeConstraints(tool: LearningToolConstraintSource): boolean {
  switch (tool.capability?.runtimeDependency) {
    case ADVANCED_MATH_RUNTIME_DEPENDENCY:
      return AdvancedMathRuntimeService.isReady()
    case STANDARDS_RUNTIME_DEPENDENCY:
      return StandardsRuntimeService.isReady()
    default:
      return true
  }
}
