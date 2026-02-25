import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { Tool, Truncate } from "@buddy/opencode-adapter/tool"

export type ToolContext = Tool.Context

// Native compile-safe wrappers for vendored OpenCode types/utilities.
export { PermissionNext, Tool, Truncate }
