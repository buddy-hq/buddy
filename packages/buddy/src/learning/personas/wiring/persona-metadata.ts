import type { Persona as BuddyPersona } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { PrimaryUse } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { PersonaCatalogEntry, PersonaOverride } from "../../shared/runtime-types"
import type { PersonaSurface } from "../../shared/teaching-vocabulary"
import { resolvePreferredBuddyPersona } from "./default-persona"
import { DEVELOPMENT_PERSONAS_ENABLED, personaIsAvailable } from "./persona-availability"

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
  code: {
    id: "code",
    label: "Code",
    description: "OpenCode's coding persona with Buddy capabilities.",
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
  developmentPersonasEnabled = DEVELOPMENT_PERSONAS_ENABLED,
): Record<BuddyPersona, BuddyPersonaMetadata> {
  const profiles = Object.fromEntries(
    BUILTIN_BUDDY_PERSONA_IDS.map((personaID) => [
      personaID,
      cloneBuddyPersonaMetadata(BUILTIN_BUDDY_PERSONA_METADATA[personaID]),
    ]),
  ) as Record<BuddyPersona, BuddyPersonaMetadata>

  for (const personaID of BUILTIN_BUDDY_PERSONA_IDS) {
    const override = overrides?.[personaID]
    if (override) {
      const base = profiles[personaID]
      profiles[personaID] = Object.assign(
        Object.assign(
          { ...base },
          override.label ? { label: override.label } : undefined,
          override.description ? { description: override.description } : undefined,
          override.surfaces ? { surfaces: [...override.surfaces] } : undefined,
        ),
        override.defaultSurface ? { defaultSurface: override.defaultSurface } : undefined,
        typeof override.hidden === "boolean" ? { hidden: override.hidden } : undefined,
      )
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

function getDefaultBuddyPersonaMetadata(input?: {
  defaultPersona?: BuddyPersona
  primaryUse?: PrimaryUse
  overrides?: BuddyPersonaOverrides
  developmentPersonasEnabled?: boolean
}): BuddyPersonaMetadata {
  const profiles = resolveBuddyPersonaMetadata(input?.overrides, input?.developmentPersonasEnabled)
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
  developmentPersonasEnabled?: boolean
}): PersonaCatalogEntry[] {
  const profiles = resolveBuddyPersonaMetadata(input?.overrides, input?.developmentPersonasEnabled)
  const defaultPersona = getDefaultBuddyPersonaMetadata(input)
  const visiblePersonas = BUILTIN_BUDDY_PERSONA_IDS.map((personaID) => profiles[personaID]).filter(
    (persona) => !persona.hidden,
  )

  return [defaultPersona, ...visiblePersonas.filter((persona) => persona.id !== defaultPersona.id)]
}

export {
  BUILTIN_BUDDY_PERSONA_METADATA,
  getDefaultBuddyPersonaMetadata,
  personaCatalogEntries,
  resolveBuddyPersonaMetadata,
}

export type { BuddyPersonaMetadata }
