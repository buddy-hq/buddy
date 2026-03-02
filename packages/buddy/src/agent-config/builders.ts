import { z } from "zod"
import { Config } from "../config/config.js"

type BuddyAgentInput = z.input<typeof Config.Agent>
type BuddyAgentAuthoring = Config.AgentAuthoring
type BuddyPermissionRuleInput = z.input<typeof Config.PermissionRule>
type BuddyPermissionInput = Config.PermissionAuthoring

type BaseAgentDefinition = Omit<BuddyAgentAuthoring, "mode" | "permission"> & {
  permission?: BuddyPermissionInput
}

export type PrimaryAgentDefinition = BaseAgentDefinition & {
  availableSubagents?: readonly string[]
}

export type SubagentDefinition = BaseAgentDefinition
export type DefinedPrimaryAgent = Omit<PrimaryAgentDefinition, "availableSubagents"> & {
  mode: "primary"
}
export type DefinedSubagent = SubagentDefinition & {
  mode: "subagent"
}

function taskPermission(availableSubagents: readonly string[] | undefined): BuddyPermissionRuleInput | undefined {
  if (availableSubagents === undefined) return undefined
  if (availableSubagents.length === 0) return "deny"

  return {
    "*": "deny",
    ...Object.fromEntries(availableSubagents.map((agent) => [agent, "allow" as const])),
  }
}

function mergePermission(
  permission: BuddyPermissionInput | undefined,
  task: BuddyPermissionRuleInput | undefined,
): BuddyPermissionInput | undefined {
  if (task === undefined) return permission
  if (permission === undefined) {
    return { task }
  }

  if (typeof permission === "string") {
    return {
      "*": permission,
      task,
    }
  }

  return {
    ...permission,
    task,
  }
}

export function definePrimaryAgent(input: PrimaryAgentDefinition): DefinedPrimaryAgent {
  const { availableSubagents, permission, ...agent } = input

  return {
    ...agent,
    mode: "primary",
    permission: mergePermission(permission, taskPermission(availableSubagents)),
  }
}

export function defineSubagent(input: SubagentDefinition): DefinedSubagent {
  return {
    ...input,
    mode: "subagent",
  }
}
