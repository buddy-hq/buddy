import type { PermissionRule, PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { bundledActivitySkillNames } from "./activity-bundles.js"
import { SUBAGENT_IDS, TOOL_IDS, type RuntimeProfile } from "./types.js"

const BUDDY_MANAGED_TOOL_PERMISSIONS = new Set<string>(TOOL_IDS)
const BUDDY_MANAGED_SUBAGENT_PATTERNS = new Set<string>(SUBAGENT_IDS)
const BUDDY_MANAGED_SKILL_PATTERNS = new Set<string>(bundledActivitySkillNames())

function isBuddyManagedRuntimeRule(rule: PermissionRule): boolean {
  if (BUDDY_MANAGED_TOOL_PERMISSIONS.has(rule.permission) && rule.pattern === "*") {
    return true
  }

  if (rule.permission === "skill" && BUDDY_MANAGED_SKILL_PATTERNS.has(rule.pattern)) {
    return true
  }

  return rule.permission === "task" && BUDDY_MANAGED_SUBAGENT_PATTERNS.has(rule.pattern)
}

function buildBuddyRuntimeRules(runtimeProfile: RuntimeProfile): {
  allowRules: PermissionRuleset
  denyRules: PermissionRuleset
} {
  const allowRules: PermissionRuleset = []
  const denyRules: PermissionRuleset = []

  for (const toolId of TOOL_IDS) {
    const action = runtimeProfile.capabilityEnvelope.tools[toolId] ?? "deny"
    const rule: PermissionRule = {
      permission: toolId,
      pattern: "*",
      action,
    }

    if (action === "deny") {
      denyRules.push(rule)
      continue
    }

    allowRules.push(rule)
  }

  for (const subagentId of SUBAGENT_IDS) {
    const access = runtimeProfile.capabilityEnvelope.subagents[subagentId] ?? "deny"
    const action = access === "deny" ? "deny" : "allow"
    const rule: PermissionRule = {
      permission: "task",
      pattern: subagentId,
      action,
    }

    if (action === "deny") {
      denyRules.push(rule)
      continue
    }

    allowRules.push(rule)
  }

  for (const [skillName, access] of Object.entries(runtimeProfile.capabilityEnvelope.skills)) {
    const rule: PermissionRule = {
      permission: "skill",
      pattern: skillName,
      action: access,
    }

    if (access === "deny") {
      denyRules.push(rule)
      continue
    }

    allowRules.push(rule)
  }

  return {
    allowRules,
    denyRules,
  }
}

export function buildBuddyRuntimeSessionPermissions(input: {
  existing?: PermissionRuleset
  runtimeProfile?: RuntimeProfile
}): PermissionRuleset {
  const preservedRules = (input.existing ?? []).filter((rule) => !isBuddyManagedRuntimeRule(rule))

  if (!input.runtimeProfile) {
    return preservedRules
  }

  const { allowRules, denyRules } = buildBuddyRuntimeRules(input.runtimeProfile)
  return [...allowRules, ...preservedRules, ...denyRules]
}
