import type { Intent, WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type {
  ActivityBundleDefinition,
  PersonaDefinition,
} from "../../../shared/runtime-types"
import { BUNDLED_ACTIVITY_BUNDLES } from "./data"

function bundleMatchesIntent(bundle: ActivityBundleDefinition, intent: Intent) {
  return intent === "auto" || bundle.intent === intent
}

function bundleMatchesPersona(bundle: ActivityBundleDefinition, persona: PersonaDefinition) {
  return bundle.personas.includes(persona.id)
}

function bundleMatchesWorkspace(bundle: ActivityBundleDefinition, workspaceState: WorkspaceState) {
  return !bundle.workspaceStates || bundle.workspaceStates.includes(workspaceState)
}

export function resolveMatchingBundles(input: {
  persona: PersonaDefinition
  intent: Intent
  workspaceState: WorkspaceState
}): ActivityBundleDefinition[] {
  return BUNDLED_ACTIVITY_BUNDLES
    .filter((bundle) => bundleMatchesPersona(bundle, input.persona))
    .filter((bundle) => bundleMatchesIntent(bundle, input.intent))
    .filter((bundle) => bundleMatchesWorkspace(bundle, input.workspaceState))
}
