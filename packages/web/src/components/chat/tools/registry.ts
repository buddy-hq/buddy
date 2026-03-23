import type { MessagePart } from "@/state/chat-types"
import type { ReactNode } from "react"
import type { ToolState, ToolInfo } from "./types"

export interface ToolPartProps {
  part: MessagePart
  state: ToolState
  info: ToolInfo
  tool: string
  onOpenSession?: (sessionID: string) => void
  defaultOpen?: boolean
}

export type ToolRenderer = {
  name: string
  render: (props: ToolPartProps) => ReactNode
  isContextTool?: boolean
}

const registry = new Map<string, ToolRenderer>()

export function registerTool(renderer: ToolRenderer): void {
  registry.set(renderer.name, renderer)
}

export function getToolRenderer(tool: string): ToolRenderer | undefined {
  return registry.get(tool)
}

export function isContextTool(tool: string): boolean {
  const renderer = registry.get(tool)
  return renderer?.isContextTool ?? false
}

export function getAllToolNames(): string[] {
  return Array.from(registry.keys())
}

export function clearRegistry(): void {
  registry.clear()
}

export const CONTEXT_TOOLS = new Set(["read", "list", "glob", "grep"])
export const HIDDEN_TOOLS = new Set(["todowrite", "todoread"])

// Re-export types from types.ts for convenience
export type {
  ToolState,
  ToolInfo,
  ToolAttachment,
  ToolDiagnostic,
  ToolQuestion,
  ApplyPatchFile,
  RenderFigureToolOutput,
} from "./types"
