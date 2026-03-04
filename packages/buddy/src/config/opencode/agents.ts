import { mergeDeep } from "remeda"
import { resolveBuddyModeProfiles } from "../../modes/catalog.js"
import type { BuddyModeID } from "../../modes/types.js"
import { isBuddyModeID } from "../../modes/types.js"
import { indexBuddyAgents } from "../../agent-kit/buddy-agents.js"
import { Config } from "../config.js"

function mergeBuddyAgentConfig(base: Config.Agent, override: Config.Agent): Config.Agent {
  const merged: Config.Agent = {
    ...base,
    ...override,
  }

  merged.steps = override.steps ?? base.steps
  merged.maxSteps = override.maxSteps ?? base.maxSteps

  if (base.options || override.options) {
    merged.options = mergeDeep(base.options ?? {}, override.options ?? {})
  }

  if (base.permission || override.permission) {
    merged.permission = mergePermissionConfig(base.permission ?? {}, override.permission ?? {})
  }

  return merged
}

function permissionRuleEntries(rule: Config.PermissionRule): Array<[string, Config.PermissionAction]> {
  if (typeof rule === "string") {
    return [["*", rule]]
  }

  return Object.entries(rule)
}

function mergePermissionRule(base: Config.PermissionRule, override: Config.PermissionRule): Config.PermissionRule {
  const ordered = new Map<string, Config.PermissionAction>()

  for (const [pattern, action] of [...permissionRuleEntries(base), ...permissionRuleEntries(override)]) {
    if (ordered.has(pattern)) {
      ordered.delete(pattern)
    }
    ordered.set(pattern, action)
  }

  if (ordered.size === 1) {
    const wildcard = ordered.get("*")
    if (wildcard) {
      return wildcard
    }
  }

  return Object.fromEntries(ordered)
}

function mergePermissionConfig(base: Config.Permission, override: Config.Permission): Config.Permission {
  const merged: Config.Permission = { ...base }

  for (const [permission, rule] of Object.entries(override)) {
    const existing = merged[permission]
    merged[permission] = existing ? mergePermissionRule(existing, rule) : rule
  }

  return merged
}

function mergeBuddyAndConfiguredAgents(agentOverlay: Record<string, Config.Agent>): Record<string, Config.Agent> {
  const merged = indexBuddyAgents()

  for (const [name, agent] of Object.entries(agentOverlay)) {
    const baseAgent = merged[name]
    const nextAgent =
      baseAgent && isBuddyModeID(name)
        ? (() => {
            const { disable: _disable, ...rest } = agent
            return rest as Config.Agent
          })()
        : agent
    merged[name] = baseAgent ? mergeBuddyAgentConfig(baseAgent, nextAgent) : nextAgent
  }

  return merged
}

function applyBuddyModeHiddenFlags(
  agentOverlay: Record<string, Config.Agent>,
  modeOverrides?: Partial<Record<BuddyModeID, { hidden?: boolean }>>,
): Record<string, Config.Agent> {
  const next = { ...agentOverlay }
  const profiles = resolveBuddyModeProfiles(modeOverrides)

  for (const mode of Object.values(profiles)) {
    if (!mode.hidden) continue
    const agent = next[mode.runtimeAgent]
    if (!agent) continue
    next[mode.runtimeAgent] = {
      ...agent,
      hidden: true,
    }
  }

  return next
}

function resolveConfiguredAgentKey(
  name: string,
  agentOverlay: Record<string, Config.Agent>,
): string {
  if (name in agentOverlay) {
    return name
  }

  const matches = Object.entries(agentOverlay)
    .filter(([, agent]) => agent.name === name)
    .map(([key]) => key)

  return matches.length === 1 ? matches[0]! : name
}

export {
  applyBuddyModeHiddenFlags,
  mergeBuddyAndConfiguredAgents,
  resolveConfiguredAgentKey,
}
