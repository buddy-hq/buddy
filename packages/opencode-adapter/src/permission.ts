import * as OpenCodePermissionRuntime from "opencode/permission/index"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"

export type PermissionAction = PermissionV1.Action
export type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}
export type PermissionRuleset = PermissionRule[]

function mutableRule(rule: PermissionV1.Rule): PermissionRule {
  return {
    permission: rule.permission,
    pattern: rule.pattern,
    action: rule.action,
  }
}

function mutableRuleset(ruleset: PermissionV1.Ruleset): PermissionRuleset {
  return ruleset.map(mutableRule)
}

function evaluate(
  permission: string,
  pattern: string,
  ...rulesets: PermissionRuleset[]
): PermissionRule {
  return mutableRule(OpenCodePermissionRuntime.evaluate(permission, pattern, ...rulesets))
}

function fromConfig(
  permission: Parameters<typeof OpenCodePermissionRuntime.fromConfig>[0],
): PermissionRuleset {
  return mutableRuleset(OpenCodePermissionRuntime.fromConfig(permission))
}

function merge(...rulesets: PermissionRuleset[]): PermissionRuleset {
  return mutableRuleset(OpenCodePermissionRuntime.merge(...rulesets))
}

function disabled(tools: string[], ruleset: PermissionRuleset): Set<string> {
  return OpenCodePermissionRuntime.disabled(tools, ruleset)
}

// Keep runtime helpers and v1 schemas behind one Buddy-facing adapter namespace.
export const Permission = {
  ...OpenCodePermissionRuntime.Permission,
  ...PermissionV1,
  disabled,
  evaluate,
  fromConfig,
  merge,
}

export const PermissionNext = Permission
