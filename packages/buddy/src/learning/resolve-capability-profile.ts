import {
  SUBAGENT_IDS,
  type WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { Config } from "@buddy/backend/config"
import type { PersonaDefinition, RuntimeProfile } from "./shared/runtime-types"
import { compileRuntimeLearningToolPermissions } from "./tools/tool-permission-compiler"

function createDenySubagentMap(): RuntimeProfile["capabilityEnvelope"]["subagents"] {
  const subagents = {} as RuntimeProfile["capabilityEnvelope"]["subagents"]
  for (const subagentId of SUBAGENT_IDS) {
    subagents[subagentId] = "deny"
  }
  return subagents
}

function buildEffectiveSubagents(
  persona: PersonaDefinition,
): RuntimeProfile["capabilityEnvelope"]["subagents"] {
  const subagents = createDenySubagentMap()

  for (const [subagentId, access] of Object.entries(persona.subagents)) {
    if (!access || access === "inherit") continue
    subagents[subagentId as keyof typeof subagents] = access
  }

  return subagents
}

export function resolveCapabilityProfile(input: {
  persona: PersonaDefinition
  workspaceState: WorkspaceState
  configuredToolToggles?: Config.Info["tools"]
}): RuntimeProfile {
  const runtimePermissions = compileRuntimeLearningToolPermissions({
    persona: input.persona,
    workspaceState: input.workspaceState,
    configuredToolToggles: input.configuredToolToggles,
  })
  const subagents = buildEffectiveSubagents(input.persona)

  return {
    persona: input.persona.id,
    capabilityEnvelope: {
      visibleSurfaces: [...input.persona.surfaces],
      defaultSurface: input.persona.defaultSurface,
      tools: runtimePermissions.tools,
      subagents,
      skills: runtimePermissions.skills,
    },
  }
}
