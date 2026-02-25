type PermissionAction = "allow" | "deny" | "ask"

export type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

export type PermissionRuleset = PermissionRule[]

type PermissionNextRuntime = {
  Ruleset: unknown
  fromConfig(permission: unknown): PermissionRuleset
  merge(...rulesets: PermissionRuleset[]): PermissionRuleset
}

const permissionModule = (await (0, eval)(
  'import("../../../vendor/opencode-core/src/permission/next.ts")',
)) as {
  PermissionNext: PermissionNextRuntime
}

// Compile-safe bridge to vendored OpenCode permission runtime.
// Keep Buddy imports routed through adapter seams.
export const PermissionNext = permissionModule.PermissionNext
