import type { ToolState } from "./registry"

const PERMISSION_DENIED_PREFIX = "The user rejected permission to use this specific tool call"

export function isPermissionDenied(state: ToolState): boolean {
  return state.status === "error" && (state.errorType === "permission.rejected" || state.error?.startsWith(PERMISSION_DENIED_PREFIX) === true)
}
