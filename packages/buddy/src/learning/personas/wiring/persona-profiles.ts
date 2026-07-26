import type { Persona as BuddyPersona } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { PrimaryUse } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { Surface } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type {
  PersonaCatalogEntry as BuddyPersonaCatalogEntry,
  PersonaDefinition as BuddyPersonaProfile,
  PersonaOverride as BuddyPersonaOverride,
} from "../../shared/runtime-types"
import type { DefinedBuddyFeature } from "../../runtime/define-buddy-feature"
import { REGISTERED_BUDDY_PERSONAS } from "../registry"
import { resolvePreferredBuddyPersona } from "./default-persona"
import { DEVELOPMENT_PERSONAS_ENABLED, personaIsAvailable } from "./persona-availability"

const BUILTIN_BUDDY_PERSONA_DEFINITIONS = REGISTERED_BUDDY_PERSONAS

type BuiltinBuddyPersonaDefinition = (typeof BUILTIN_BUDDY_PERSONA_DEFINITIONS)[number]
type BuiltinBuddyPersonaID = BuiltinBuddyPersonaDefinition["id"]
type BuddyPersonaOverrides = Partial<Record<BuddyPersona, BuddyPersonaOverride>>

function derivePersonaSurfaces(features: readonly DefinedBuddyFeature[]): Surface[] {
  const surfaces = new Set<string>()
  for (const feature of features) {
    for (const surface of feature.surfaces) {
      surfaces.add(surface)
    }
  }
  return [...surfaces] as Surface[]
}

function derivePersonaTools(features: readonly DefinedBuddyFeature[]): Record<string, "allow"> {
  const tools: Record<string, "allow"> = {}
  for (const feature of features) {
    for (const tool of feature.tools) {
      if (tool.dynamic) continue
      tools[tool.id] = "allow"
    }
  }
  return tools
}

function derivePersonaDynamicTools(
  features: readonly DefinedBuddyFeature[],
): Record<string, "allow"> {
  const tools: Record<string, "allow"> = {}
  for (const feature of features) {
    for (const tool of feature.tools) {
      if (!tool.dynamic) continue
      tools[tool.id] = "allow"
    }
  }
  return tools
}

function derivePersonaSkills(features: readonly DefinedBuddyFeature[]): Record<string, "allow"> {
  const skills: Record<string, "allow"> = {}
  for (const feature of features) {
    for (const skill of feature.skills) {
      skills[skill.name] = "allow"
    }
  }
  return skills
}

function deriveFeaturePersonaSubagents(
  features: readonly DefinedBuddyFeature[],
): Record<string, "allow"> {
  const subagents: Record<string, "allow"> = {}
  for (const feature of features) {
    for (const subagent of feature.subagents) {
      if (!subagent.delegatable) continue
      subagents[subagent.key] = "allow"
    }
  }
  return subagents
}

function deriveRuntimePersonaSubagents(input: {
  runtime?: {
    subagents?: Partial<Record<string, true | { denyTools?: readonly string[] }>>
  }
  features: readonly DefinedBuddyFeature[]
}): Record<string, "allow"> {
  if (!input.runtime?.subagents) {
    return deriveFeaturePersonaSubagents(input.features)
  }

  return Object.fromEntries(
    Object.keys(input.runtime.subagents).map((subagentID) => [subagentID, "allow" as const]),
  )
}

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

function buildPersonaProfileFromDefinition(definition: {
  id: BuiltinBuddyPersonaID
  features: readonly DefinedBuddyFeature[]
  label: string
  description: string
  defaultSurface: Surface
  hidden: boolean
  runtime?: {
    subagents?: Partial<Record<string, true | { denyTools?: readonly string[] }>>
  }
  context: {
    attachCurriculum: boolean
    attachProgress: boolean
    attachTeachingWorkspace: boolean
    attachTeachingPolicy: boolean
    attachFigureContext: boolean
  }
}): BuddyPersonaProfile {
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    domain: "general",
    surfaces: derivePersonaSurfaces(definition.features),
    defaultSurface: definition.defaultSurface,
    hidden: definition.hidden,
    tools: {
      static: derivePersonaTools(definition.features),
      dynamic: derivePersonaDynamicTools(definition.features),
    },
    skills: derivePersonaSkills(definition.features),
    subagents: deriveRuntimePersonaSubagents(definition),
    context: { ...definition.context },
  }
}

