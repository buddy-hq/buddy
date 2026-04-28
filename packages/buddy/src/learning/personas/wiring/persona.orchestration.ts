import type { Persona as BuddyPersona } from "@buddy/backend/learning/shared/teaching-vocabulary"
import { createBuildAgent, createPrimaryAgent } from "../../agent-factories"
import { defineBuddyAgent } from "../../register-buddy-agent"
import type {
  PersonaCatalogEntry as BuddyPersonaCatalogEntry,
  PersonaDefinition as BuddyPersonaProfile,
  PersonaOverride as BuddyPersonaOverride,
} from "../../shared/runtime-types"
import { REGISTERED_BUDDY_PERSONAS } from "../registered-personas"
import type { DefinedBuddyPersona } from "./define-buddy-persona"

const BUILTIN_BUDDY_PERSONA_DEFINITIONS = REGISTERED_BUDDY_PERSONAS

type BuiltinBuddyPersonaDefinition = (typeof BUILTIN_BUDDY_PERSONA_DEFINITIONS)[number]
type BuiltinBuddyPersonaID = BuiltinBuddyPersonaDefinition["id"]
type BuddyPersonaOverrides = Partial<Record<BuddyPersona, BuddyPersonaOverride>>

const BUILTIN_BUDDY_PERSONA_IDS = BUILTIN_BUDDY_PERSONA_DEFINITIONS.map(
  (definition) => definition.id,
) as readonly BuiltinBuddyPersonaID[]

function cloneBuddyPersonaProfile(profile: BuddyPersonaProfile): BuddyPersonaProfile {
  return {
    ...profile,
    surfaces: [...profile.surfaces],
    tools: {
      static: { ...profile.tools.static },
      dynamic: { ...profile.tools.dynamic },
    },
    skills: { ...profile.skills },
    subagents: { ...profile.subagents },
    context: { ...profile.context },
  }
}

// Catalog lookups only need the profile fields; runtime config stays on the authored definitions.
const BUILTIN_BUDDY_PERSONAS = Object.fromEntries(
  BUILTIN_BUDDY_PERSONA_DEFINITIONS.map((definition) => {
    const { runtime: _runtime, ...profile } = definition
    return [
      definition.id,
      {
        ...profile,
        surfaces: [...profile.surfaces],
        tools: {
          static: { ...profile.tools.static },
          dynamic: { ...profile.tools.dynamic },
        },
        skills: { ...profile.skills },
        subagents: { ...profile.subagents },
        context: { ...profile.context },
      },
    ]
  }),
) as Record<BuddyPersona, BuddyPersonaProfile>

export function resolveBuddyPersonaProfiles(
  overrides?: BuddyPersonaOverrides,
): Record<BuddyPersona, BuddyPersonaProfile> {
  const profiles = Object.fromEntries(
    Object.entries(BUILTIN_BUDDY_PERSONAS).map(([personaID, profile]) => [
      personaID,
      cloneBuddyPersonaProfile(profile),
    ]),
  ) as Record<BuddyPersona, BuddyPersonaProfile>

  for (const personaID of BUILTIN_BUDDY_PERSONA_IDS) {
    const override = overrides?.[personaID]
    if (!override) {
      continue
    }

    const base = profiles[personaID]
    profiles[personaID] = {
      ...base,
      ...(override.label ? { label: override.label } : {}),
      ...(override.description ? { description: override.description } : {}),
      ...(override.surfaces ? { surfaces: [...override.surfaces] } : {}),
      ...(override.defaultSurface ? { defaultSurface: override.defaultSurface } : {}),
      ...(typeof override.hidden === "boolean" ? { hidden: override.hidden } : {}),
    }
  }

  return profiles
}

export function listBuddyPersonas(overrides?: BuddyPersonaOverrides): BuddyPersonaProfile[] {
  const profiles = resolveBuddyPersonaProfiles(overrides)
  return BUILTIN_BUDDY_PERSONA_IDS.map((personaID) => profiles[personaID]).filter(
    (persona) => !persona.hidden,
  )
}

export function getBuddyPersona(
  personaID: BuddyPersona,
  overrides?: BuddyPersonaOverrides,
): BuddyPersonaProfile {
  return resolveBuddyPersonaProfiles(overrides)[personaID]
}

export function getDefaultBuddyPersona(input?: {
  defaultPersona?: BuddyPersona
  overrides?: BuddyPersonaOverrides
}): BuddyPersonaProfile {
  const profiles = resolveBuddyPersonaProfiles(input?.overrides)

  if (input?.defaultPersona) {
    return profiles[input.defaultPersona]
  }

  const firstVisiblePersona = BUILTIN_BUDDY_PERSONA_IDS.map(
    (personaID) => profiles[personaID],
  ).find((persona) => !persona.hidden)
  if (firstVisiblePersona) {
    return firstVisiblePersona
  }

  throw new Error("At least one Buddy persona must remain visible")
}

export function personaCatalogEntries(
  overrides?: BuddyPersonaOverrides,
): BuddyPersonaCatalogEntry[] {
  return listBuddyPersonas(overrides).map((persona) => ({
    id: persona.id,
    label: persona.label,
    description: persona.description,
    surfaces: [...persona.surfaces],
    defaultSurface: persona.defaultSurface,
    hidden: persona.hidden,
  }))
}

export function createBuddyPersonaAgent(definition: BuiltinBuddyPersonaDefinition) {
  const { runtime, ...profile } = definition
  const { kind, ...runtimeAgent } = runtime
  const availableSubagents = Object.entries(profile.subagents)
    .filter(([, access]) => access === "allow" || access === "prefer")
    .map(([subagentID]) => subagentID)

  const agentInput = {
    ...runtimeAgent,
    description: runtimeAgent.description ?? profile.description,
    prompt: runtimeAgent.prompt.trim(),
    availableSubagents,
  }

  return defineBuddyAgent({
    key: profile.id,
    agent: kind === "build" ? createBuildAgent(agentInput) : createPrimaryAgent(agentInput),
  })
}

export function builtinBuddyPersonaAgents() {
  return BUILTIN_BUDDY_PERSONA_DEFINITIONS.map((definition) => createBuddyPersonaAgent(definition))
}

export { BUILTIN_BUDDY_PERSONA_DEFINITIONS, BUILTIN_BUDDY_PERSONAS }

export type { BuiltinBuddyPersonaDefinition, DefinedBuddyPersona }
