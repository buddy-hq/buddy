import { z } from "zod"
import { Config } from "../config/config.js"

type BuddyAgentAuthoring = z.input<typeof Config.Agent>
type BuddyPermissionRuleInput = Config.PermissionRule
type BuddyPermissionInput = Config.PermissionAction | Record<string, Config.PermissionRule>
type AgentMode = "primary" | "subagent"

type BaseAgentDefinition = Omit<BuddyAgentAuthoring, "mode" | "permission"> & {
  permission?: BuddyPermissionInput
}

type PrimaryAgentDefinition = BaseAgentDefinition & {
  availableSubagents?: readonly string[]
}

type SubagentDefinition = BaseAgentDefinition
type DefinedPrimaryAgent = Omit<PrimaryAgentDefinition, "availableSubagents"> & {
  mode: "primary"
}
type DefinedSubagent = SubagentDefinition & {
  mode: "subagent"
}
type CoreAgentDefinition = BaseAgentDefinition & {
  mode?: AgentMode
  availableSubagents?: readonly string[]
}

const BUILD_AGENT_PERMISSION_DELTA: BuddyPermissionInput = {
  question: "allow",
  plan_enter: "allow",
}

const PLAN_AGENT_PERMISSION_DELTA: BuddyPermissionInput = {
  question: "allow",
  plan_exit: "allow",
  edit: {
    "*": "deny",
    ".opencode/plans/*.md": "allow",
  },
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

function mergePermissionPreset(
  preset: BuddyPermissionInput,
  permission: BuddyPermissionInput | undefined,
): BuddyPermissionInput {
  if (permission === undefined) return preset

  if (typeof preset === "string") {
    return mergePermission(permission, preset) ?? permission
  }

  if (typeof permission === "string") {
    return {
      ...preset,
      "*": permission,
    }
  }

  return {
    ...preset,
    ...permission,
  }
}

function defineAgentWithMode(input: CoreAgentDefinition): DefinedPrimaryAgent | DefinedSubagent {
  if (input.mode === "subagent") {
    const { mode: _mode, availableSubagents: _availableSubagents, ...agent } = input
    return createSubagent(agent)
  }

  const { mode: _mode, ...agent } = input
  return createPrimaryAgent(agent)
}

function createPrimaryAgent(input: PrimaryAgentDefinition): DefinedPrimaryAgent {
  const { availableSubagents, permission, ...agent } = input

  return {
    ...agent,
    mode: "primary",
    permission: mergePermission(permission, taskPermission(availableSubagents)),
  }
}

function createSubagent(input: SubagentDefinition): DefinedSubagent {
  return {
    ...input,
    mode: "subagent",
  }
}

function createBuildAgent(input: CoreAgentDefinition): DefinedPrimaryAgent | DefinedSubagent {
  return defineAgentWithMode({
    ...input,
    permission: mergePermissionPreset(BUILD_AGENT_PERMISSION_DELTA, input.permission),
  })
}

function createPlanAgent(input: CoreAgentDefinition): DefinedPrimaryAgent | DefinedSubagent {
  return defineAgentWithMode({
    ...input,
    permission: mergePermissionPreset(PLAN_AGENT_PERMISSION_DELTA, input.permission),
  })
}

export {
  createBuildAgent,
  createPlanAgent,
  createPrimaryAgent,
  createSubagent,
}

export type {
  CoreAgentDefinition,
  DefinedPrimaryAgent,
  DefinedSubagent,
  PrimaryAgentDefinition,
  SubagentDefinition,
}
