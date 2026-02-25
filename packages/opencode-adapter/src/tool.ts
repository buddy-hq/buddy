export type ToolContext = {
  ask(input: {
    permission: string
    patterns: string[]
    always: string[]
    metadata: Record<string, unknown>
  }): Promise<void>
}

// Compile-safe bridges to vendored OpenCode tool runtime.
export { Tool } from "@opencode-core/tool/tool"
export { Truncate } from "@opencode-core/tool/truncation"
