import { Config } from "../config/config.js"

type BuddyAgentConfigInput = Parameters<(typeof Config.Agent)["parse"]>[0]
type BuddyAgentConfig = ReturnType<(typeof Config.Agent)["parse"]>

type BuddyAgentRegistration = {
  key: string
  agent: BuddyAgentConfigInput
}

type RegisteredBuddyAgent = {
  key: string
  agent: BuddyAgentConfig
}

const registeredBuddyAgents = new Map<string, BuddyAgentConfig>()

function registerBuddyAgent(input: BuddyAgentRegistration): RegisteredBuddyAgent {
  if (registeredBuddyAgents.has(input.key)) {
    throw new Error(`Buddy agent "${input.key}" is already registered`)
  }

  const agent = Config.Agent.parse(input.agent)
  registeredBuddyAgents.set(input.key, agent)

  return {
    key: input.key,
    agent,
  }
}

function listBuddyAgents(): readonly RegisteredBuddyAgent[] {
  return [...registeredBuddyAgents.entries()].map(([key, agent]) => ({
    key,
    agent,
  }))
}

function indexBuddyAgents(): Record<string, BuddyAgentConfig> {
  return Object.fromEntries(registeredBuddyAgents)
}

export {
  indexBuddyAgents,
  listBuddyAgents,
  registerBuddyAgent,
}

export type {
  BuddyAgentRegistration,
  RegisteredBuddyAgent,
}
