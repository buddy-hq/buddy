import type { ToolState } from "./registry"

/**
 * The prefix used by opencode's permission system when the user denies a tool call.
 * Source: vendor/opencode/packages/opencode/src/permission/index.ts
 */
const PERMISSION_DENIED_PREFIX = "The user rejected permission to use this specific tool call"

/**
 * Returns true when a tool error is the result of the user denying a permission
 * prompt, rather than a genuine failure. Use this to render quiet "denied"
 * indicators instead of red error panels.
 */
export function isPermissionDenied(state: ToolState): boolean {
  const error = state.error
  return (
    state.status === "error" && error !== undefined && error.startsWith(PERMISSION_DENIED_PREFIX)
  )
}
