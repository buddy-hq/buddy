import type { Persona, PrimaryUse } from "../../shared/teaching-vocabulary"

const PRIMARY_USE_DEFAULT_PERSONAS = {
  learn: "buddy",
  teach: "teaching-buddy",
} as const satisfies Record<PrimaryUse, Persona>

function resolvePreferredBuddyPersona(input?: {
  defaultPersona?: Persona
  primaryUse?: PrimaryUse
}): Persona {
  if (input?.defaultPersona) return input.defaultPersona
  if (input?.primaryUse) return PRIMARY_USE_DEFAULT_PERSONAS[input.primaryUse]
  return "buddy"
}

export { PRIMARY_USE_DEFAULT_PERSONAS, resolvePreferredBuddyPersona }
