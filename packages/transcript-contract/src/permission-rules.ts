import { Schema } from "effect"

export const PermissionAction = Schema.Literals(["allow", "deny", "ask"])
export type PermissionAction = typeof PermissionAction.Type
export const PermissionRule = Schema.Struct({
  permission: Schema.String,
  pattern: Schema.String,
  action: PermissionAction,
})
export type PermissionRule = typeof PermissionRule.Type
export type PermissionRuleset = PermissionRule[]
export type SessionPermissionRule = {
  action: string
  resource: string
  effect: PermissionAction
}
export type SessionPermissionRuleset = SessionPermissionRule[]
export type PermissionConfig = PermissionAction | Record<string, PermissionAction | Record<string, PermissionAction>>

export function matchPermissionPattern(input: string, pattern: string, platform: "posix" | "win32" = "posix"): boolean {
  const normalized = input.replaceAll("\\", "/")
  let escaped = pattern.replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
  return new RegExp("^" + escaped + "$", platform === "win32" ? "si" : "s").test(normalized)
}

export function matchPermissionRule(permission: string, pattern: string, rules: readonly PermissionRule[], platform: "posix" | "win32" = "posix"): PermissionRule | undefined {
  return rules.findLast((rule) => matchPermissionPattern(permission, rule.permission, platform) && matchPermissionPattern(pattern, rule.pattern, platform))
}

export function evaluatePermission(permission: string, pattern: string, rules: readonly PermissionRule[], platform: "posix" | "win32" = "posix"): PermissionRule {
  return matchPermissionRule(permission, pattern, rules, platform) ?? { permission, pattern: "*", action: "ask" }
}

export function permissionRulesFromConfig(config: PermissionConfig): PermissionRuleset {
  if (Schema.is(PermissionAction)(config)) return [{ permission: "*", pattern: "*", action: config }]
  return Object.entries(config).flatMap(([permission, value]) => Schema.is(PermissionAction)(value)
    ? [{ permission, pattern: "*", action: value }]
    : Object.entries(value).map(([pattern, action]) => ({ permission, pattern, action })))
}

export function withDynamicToolPermissionGrants(input: {
  existing: readonly PermissionRule[]
  toolIDs: readonly string[]
  managedToolIDs: readonly string[]
}): PermissionRuleset {
  const managed = new Set(input.managedToolIDs)
  const grants = new Set(input.toolIDs.filter((tool) => managed.has(tool)))
  for (const rule of input.existing) {
    if (managed.has(rule.permission) && rule.pattern === "*" && rule.action === "allow" && evaluatePermission(rule.permission, "*", input.existing).action === "allow") grants.add(rule.permission)
  }
  const preserved = input.existing.filter((rule) => !(managed.has(rule.permission) && rule.pattern === "*"))
  return [
    ...Array.from(grants, (permission): PermissionRule => ({ permission, pattern: "*", action: "allow" })),
    ...preserved,
    ...input.managedToolIDs.filter((tool) => !grants.has(tool)).map((permission): PermissionRule => ({ permission, pattern: "*", action: "deny" })),
  ]
}

export function resetDynamicToolPermissionGrants(existing: readonly PermissionRule[], managedToolIDs: readonly string[]): PermissionRuleset {
  const managed = new Set(managedToolIDs)
  return [
    ...existing.filter((rule) => !(managed.has(rule.permission) && rule.pattern === "*")),
    ...managedToolIDs.map((permission): PermissionRule => ({ permission, pattern: "*", action: "deny" })),
  ]
}

export function constrainPermissionGrants(rules: PermissionRuleset, configured: readonly PermissionRule[], managedActions: readonly string[], platform: "posix" | "win32" = "posix"): PermissionRuleset {
  const managed = new Set(managedActions)
  return rules.filter((rule) => {
    if (rule.action === "deny" || !managed.has(rule.permission)) return true
    if (rule.pattern !== "*") return evaluatePermission(rule.permission, rule.pattern, configured, platform).action !== "deny"
    return !configured.some((policy) => policy.action === "deny" && matchPermissionPattern(rule.permission, policy.permission, platform))
  })
}
