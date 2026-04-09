import type { AgentConfigOption } from "@/state/chat-actions"

export function isSelectableAgent(agent: AgentConfigOption) {
  return agent.mode !== "subagent" && agent.hidden !== true
}

export function getSelectableAgents(agents: AgentConfigOption[]) {
  return agents.filter(isSelectableAgent)
}

export function resolveDefaultAgentName(
  agents: AgentConfigOption[],
  configuredDefaultAgent: unknown,
) {
  const selectableAgents = getSelectableAgents(agents)

  if (
    typeof configuredDefaultAgent === "string" &&
    selectableAgents.some((agent) => agent.name === configuredDefaultAgent)
  ) {
    return configuredDefaultAgent
  }

  return selectableAgents[0]?.name
}

export function resolveCurrentAgent(input: {
  agents: AgentConfigOption[]
  selectedAgentName?: string
  defaultAgentName?: string
}) {
  const selectableAgents = getSelectableAgents(input.agents)

  return (
    selectableAgents.find(
      (agent) => agent.name === (input.selectedAgentName ?? input.defaultAgentName),
    ) ??
    selectableAgents.find((agent) => agent.name === input.defaultAgentName) ??
    selectableAgents[0]
  )
}
