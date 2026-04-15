import type { PersonaDefinition, ToolId } from "../shared/runtime-types"
import { deriveStaticPersonaLearningToolPermissions } from "./tool-permission-compiler"
export {
  toolMatchesPersonaWorkspaceConstraints,
  toolMatchesRuntimeConstraints,
} from "./tool-constraints"

type ToolPermissionAction = "allow" | "deny"

export function derivePersonaStaticLearningToolPermissions(
  persona: PersonaDefinition,
): Record<ToolId, ToolPermissionAction> {
  return deriveStaticPersonaLearningToolPermissions(persona)
}
