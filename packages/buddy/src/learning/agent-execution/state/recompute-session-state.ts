import { readProjectConfig } from "@buddy/backend/config/runtime"
import { resolveSessionRuntime } from "../../access/resolve-session-runtime"
import { REGISTERED_BUDDY_PERSONAS } from "../../personas/registry"
import { getBuddyPersona } from "../../personas/wiring/persona-profiles"
import { resolveCurrentSurface } from "../../shared/targeting"
import type { TeachingSessionState } from "../../shared/teaching-session-state"

export async function recomputeTeachingSessionState(input: {
  directory: string
  state: TeachingSessionState
}): Promise<TeachingSessionState> {
  const projectConfig = await readProjectConfig(input.directory)
  const persona = getBuddyPersona(input.state.persona, projectConfig.personas)
  const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
    (definition) => definition.id === input.state.persona,
  )
  if (!personaDefinition) {
    throw new Error(`Unknown Buddy persona "${input.state.persona}"`)
  }

  const sessionRuntime = resolveSessionRuntime({
    persona: {
      id: persona.id,
      features: personaDefinition.features,
      defaultSurface: persona.defaultSurface,
    },
    teachingWorkspaceState: input.state.teachingWorkspaceState,
    configuredToolToggles: projectConfig.tools,
  })

  return {
    ...input.state,
    currentSurface: resolveCurrentSurface({
      personaID: input.state.persona,
      config: projectConfig,
      teachingWorkspaceState: input.state.teachingWorkspaceState,
    }),
    sessionRuntime,
  }
}
