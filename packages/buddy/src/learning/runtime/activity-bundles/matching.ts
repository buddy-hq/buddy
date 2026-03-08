import type {
  ActivityBundleDefinition,
  PersonaDefinition,
  TeachingIntentId,
  WorkspaceState,
} from "../types.js"
import { BUNDLED_ACTIVITY_BUNDLES } from "./data.js"

function bundleMatchesIntent(bundle: ActivityBundleDefinition, intentOverride?: TeachingIntentId) {
  return !intentOverride || bundle.intent === intentOverride
}

function bundleMatchesPersona(bundle: ActivityBundleDefinition, persona: PersonaDefinition) {
  return bundle.personas.includes(persona.id)
}

function bundleMatchesWorkspace(bundle: ActivityBundleDefinition, workspaceState: WorkspaceState) {
  return !bundle.workspaceStates || bundle.workspaceStates.includes(workspaceState)
}

export function resolveMatchingBundles(input: {
  persona: PersonaDefinition
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
}): ActivityBundleDefinition[] {
  return BUNDLED_ACTIVITY_BUNDLES
    .filter((bundle) => bundleMatchesPersona(bundle, input.persona))
    .filter((bundle) => bundleMatchesIntent(bundle, input.intentOverride))
    .filter((bundle) => bundleMatchesWorkspace(bundle, input.workspaceState))
}
