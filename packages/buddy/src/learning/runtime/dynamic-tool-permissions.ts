import { allDynamicLearningToolIds } from "./dynamic-tool-catalog"
import type { DynamicToolId } from "../shared/runtime-types"

const ANY_PATTERN = "*" as const
const ALLOW_ACTION = "allow" as const
const DENY_ACTION = "deny" as const

type PermissionRule = {
  permission: string
  pattern: string
  action: typeof ALLOW_ACTION | typeof DENY_ACTION | "ask"
}

type PermissionRuleset = PermissionRule[]

type DynamicLearningToolAgentPermission = Record<string, typeof DENY_ACTION>

let cachedDynamicToolIds: DynamicToolId[] | undefined

function getDynamicLearningToolIds(): DynamicToolId[] {
  cachedDynamicToolIds ??= allDynamicLearningToolIds()
  return cachedDynamicToolIds
}

function dynamicLearningToolDenyRule(toolID: string): PermissionRule {
  return {
    permission: toolID,
    pattern: ANY_PATTERN,
    action: DENY_ACTION,
  }
}

function dynamicLearningToolDefaultDenyRules(): PermissionRuleset {
  return getDynamicLearningToolIds().map(dynamicLearningToolDenyRule)
}

function dynamicLearningToolAgentPermission(): DynamicLearningToolAgentPermission {
  return Object.fromEntries(
    getDynamicLearningToolIds().map((toolID) => [toolID, DENY_ACTION]),
  ) as DynamicLearningToolAgentPermission
}

function isExactDynamicLearningToolRule(rule: PermissionRule): boolean {
  return (
    getDynamicLearningToolIds().some((toolID) => toolID === rule.permission) &&
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
export type { PermissionRule, PermissionRuleset }
