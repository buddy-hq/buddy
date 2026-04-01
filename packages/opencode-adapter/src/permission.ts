import { Permission } from "opencode/permission/index"

export type PermissionAction = "allow" | "deny" | "ask"

export type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

export type PermissionRuleset = PermissionRule[]

// Compile-safe bridge to vendored OpenCode permission runtime.
// Keep Buddy imports routed through adapter seams.
export { Permission }
export const PermissionNext = Permission
