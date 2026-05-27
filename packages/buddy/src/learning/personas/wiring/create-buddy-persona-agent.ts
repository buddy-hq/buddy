import { createBuildAgent, createPrimaryAgent } from "../../agent-factories"
import { defineBuddyAgent } from "../../register-buddy-agent"
import type { BuddyTool } from "../../runtime/create-buddy-tool"
import type { DefinedBuddyFeature } from "../../runtime/define-buddy-feature"
import type { DefinedBuddyPersona } from "./define-buddy-persona"

type DynamicToolDenyPermission = Record<string, "deny">

function collectDynamicTools(
  feature: DefinedBuddyFeature,
): BuddyTool[] {
  return [
    ...feature.tools,
    ...feature.subagents.flatMap((subagent) => subagent.tools ?? []),
  ].filter((tool) => Boolean(tool.dynamic))
}

function dynamicToolDenyPermission(
  definition: DefinedBuddyPersona,
): DynamicToolDenyPermission | undefined {
  const permissions = Object.fromEntries(
    definition.features.flatMap((feature) =>
      collectDynamicTools(feature).map((tool) => [tool.id, "deny" as const]),
    ),
  )

  return Object.keys(permissions).length > 0 ? permissions : undefined
}

function resolvePersonaAvailableSubagents(definition: DefinedBuddyPersona): string[] {
  return definition.runtime.subagents ? Object.keys(definition.runtime.subagents) : []
}

function createBuddyPersonaAgent(definition: DefinedBuddyPersona) {
  const { runtime, ...profile } = definition
  const { kind, subagents: _subagents, ...runtimeAgent } = runtime
  const agentInput = {
    ...runtimeAgent,
    description: runtimeAgent.description ?? profile.description,
    prompt: runtimeAgent.prompt.trim(),
    availableSubagents: resolvePersonaAvailableSubagents(definition),
  }
  const dynamicToolPermission = dynamicToolDenyPermission(definition)

  return defineBuddyAgent({
    key: profile.id,
    agent:
      kind === "build"
        ? createBuildAgent(agentInput, dynamicToolPermission)
        : createPrimaryAgent(agentInput, dynamicToolPermission),
  })
}

export { createBuddyPersonaAgent }
