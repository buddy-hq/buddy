import { z } from "zod"
import type { AgentConfigOption } from "@/state/chat-actions"

const agentNameSchema = z.string()

function parseTAgentName<T>(value: T): string | undefined {
  const parsed = agentNameSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function isSelectableAgent(agent: AgentConfigOption) {
  return agent.mode !== "subagent" && agent.hidden !== true
}

export function getSelectableAgents(agents: AgentConfigOption[]) {
  return agents.filter(isSelectableAgent)
}

export function resolveDefaultAgentName<T>(agents: AgentConfigOption[], configuredDefaultAgent: T) {
  const selectableAgents = getSelectableAgents(agents)
  const configuredName = parseTAgentName(configuredDefaultAgent)

  if (
    configuredName !== undefined &&
    selectableAgents.some((agent) => agent.name === configuredName)
  ) {
    return configuredName
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
