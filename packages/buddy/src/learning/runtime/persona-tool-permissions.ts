import type { PersonaDefinition, ToolId } from "../shared/runtime-types"
import { deriveStaticPersonaToolPermissions } from "./tool-permission-compiler"
export { toolMatchesRuntimeConstraints } from "./tool-constraints"

type ToolPermissionAction = "allow" | "deny"

export function deriveStaticPersonaToolPermissionsFromProfile(
  persona: PersonaDefinition,
): Record<ToolId, ToolPermissionAction> {
  return deriveStaticPersonaToolPermissions(persona)
}
