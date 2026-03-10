import { builtinBuddyPersonas } from "./registry"
import { PERSONAS } from "./types"
import type {
  BuddyPersonaCatalogEntry,
  BuddyPersona,
  BuddyPersonaOverride,
  BuddyPersonaProfile,
} from "./types"

type BuddyPersonaOverrides = Partial<Record<BuddyPersona, BuddyPersonaOverride>>

function applyPersonaOverride(
  base: BuddyPersonaProfile,
  override: BuddyPersonaOverride | undefined,
): BuddyPersonaProfile {
  if (!override) return base

  return {
    ...base,
    ...(override.label ? { label: override.label } : {}),
    ...(override.description ? { description: override.description } : {}),
    ...(override.surfaces ? { surfaces: [...override.surfaces] } : {}),
    ...(override.defaultSurface ? { defaultSurface: override.defaultSurface } : {}),
    ...(typeof override.hidden === "boolean" ? { hidden: override.hidden } : {}),
  }
}

// TODO: Refactor to use iteration over PERSONAS instead of hardcoding each persona.
// This violates the Open/Closed Principle - adding a new persona requires editing this file.
export function resolveBuddyPersonaProfiles(
  overrides?: BuddyPersonaOverrides,
): Record<BuddyPersona, BuddyPersonaProfile> {
  const builtins = builtinBuddyPersonas()

  return {
    buddy: applyPersonaOverride(builtins.buddy, overrides?.buddy),
    "code-buddy": applyPersonaOverride(builtins["code-buddy"], overrides?.["code-buddy"]),
    "math-buddy": applyPersonaOverride(builtins["math-buddy"], overrides?.["math-buddy"]),
  }
}

export function listBuddyPersonas(overrides?: BuddyPersonaOverrides): BuddyPersonaProfile[] {
  return Object.values(resolveBuddyPersonaProfiles(overrides))
    .filter((persona) => !persona.hidden)
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function getBuddyPersona(personaID: BuddyPersona, overrides?: BuddyPersonaOverrides): BuddyPersonaProfile {
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

  const visible = PERSONAS.map((personaID) => profiles[personaID]).find((persona) => !persona.hidden)
  if (visible) {
    return visible
  }

  throw new Error("At least one Buddy persona must remain visible")
}

export function personaCatalogEntries(overrides?: BuddyPersonaOverrides): BuddyPersonaCatalogEntry[] {
  return listBuddyPersonas(overrides).map((persona) => ({
    id: persona.id,
    label: persona.label,
    description: persona.description,
    surfaces: [...persona.surfaces],
    defaultSurface: persona.defaultSurface,
    hidden: persona.hidden,
  }))
}
