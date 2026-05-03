import type { PermissionRule, PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { SUBAGENT_IDS } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { ResolvedSessionRuntime } from "../../access/types"
import { managedBuddySkillNames } from "../../skill-management/managed-buddy-skills"
import {
  dynamicLearningToolDefaultDenyRules,
  isDynamicLearningToolSessionRule,
} from "../../runtime/dynamic-tool-permissions"
import { allLearningToolIds } from "../../runtime/tool-metadata"

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

function buildManagedRuntimeRules(sessionRuntime: ResolvedSessionRuntime): {
  allowRules: PermissionRuleset
  denyRules: PermissionRuleset
} {
  const allowRules: PermissionRuleset = []
  const denyRules: PermissionRuleset = []

  for (const toolId of allLearningToolIds()) {
    const action = sessionRuntime.access.tools[toolId] ?? "deny"
    const rule: PermissionRule = {
      permission: toolId,
      pattern: "*",
      action,
    }
    appendRuleByAction({ allowRules, denyRules, rule })
  }

  for (const subagentId of SUBAGENT_IDS) {
    const access = sessionRuntime.access.subagents[subagentId] ?? "deny"
    const action = access === "deny" ? "deny" : "allow"
    const rule: PermissionRule = {
      permission: "task",
      pattern: subagentId,
      action,
    }
    appendRuleByAction({ allowRules, denyRules, rule })
  }

  for (const [skillName, access] of Object.entries(sessionRuntime.access.skills)) {
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
  sessionRuntime?: ResolvedSessionRuntime
}): PermissionRuleset {
  const preservedRules = (input.existing ?? []).filter((rule) => {
    return !isBuddyManagedRuntimeRule(rule)
  })

  if (!input.sessionRuntime) {
    return [...preservedRules, ...dynamicLearningToolDefaultDenyRules()]
  }

  const { allowRules, denyRules } = buildManagedRuntimeRules(input.sessionRuntime)
  return [...allowRules, ...preservedRules, ...denyRules, ...dynamicLearningToolDefaultDenyRules()]
}
