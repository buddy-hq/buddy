import { mergeDeep } from "remeda"
import {
  isPersona,
  type Persona as BuddyPersona,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import {
  getBuddyPersona,
  resolveBuddyPersonaProfiles,
} from "../../learning/personas/wiring/persona-profiles"
import { createBuddyPersonaAgent } from "../../learning/personas/wiring/create-buddy-persona-agent"
import { REGISTERED_BUDDY_PERSONAS } from "../../learning/personas/registry"
import { listBuddySubagents } from "../../learning/runtime-subagents"
import { deriveStaticPersonaToolPermissionsFromProfile } from "../../learning/runtime/persona-tool-permissions"
import { Config } from "../config.js"
import { parseConfigObject, parsePermissionAction } from "../parse-values.js"

function mergeBuddyAgentConfig(base: Config.Agent, override: Config.Agent): Config.Agent {
  const options =
    base.options || override.options
      ? mergeDeep(base.options ?? {}, override.options ?? {})
      : undefined
  const permission =
    base.permission || override.permission
      ? mergePermissionConfig(base.permission ?? {}, override.permission ?? {})
      : undefined

  return Object.assign(
    Object.assign(
      {
        ...base,
        ...override,
      },
      override.steps ?? base.steps !== undefined
        ? { steps: override.steps ?? base.steps }
        : undefined,
      override.maxSteps ?? base.maxSteps !== undefined
        ? { maxSteps: override.maxSteps ?? base.maxSteps }
        : undefined,
      options ? { options } : undefined,
    ),
    permission ? { permission } : undefined,
  )
}

function permissionRuleEntries(
  rule: Config.PermissionRule,
): Array<[string, Config.PermissionAction]> {
  const action = parsePermissionAction(rule)
  if (action !== undefined) {
    return [["*", action]]
  }

  const record = parseConfigObject(rule)
  if (record === undefined) return []

  const entries: Array<[string, Config.PermissionAction]> = []
  for (const [pattern, nested] of Object.entries(record)) {
    const nestedAction = parsePermissionAction(nested)
    if (nestedAction === undefined) continue
    entries.push([pattern, nestedAction])
  }
  return entries
}

function mergePermissionRule(
  base: Config.PermissionRule,
  override: Config.PermissionRule,
): Config.PermissionRule {
  const ordered = new Map<string, Config.PermissionAction>()

  for (const [pattern, action] of [
    ...permissionRuleEntries(base),
    ...permissionRuleEntries(override),
  ]) {
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

function mergePermissionConfig(
  base: Config.Permission,
  override: Config.Permission,
): Config.Permission {
  const merged = new Map<string, Config.PermissionRule>(Object.entries(base))

  for (const [permission, rule] of Object.entries(override)) {
    const existing = merged.get(permission)
    merged.set(permission, existing ? mergePermissionRule(existing, rule) : rule)
  }

  return Object.fromEntries(merged)
}

function mergeBuddyAndConfiguredAgents(
  agentOverlay: Record<string, Config.Agent>,
): Record<string, Config.Agent> {
  const merged = compileBuddyAgentOverlay()

  for (const [name, agent] of Object.entries(agentOverlay)) {
    const baseAgent = merged[name]
    const nextAgent = normalizeConfiguredAgentOverride(name, baseAgent, agent)
    merged[name] = baseAgent ? mergeBuddyAgentConfig(baseAgent, nextAgent) : nextAgent
  }

  return merged
}

function compileBuddyAgentOverlay(): Record<string, Config.Agent> {
  const personaAgents = REGISTERED_BUDDY_PERSONAS.map((definition) =>
    createBuddyPersonaAgent(definition),
  )
  const mergedAgents = Object.fromEntries(
    [...personaAgents, ...listBuddySubagents()].map(({ key, agent }) => [key, agent]),
  )

  return applyPersonaLearningToolPermissions(mergedAgents)
}

function removeDisableFlag(agent: Config.Agent) {
  const { disable: _disable, ...rest } = agent
  return rest
}

function normalizeConfiguredAgentOverride(
  name: string,
  baseAgent: Config.Agent | undefined,
  override: Config.Agent,
): Config.Agent {
  if (!baseAgent || !isPersona(name)) {
    return override
  }

  return removeDisableFlag(override)
}

function applyPersonaLearningToolPermissions(
  agentOverlay: Record<string, Config.Agent>,
) {
  const next = { ...agentOverlay }

  for (const [name, agent] of Object.entries(agentOverlay)) {
    if (!isPersona(name)) continue

    next[name] = {
      ...agent,
      permission: mergePermissionConfig(
        deriveStaticPersonaToolPermissionsFromProfile(getBuddyPersona(name)),
        agent.permission ?? {},
      ),
    }
  }

  return next
}

function applyBuddyPersonaHiddenFlags(
  agentOverlay: Record<string, Config.Agent>,
  personaOverrides?: Partial<Record<BuddyPersona, { hidden?: boolean }>>,
) {
  const next = { ...agentOverlay }
  const profiles = resolveBuddyPersonaProfiles(personaOverrides)

  for (const persona of Object.values(profiles)) {
    if (!persona.hidden) continue
    const agent = next[persona.id]
    if (!agent) continue
    next[persona.id] = {
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

export { applyBuddyPersonaHiddenFlags, mergeBuddyAndConfiguredAgents, resolveConfiguredAgentKey }
