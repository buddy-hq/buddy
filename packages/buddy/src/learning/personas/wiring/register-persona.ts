import type { DefinedBuddyPersona } from "./define-buddy-persona"

function ensureUniquePersonaIDs(personas: readonly DefinedBuddyPersona[]): void {
  const seenPersonaIDs = new Set<string>()
  for (const persona of personas) {
    if (seenPersonaIDs.has(persona.id)) {
      throw new Error(`Duplicate Buddy persona id "${persona.id}"`)
    }
    seenPersonaIDs.add(persona.id)
  }
}

export function registerPersona<const TPersonas extends readonly DefinedBuddyPersona[]>(input: {
  personas: TPersonas
}): TPersonas {
  if (input.personas.length === 0) {
    throw new Error("At least one Buddy persona must be registered")
  }

  ensureUniquePersonaIDs(input.personas)
  return input.personas
}
