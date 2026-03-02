import { z } from "zod"
import { Config } from "../config/config.js"

type BuddyAgentRegistration = {
  key: string
  agent: z.input<typeof Config.Agent>
}

type RegisteredBuddyAgent = {
  key: string
  agent: Config.Agent
}

const registeredBuddyAgents = new Map<string, Config.Agent>()

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

function indexBuddyAgents(): Record<string, Config.Agent> {
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
