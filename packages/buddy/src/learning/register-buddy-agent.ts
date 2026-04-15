import { Config } from "@buddy/backend/config/config"

type BuddyAgentConfigInput = Parameters<(typeof Config.Agent)["parse"]>[0]
type BuddyAgentConfig = ReturnType<(typeof Config.Agent)["parse"]>

type BuddyAgentDefinition = {
  key: string
  agent: BuddyAgentConfigInput
}

type RegisteredBuddyAgent = {
  key: string
  agent: BuddyAgentConfig
}

function defineBuddyAgent(input: BuddyAgentDefinition): RegisteredBuddyAgent {
  return {
    key: input.key,
    agent: Config.Agent.parse(input.agent),
  }
}

export { defineBuddyAgent }

export type { BuddyAgentDefinition, RegisteredBuddyAgent }
