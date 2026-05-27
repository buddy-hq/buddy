import { REGISTERED_BUDDY_PERSONAS } from "../registry"
import type { DefinedBuddyPersona } from "./define-buddy-persona"
import { createBuddyPersonaAgent } from "./create-buddy-persona-agent"

type BuiltinBuddyPersonaDefinition = (typeof REGISTERED_BUDDY_PERSONAS)[number]

export function builtinBuddyPersonaAgents() {
  return REGISTERED_BUDDY_PERSONAS.map((definition) => createBuddyPersonaAgent(definition))
}

export const BUILTIN_BUDDY_PERSONA_DEFINITIONS = REGISTERED_BUDDY_PERSONAS

export type { BuiltinBuddyPersonaDefinition, DefinedBuddyPersona }
