import { createBuildAgent, createPrimaryAgent } from "../../agent-factories"
import { defineBuddyAgent } from "../../register-buddy-agent"
import type { DefinedBuddyPersona } from "./define-buddy-persona"
import {
  BUILTIN_BUDDY_PERSONA_DEFINITIONS,
  type BuiltinBuddyPersonaDefinition,
  buildPersonaProfileFromDefinition,
} from "./persona-profiles"

function resolvePersonaAvailableSubagents(definition: BuiltinBuddyPersonaDefinition): string[] {
  if (definition.runtime.availableSubagents) {
    return [...definition.runtime.availableSubagents]
  }

  const personaProfile = buildPersonaProfileFromDefinition(definition)
  return Object.entries(personaProfile.subagents)
    .filter(([, access]) => access === "allow")
    .map(([subagentID]) => subagentID)
}

export function createBuddyPersonaAgent(definition: BuiltinBuddyPersonaDefinition) {
  const { runtime, ...profile } = definition
  const { kind, ...runtimeAgent } = runtime
  const availableSubagents = resolvePersonaAvailableSubagents(definition)

  const agentInput = {
    ...runtimeAgent,
    description: runtimeAgent.description ?? profile.description,
    prompt: runtimeAgent.prompt.trim(),
    availableSubagents,
  }

  return defineBuddyAgent({
    key: profile.id,
    agent: kind === "build" ? createBuildAgent(agentInput) : createPrimaryAgent(agentInput),
  })
}

export function builtinBuddyPersonaAgents() {
  return BUILTIN_BUDDY_PERSONA_DEFINITIONS.map((definition) => createBuddyPersonaAgent(definition))
}

export { BUILTIN_BUDDY_PERSONA_DEFINITIONS }

export type { BuiltinBuddyPersonaDefinition, DefinedBuddyPersona }
