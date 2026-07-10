import type { Persona as BuddyPersona } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { PrimaryUse } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { PersonaCatalogEntry, PersonaOverride } from "../../shared/runtime-types"
import type { PersonaSurface } from "../../shared/teaching-vocabulary"
import { resolvePreferredBuddyPersona } from "./default-persona"

type BuddyPersonaMetadata = {
  id: BuddyPersona
  label: string
  description: string
  surfaces: PersonaSurface[]
  defaultSurface: PersonaSurface
  hidden: boolean
}

type BuddyPersonaOverrides = Partial<Record<BuddyPersona, PersonaOverride>>

const BUILTIN_BUDDY_PERSONA_METADATA = {
  buddy: {
    id: "buddy",
    label: "Buddy",
    description: "The default Buddy persona for learning conversations and project help.",
    surfaces: ["curriculum", "flashcard", "question-set"],
    defaultSurface: "curriculum",
    hidden: false,
  },
  "teaching-buddy": {
    id: "teaching-buddy",
    label: "Teaching Buddy",
    description: "A planning and creation partner for teachers and educators.",
    surfaces: ["curriculum", "flashcard", "question-set"],
    defaultSurface: "curriculum",
    hidden: false,
  },
} as const satisfies Record<BuddyPersona, BuddyPersonaMetadata>

const BUILTIN_BUDDY_PERSONA_IDS = Object.keys(BUILTIN_BUDDY_PERSONA_METADATA) as BuddyPersona[]

function cloneBuddyPersonaMetadata(input: BuddyPersonaMetadata): BuddyPersonaMetadata {
  return {
    ...input,
    surfaces: [...input.surfaces],
  }
}

function resolveBuddyPersonaMetadata(
  overrides?: BuddyPersonaOverrides,
): Record<BuddyPersona, BuddyPersonaMetadata> {
  const profiles = Object.fromEntries(
    BUILTIN_BUDDY_PERSONA_IDS.map((personaID) => [
      personaID,
      cloneBuddyPersonaMetadata(BUILTIN_BUDDY_PERSONA_METADATA[personaID]),
    ]),
  ) as Record<BuddyPersona, BuddyPersonaMetadata>

  for (const personaID of BUILTIN_BUDDY_PERSONA_IDS) {
    const override = overrides?.[personaID]
    if (!override) continue

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

function getDefaultBuddyPersonaMetadata(input?: {
  defaultPersona?: BuddyPersona
  primaryUse?: PrimaryUse
  overrides?: BuddyPersonaOverrides
}): BuddyPersonaMetadata {
  const profiles = resolveBuddyPersonaMetadata(input?.overrides)
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

function personaCatalogEntries(input?: {
  defaultPersona?: BuddyPersona
  primaryUse?: PrimaryUse
  overrides?: BuddyPersonaOverrides
}): PersonaCatalogEntry[] {
  const profiles = resolveBuddyPersonaMetadata(input?.overrides)
  const defaultPersona = getDefaultBuddyPersonaMetadata(input)
  const visiblePersonas = BUILTIN_BUDDY_PERSONA_IDS.map((personaID) => profiles[personaID]).filter(
    (persona) => !persona.hidden,
  )

  return [
    defaultPersona,
    ...visiblePersonas.filter((persona) => persona.id !== defaultPersona.id),
  ]
}

export {
  BUILTIN_BUDDY_PERSONA_METADATA,
  getDefaultBuddyPersonaMetadata,
  personaCatalogEntries,
  resolveBuddyPersonaMetadata,
}

export type { BuddyPersonaMetadata }
