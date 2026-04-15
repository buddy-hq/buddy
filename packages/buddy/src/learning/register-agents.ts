import { builtinBuddyPersonaAgents } from "./personas/runtime-agents"
import type { RegisteredBuddyAgent } from "./register-buddy-agent"
import { listBuddySubagents } from "./runtime-subagents"

const BUDDY_AGENTS = [
  ...builtinBuddyPersonaAgents(),
  ...listBuddySubagents(),
] as const satisfies readonly RegisteredBuddyAgent[]

function duplicateBuddyAgentKeys(agents: readonly RegisteredBuddyAgent[]): string[] {
  const counts = new Map<string, number>()

  for (const { key } of agents) {
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .toSorted((left, right) => left.localeCompare(right))
}

function assertUniqueBuddyAgentKeys(agents: readonly RegisteredBuddyAgent[]): void {
  const duplicates = duplicateBuddyAgentKeys(agents)
  if (duplicates.length === 0) {
    return
  }

  throw new Error(`Duplicate Buddy agent keys detected: ${duplicates.join(", ")}`)
}

assertUniqueBuddyAgentKeys(BUDDY_AGENTS)

function listBuddyAgents(): readonly RegisteredBuddyAgent[] {
  return BUDDY_AGENTS
}

function indexBuddyAgents(): Record<string, RegisteredBuddyAgent["agent"]> {
  return Object.fromEntries(BUDDY_AGENTS.map(({ key, agent }) => [key, agent]))
}

export { indexBuddyAgents, listBuddyAgents }
