export type ToolContext = {
  ask(input: {
    permission: string
    patterns: string[]
    always: string[]
    metadata: Record<string, unknown>
  }): Promise<void>
}

type ToolDefinition = {
  description: string
  parameters: unknown
  execute(args: unknown, ctx: ToolContext): Promise<unknown> | unknown
}

type ToolFactory = (initCtx: unknown) => Promise<ToolDefinition> | ToolDefinition

type ToolRuntime = {
  define(id: string, init: ToolDefinition | ToolFactory): unknown
}

type TruncateRuntime = {
  GLOB: string
}

const [toolModule, truncationModule] = (await Promise.all([
  (0, eval)('import("../../../vendor/opencode-core/src/tool/tool.ts")'),
  (0, eval)('import("../../../vendor/opencode-core/src/tool/truncation.ts")'),
])) as [{ Tool: ToolRuntime }, { Truncate: TruncateRuntime }]

// Compile-safe bridges to vendored OpenCode tool runtime.
export const Tool = toolModule.Tool
export const Truncate = truncationModule.Truncate