const BUILTIN_BUDDY_PERSONAS = Object.fromEntries(
  BUILTIN_BUDDY_PERSONA_DEFINITIONS.map((definition) => {
    return [definition.id, buildPersonaProfileFromDefinition(definition)]
  }),
) as Record<BuddyPersona, BuddyPersonaProfile>

const BUILTIN_BUDDY_PERSONA_IDS = BUILTIN_BUDDY_PERSONA_DEFINITIONS.map(
  (definition) => definition.id,
) as readonly BuiltinBuddyPersonaID[]

function resolveBuddyPersonaProfiles(
  overrides?: BuddyPersonaOverrides,
  developmentPersonasEnabled = DEVELOPMENT_PERSONAS_ENABLED,
): Record<BuddyPersona, BuddyPersonaProfile> {
  const profiles = Object.fromEntries(
    Object.entries(BUILTIN_BUDDY_PERSONAS).map(([personaID, profile]) => [
      personaID,
      cloneBuddyPersonaProfile(profile),
    ]),
  ) as Record<BuddyPersona, BuddyPersonaProfile>

  for (const personaID of BUILTIN_BUDDY_PERSONA_IDS) {
    const override = overrides?.[personaID]
    if (override) {
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

    if (!personaIsAvailable(personaID, developmentPersonasEnabled)) {
      profiles[personaID] = {
        ...profiles[personaID],
        hidden: true,
      }
    }
  }

  return profiles
}

function listBuddyPersonas(
  overrides?: BuddyPersonaOverrides,
  developmentPersonasEnabled = DEVELOPMENT_PERSONAS_ENABLED,
): BuddyPersonaProfile[] {
  const profiles = resolveBuddyPersonaProfiles(overrides, developmentPersonasEnabled)
  return BUILTIN_BUDDY_PERSONA_IDS.map((personaID) => profiles[personaID]).filter(
    (persona) => !persona.hidden,
  )
}

function getBuddyPersona(
  personaID: BuddyPersona,
  overrides?: BuddyPersonaOverrides,
  developmentPersonasEnabled = DEVELOPMENT_PERSONAS_ENABLED,
): BuddyPersonaProfile {
  return resolveBuddyPersonaProfiles(overrides, developmentPersonasEnabled)[personaID]
}

function getDefaultBuddyPersona(input?: {
  defaultPersona?: BuddyPersona
  primaryUse?: PrimaryUse
  overrides?: BuddyPersonaOverrides
  developmentPersonasEnabled?: boolean
}): BuddyPersonaProfile {
  const profiles = resolveBuddyPersonaProfiles(input?.overrides, input?.developmentPersonasEnabled)
  const preferredPersona = profiles[resolvePreferredBuddyPersona(input)]

  if (!preferredPersona.hidden) {
    return preferredPersona
  }

  const firstVisiblePersona = BUILTIN_BUDDY_PERSONA_IDS.map(
    (personaID) => profiles[personaID],
  ).find((persona) => !persona.hidden)
  if (firstVisiblePersona) {
    return firstVisiblePersona
  }

  throw new Error("At least one Buddy persona must remain visible")
}

function personaCatalogEntries(
  overrides?: BuddyPersonaOverrides,
  developmentPersonasEnabled = DEVELOPMENT_PERSONAS_ENABLED,
): BuddyPersonaCatalogEntry[] {
  return listBuddyPersonas(overrides, developmentPersonasEnabled).map((persona) => ({
    id: persona.id,
    label: persona.label,
    description: persona.description,
    surfaces: [...persona.surfaces],
    defaultSurface: persona.defaultSurface,
    hidden: persona.hidden,
  }))
}

export {
  BUILTIN_BUDDY_PERSONA_DEFINITIONS,
  BUILTIN_BUDDY_PERSONAS,
  buildPersonaProfileFromDefinition,
  getBuddyPersona,
  getDefaultBuddyPersona,
  listBuddyPersonas,
  personaCatalogEntries,
  resolveBuddyPersonaProfiles,
}

export type { BuiltinBuddyPersonaDefinition }
