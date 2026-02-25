export type PermissionAction = "allow" | "deny" | "ask"

export type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

export type PermissionRuleset = PermissionRule[]

// Compile-safe bridge to vendored OpenCode permission runtime.
// Keep Buddy imports routed through adapter seams.
export { PermissionNext } from "@opencode-core/permission/next"
