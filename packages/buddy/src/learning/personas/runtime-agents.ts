import { createBuildAgent, createPrimaryAgent } from "../agent-factories"
import { defineBuddyAgent } from "../register-buddy-agent"
import { BUILTIN_BUDDY_PERSONA_DEFINITIONS } from "./definitions"
import type { BuiltinBuddyPersonaDefinition } from "./definitions"

function availableSubagentsFromDefaults(
  subagentDefaults: BuiltinBuddyPersonaDefinition["subagentDefaults"],
): string[] {
  return Object.entries(subagentDefaults)
    .filter(([, access]) => access === "allow" || access === "prefer")
    .map(([subagentID]) => subagentID)
}

function createBuddyPersonaAgent(definition: BuiltinBuddyPersonaDefinition) {
  const { runtime, ...profile } = definition
  const { kind, ...runtimeAgent } = runtime
  const agentInput = {
    ...runtimeAgent,
    description: runtimeAgent.description ?? profile.description,
    prompt: runtimeAgent.prompt.trim(),
    availableSubagents: availableSubagentsFromDefaults(profile.subagentDefaults),
  }

  return defineBuddyAgent({
    key: profile.id,
    agent: kind === "build" ? createBuildAgent(agentInput) : createPrimaryAgent(agentInput),
  })
}

function builtinBuddyPersonaAgents() {
  return BUILTIN_BUDDY_PERSONA_DEFINITIONS.map((definition) => createBuddyPersonaAgent(definition))
}

export { builtinBuddyPersonaAgents, createBuddyPersonaAgent }
