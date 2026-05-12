import { createBuildAgent, createSubagent } from "./agent-factories"
import { defineBuddyAgent } from "./register-buddy-agent"
import { BUDDY_SUBAGENTS } from "./subagent-manifest"
import type { BuddySubagentDefinition } from "./subagent-manifest"
import type { RegisteredBuddyAgent } from "./register-buddy-agent"
import type { BuddyPermissionInput } from "./agent-factories"

type OwnedToolPermissionMap = Record<string, "allow">

function subagentToolPermissions(
  definition: BuddySubagentDefinition,
): OwnedToolPermissionMap | undefined {
  const permissions = Object.fromEntries(
    (definition.tools ?? []).map((tool) => [tool.id, "allow" as const]),
  )

  return Object.keys(permissions).length > 0 ? permissions : undefined
}

function mergeOwnedToolPermissions(
  permission: BuddyPermissionInput | undefined,
  ownedToolPermissions: OwnedToolPermissionMap | undefined,
): BuddyPermissionInput | undefined {
  if (!ownedToolPermissions) {
    return permission
  }

  if (!permission) {
    return ownedToolPermissions
  }

  if (typeof permission === "string") {
    return {
      "*": permission,
      ...ownedToolPermissions,
    }
  }

  return {
    ...permission,
    ...ownedToolPermissions,
  }
}

function createRegisteredBuddySubagent(definition: BuddySubagentDefinition): RegisteredBuddyAgent {
  const { key, kind, prompt, description, permission } = definition

  const agentInput = {
    prompt,
    description,
    permission: mergeOwnedToolPermissions(permission, subagentToolPermissions(definition)),
  }

  return defineBuddyAgent({
    key,
    agent: kind === "build" ? createBuildAgent(agentInput) : createSubagent(agentInput),
  })
}

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

function listBuddySubagents(): RegisteredBuddyAgent[] {
  const subagents = BUDDY_SUBAGENTS.map((definition) => createRegisteredBuddySubagent(definition))
  assertUniqueBuddyAgentKeys(subagents)
  return subagents
}

function indexBuddySubagents(): Record<string, RegisteredBuddyAgent["agent"]> {
  return Object.fromEntries(listBuddySubagents().map(({ key, agent }) => [key, agent]))
}

export { indexBuddySubagents, listBuddySubagents }
