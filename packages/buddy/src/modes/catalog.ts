import { builtinBuddyModes } from "./registry.js"
import { BUDDY_MODE_IDS } from "./types.js"
import type { BuddyModeCatalogEntry, BuddyModeID, BuddyModeOverride, BuddyModeProfile } from "./types.js"

type BuddyModeOverrides = Partial<Record<BuddyModeID, BuddyModeOverride>>

function applyModeOverride(base: BuddyModeProfile, override: BuddyModeOverride | undefined): BuddyModeProfile {
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

export function resolveBuddyModeProfiles(overrides?: BuddyModeOverrides): Record<BuddyModeID, BuddyModeProfile> {
  const builtins = builtinBuddyModes()

  return {
    buddy: applyModeOverride(builtins.buddy, overrides?.buddy),
    "code-buddy": applyModeOverride(builtins["code-buddy"], overrides?.["code-buddy"]),
    "math-buddy": applyModeOverride(builtins["math-buddy"], overrides?.["math-buddy"]),
  }
}

export function listBuddyModes(overrides?: BuddyModeOverrides): BuddyModeProfile[] {
  return Object.values(resolveBuddyModeProfiles(overrides))
    .filter((mode) => !mode.hidden)
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function getBuddyMode(modeID: BuddyModeID, overrides?: BuddyModeOverrides): BuddyModeProfile {
  return resolveBuddyModeProfiles(overrides)[modeID]
}

export function getDefaultBuddyMode(input?: {
  defaultMode?: BuddyModeID
  overrides?: BuddyModeOverrides
}): BuddyModeProfile {
  const profiles = resolveBuddyModeProfiles(input?.overrides)

  if (input?.defaultMode) {
    return profiles[input.defaultMode]
  }

  const visible = BUDDY_MODE_IDS.map((modeID) => profiles[modeID]).find((mode) => !mode.hidden)
  if (visible) {
    return visible
  }

  throw new Error("At least one Buddy mode must remain visible")
}

export function modeCatalogEntries(overrides?: BuddyModeOverrides): BuddyModeCatalogEntry[] {
  return listBuddyModes(overrides).map((mode) => ({
    id: mode.id,
    label: mode.label,
    description: mode.description,
    surfaces: [...mode.surfaces],
    defaultSurface: mode.defaultSurface,
    hidden: mode.hidden,
  }))
}
