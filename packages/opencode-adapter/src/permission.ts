import { evaluatePermission, matchPermissionPattern, permissionRulesFromConfig } from "@buddy/transcript-contract/permission-rules"
import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
export type { PermissionAction, PermissionRule, PermissionRuleset } from "@buddy/transcript-contract/permission-rules"

function evaluate(permission: string, pattern: string, ...rulesets: PermissionRuleset[]) {
  return evaluatePermission(permission, pattern, rulesets.flat(), process.platform === "win32" ? "win32" : "posix")
}

function merge(...rulesets: PermissionRuleset[]): PermissionRuleset {
  return rulesets.flat()
}

function disabled(tools: string[], ruleset: PermissionRuleset): Set<string> {
  return new Set(tools.filter((tool) => {
    const rule = ruleset.findLast((candidate) => matchPermissionPattern(permissionKey(tool), candidate.permission, process.platform === "win32" ? "win32" : "posix"))
    return rule?.pattern === "*" && rule.action === "deny"
  }))
}

function permissionKey(tool: string): string {
  return ["write", "patch", "apply_patch", "multiedit"].includes(tool) ? "edit" : tool
}

export const Permission = { evaluate, merge, disabled, fromConfig: permissionRulesFromConfig }
export const PermissionNext = Permission
