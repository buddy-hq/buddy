import type { PermissionRule, PermissionRuleset } from "@buddy/opencode-adapter/permission"
import {
  dynamicPedagogyDebugAttemptTool,
  dynamicPedagogyReflectionTool,
  dynamicPedagogyStepwiseSolveTool,
} from "./dynamic-learning-tools"

const ANY_PATTERN = "*" as const
const ALLOW_ACTION = "allow" as const
const DENY_ACTION = "deny" as const

type DynamicLearningToolAgentPermission = Record<string, typeof DENY_ACTION>

const DYNAMIC_LEARNING_TOOL_IDS = [
  dynamicPedagogyDebugAttemptTool.id,
  dynamicPedagogyReflectionTool.id,
  dynamicPedagogyStepwiseSolveTool.id,
] as const

function dynamicLearningToolDenyRule(toolID: string): PermissionRule {
  return {
    permission: toolID,
    pattern: ANY_PATTERN,
    action: DENY_ACTION,
  }
}

function dynamicLearningToolDefaultDenyRules(): PermissionRuleset {
  return DYNAMIC_LEARNING_TOOL_IDS.map(dynamicLearningToolDenyRule)
}

function dynamicLearningToolAgentPermission(): DynamicLearningToolAgentPermission {
  return Object.fromEntries(
    DYNAMIC_LEARNING_TOOL_IDS.map((toolID) => [toolID, DENY_ACTION]),
  ) as DynamicLearningToolAgentPermission
}

function isExactDynamicLearningToolRule(rule: PermissionRule): boolean {
  return (
    DYNAMIC_LEARNING_TOOL_IDS.some((toolID) => toolID === rule.permission) &&
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
