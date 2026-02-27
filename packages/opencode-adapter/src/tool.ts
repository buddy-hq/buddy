export type ToolContext = {
  ask(input: {
    permission: string
    patterns: string[]
    always: string[]
    metadata: Record<string, unknown>
  }): Promise<void>
}

// Compile-safe bridges to vendored OpenCode tool runtime.
export { Tool } from "opencode/tool/tool"
export { Truncate } from "opencode/tool/truncation"
export { EditTool } from "opencode/tool/edit"
export { WriteTool } from "opencode/tool/write"
