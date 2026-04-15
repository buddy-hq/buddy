import type { DefinedBuddyPersona } from "./define-buddy-persona"

export function registerPersona<const TPersonas extends readonly DefinedBuddyPersona[]>(
  input: { personas: TPersonas },
): TPersonas {
  return input.personas
}
