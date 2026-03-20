import type { MessagePart } from "@/state/chat-types"
import type { ReactNode } from "react"

export interface ToolState {
  status: "pending" | "running" | "completed" | "error"
  input: Record<string, unknown>
  metadata: Record<string, unknown>
  attachments: ToolAttachment[]
  start?: number
  end?: number
  output?: string
  error?: string
  title?: string
}

export interface ToolAttachment {
  id: string
  mime: string
  url: string
  filename?: string
}

export interface ToolInfo {
  title: string
  subtitle?: string
  detail?: string
  args?: string[]
}

export interface ToolDiagnostic {
  range: {
    start: {
      line: number
      character: number
    }
  }
  message: string
  severity?: number
}

export interface ToolQuestion {
  question: string
}

export interface ApplyPatchFile {
  filePath: string
  relativePath: string
  type: "add" | "update" | "delete" | "move"
  before: string
  after: string
  additions: number
  deletions: number
  movePath?: string
}

export interface RenderFigureToolOutput {
  figureID: string
  mime: "image/svg+xml"
  url: string
  alt: string
  caption?: string
  repairAttempts: number
}

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
