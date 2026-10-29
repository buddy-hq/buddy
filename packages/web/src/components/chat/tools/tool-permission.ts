import type { ToolState } from "./registry"

export function isPermissionDenied(state: ToolState): boolean {
  return state.status === "error" && state.outcome?.type === "rejected"
}
