import { indexBuiltinBuddyPersonaProfiles } from "./definitions"
import type { BuddyPersona, BuddyPersonaProfile } from "./types"

const BUILTIN_BUDDY_PERSONAS = indexBuiltinBuddyPersonaProfiles() as Record<
  BuddyPersona,
  BuddyPersonaProfile
>

function cloneBuddyPersonaProfile(input: BuddyPersonaProfile): BuddyPersonaProfile {
  return {
    ...input,
    surfaces: [...input.surfaces],
    toolDefaults: { ...input.toolDefaults },
    subagentDefaults: { ...input.subagentDefaults },
    contextPolicy: { ...input.contextPolicy },
  }
}

export function builtinBuddyPersonas(): Record<BuddyPersona, BuddyPersonaProfile> {
  return Object.fromEntries(
    Object.entries(BUILTIN_BUDDY_PERSONAS).map(([personaID, profile]) => [
      personaID,
      cloneBuddyPersonaProfile(profile),
    ]),
  ) as Record<BuddyPersona, BuddyPersonaProfile>
}

export { BUILTIN_BUDDY_PERSONAS }
