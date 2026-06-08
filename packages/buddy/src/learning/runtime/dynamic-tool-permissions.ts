import type { PermissionRule, PermissionRuleset } from "@buddy/opencode-adapter/permission"
import { allDynamicLearningToolIds } from "./dynamic-tool-catalog"

const ANY_PATTERN = "*" as const
const ALLOW_ACTION = "allow" as const
const DENY_ACTION = "deny" as const

type DynamicLearningToolAgentPermission = Record<string, typeof DENY_ACTION>

function dynamicLearningToolIDs(): string[] {
  return allDynamicLearningToolIds()
}

function dynamicLearningToolDenyRule(toolID: string): PermissionRule {
  return {
    permission: toolID,
    pattern: ANY_PATTERN,
    action: DENY_ACTION,
  }
}

function dynamicLearningToolDefaultDenyRules(): PermissionRuleset {
  return dynamicLearningToolIDs().map(dynamicLearningToolDenyRule)
}

function dynamicLearningToolAgentPermission(): DynamicLearningToolAgentPermission {
  const permission: DynamicLearningToolAgentPermission = {}

  for (const toolID of dynamicLearningToolIDs()) {
    permission[toolID] = DENY_ACTION
  }

  return permission
}

function isExactDynamicLearningToolRule(rule: PermissionRule): boolean {
  return (
    dynamicLearningToolIDs().some((toolID) => toolID === rule.permission) &&
    rule.pattern === ANY_PATTERN
  )
}

function isExactDynamicLearningToolDenyRule(rule: PermissionRule): boolean {
  return isExactDynamicLearningToolRule(rule) && rule.action === DENY_ACTION
}

function isExactDynamicLearningToolAllowRule(rule: PermissionRule): boolean {
  return isExactDynamicLearningToolRule(rule) && rule.action === ALLOW_ACTION
}

function isDynamicLearningToolSessionRule(rule: PermissionRule): boolean {
  return isExactDynamicLearningToolRule(rule)
}

function removeExactDynamicLearningToolAllows(
  rules: PermissionRuleset | undefined,
): PermissionRuleset {
  return (rules ?? []).filter((rule) => !isExactDynamicLearningToolAllowRule(rule))
}

function removeDynamicLearningToolSessionRules(
  rules: PermissionRuleset | undefined,
): PermissionRuleset {
  return (rules ?? []).filter((rule) => !isDynamicLearningToolSessionRule(rule))
}

export {
  dynamicLearningToolAgentPermission,
  dynamicLearningToolDefaultDenyRules,
  dynamicLearningToolDenyRule,
  isDynamicLearningToolSessionRule,
  isExactDynamicLearningToolAllowRule,
  isExactDynamicLearningToolDenyRule,
  removeDynamicLearningToolSessionRules,
  removeExactDynamicLearningToolAllows,
}
