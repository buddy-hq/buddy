import type { Config } from "@buddy/backend/config"
import type { Persona, Surface } from "../shared/teaching-vocabulary"
import type { DefinedBuddyFeature } from "../runtime/define-buddy-feature"
import type { ResolvedSessionRuntime, TeachingWorkspaceState } from "./types"
import { buildResolvedSessionRuntime } from "./build-runtime-permissions"
import { enabledBuddyFeatures } from "./feature-availability"

function resolveSessionRuntime(input: {
  persona: {
    id: Persona
    features: readonly DefinedBuddyFeature[]
    defaultSurface: Surface
  }
  teachingWorkspaceState: TeachingWorkspaceState
  config: Config.Info
}): ResolvedSessionRuntime {
  const { defaultSurface } = input.persona
  const features = enabledBuddyFeatures(input.persona.features, input.config)

  const runtime = buildResolvedSessionRuntime({
    features,
    teachingWorkspaceState: input.teachingWorkspaceState,
    configuredToolToggles: input.config.tools,
  })

  if (!runtime.visibleSurfaces.includes(defaultSurface)) {
    throw new Error(
      `Persona "${input.persona.id}" defaultSurface "${defaultSurface}" must exist in derived feature surfaces`,
    )
  }

  return {
    persona: input.persona.id,
    teachingWorkspaceState: input.teachingWorkspaceState,
    enabledFeatureIDs: features.map((feature) => feature.id),
    access: {
      tools: runtime.tools,
      skills: runtime.skills,
      subagents: runtime.subagents,
    },
    ui: {
      visibleSurfaces: runtime.visibleSurfaces,
      defaultSurface,
    },
  }
}

export { resolveSessionRuntime }
