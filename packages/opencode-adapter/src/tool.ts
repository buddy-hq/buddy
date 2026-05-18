import type * as OpenCodeAgent from "opencode/agent/agent"
import type * as OpenCodeTruncate from "opencode/tool/truncate"

export type ToolContext = {
  ask(input: {
    permission: string
    patterns: string[]
    always: string[]
    metadata: Record<string, unknown>
  }): Promise<void>
}

export type ToolRuntimeServices = OpenCodeAgent.Service | OpenCodeTruncate.Service

export * as Tool from "opencode/tool/tool"
export * as ToolJsonSchema from "opencode/tool/json-schema"
export * as Truncate from "opencode/tool/truncate"
export { EditTool } from "opencode/tool/edit"
export { WriteTool } from "opencode/tool/write"
