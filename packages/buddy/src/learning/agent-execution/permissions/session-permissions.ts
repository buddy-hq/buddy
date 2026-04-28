import type { PermissionRule, PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { SUBAGENT_IDS } from "@buddy/backend/learning/shared/teaching-vocabulary"
import { managedBuddySkillNames } from "../../skills/managed-buddy-skills"
import type { RuntimeProfile } from "../../shared/runtime-types"
import {
  dynamicLearningToolDefaultDenyRules,
  isDynamicLearningToolSessionRule,
} from "../../tools/dynamic-learning-tool-permissions"
import { allLearningToolIds } from "../../tools/tool-metadata"

let managedToolIds: Set<string> | undefined
let managedSubagentIds: Set<string> | undefined
let managedSkillNames: Set<string> | undefined

function getManagedToolIds() {
  managedToolIds ??= new Set<string>(allLearningToolIds())
  return managedToolIds
}

function getManagedSubagentIds() {
  managedSubagentIds ??= new Set<string>(SUBAGENT_IDS)
  return managedSubagentIds
}

function getManagedSkillNames() {
  managedSkillNames ??= new Set<string>(managedBuddySkillNames())
  return managedSkillNames
}

function isBuddyManagedRuntimeRule(rule: PermissionRule): boolean {
  if (isDynamicLearningToolSessionRule(rule)) {
    return true
  }

  if (getManagedToolIds().has(rule.permission) && rule.pattern === "*") {
    return true
  }

  if (rule.permission === "skill" && getManagedSkillNames().has(rule.pattern)) {
    return true
  }

  return rule.permission === "task" && getManagedSubagentIds().has(rule.pattern)
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
    return [...preservedRules, ...dynamicLearningToolDefaultDenyRules()]
  }

  const { allowRules, denyRules } = buildManagedRuntimeRules(input.runtimeProfile)
  return [...allowRules, ...preservedRules, ...denyRules, ...dynamicLearningToolDefaultDenyRules()]
}
