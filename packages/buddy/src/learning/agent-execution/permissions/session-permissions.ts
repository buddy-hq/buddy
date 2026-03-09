import type { PermissionRule, PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { bundledActivitySkillNames } from "../../agents/curriculum"
import { allLearningToolIds } from "../tool-registry/tool-catalog"
import { SUBAGENT_IDS, type RuntimeProfile } from "../capabilities/types"

const MANAGED_TOOL_IDS = new Set<string>(allLearningToolIds())
const MANAGED_SUBAGENT_IDS = new Set<string>(SUBAGENT_IDS)
const MANAGED_SKILL_NAMES = new Set<string>(bundledActivitySkillNames())

function isBuddyManagedRuntimeRule(rule: PermissionRule): boolean {
  if (MANAGED_TOOL_IDS.has(rule.permission) && rule.pattern === "*") {
    return true
  }

  if (rule.permission === "skill" && MANAGED_SKILL_NAMES.has(rule.pattern)) {
    return true
  }

  return rule.permission === "task" && MANAGED_SUBAGENT_IDS.has(rule.pattern)
}

function appendRule(target: PermissionRuleset, rule: PermissionRule) {
  target.push(rule)
}

function appendRuleByAction(input: {
  allowRules: PermissionRuleset
  denyRules: PermissionRuleset
  rule: PermissionRule
}) {
  if (input.rule.action === "deny") {
    appendRule(input.denyRules, input.rule)
    return
  }

  appendRule(input.allowRules, input.rule)
}

function buildManagedRuntimeRules(runtimeProfile: RuntimeProfile): {
  allowRules: PermissionRuleset
  denyRules: PermissionRuleset
} {
  const allowRules: PermissionRuleset = []
  const denyRules: PermissionRuleset = []

  for (const toolId of allLearningToolIds()) {
    const action = runtimeProfile.capabilityEnvelope.tools[toolId] ?? "deny"
    const rule: PermissionRule = {
      permission: toolId,
      pattern: "*",
      action,
    }
    appendRuleByAction({ allowRules, denyRules, rule })
  }

  for (const subagentId of SUBAGENT_IDS) {
    const access = runtimeProfile.capabilityEnvelope.subagents[subagentId] ?? "deny"
    const action = access === "deny" ? "deny" : "allow"
    const rule: PermissionRule = {
      permission: "task",
      pattern: subagentId,
      action,
    }
    appendRuleByAction({ allowRules, denyRules, rule })
  }

  for (const [skillName, access] of Object.entries(runtimeProfile.capabilityEnvelope.skills)) {
    const rule: PermissionRule = {
      permission: "skill",
      pattern: skillName,
      action: access,
    }
    appendRuleByAction({ allowRules, denyRules, rule })
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
  const preservedRules = (input.existing ?? []).filter((rule) => {
    return !isBuddyManagedRuntimeRule(rule)
  })

  if (!input.runtimeProfile) {
    return preservedRules
  }

  const { allowRules, denyRules } = buildManagedRuntimeRules(input.runtimeProfile)
  return [...allowRules, ...preservedRules, ...denyRules]
}
