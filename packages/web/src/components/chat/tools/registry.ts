import type { MessagePart } from "@/state/chat-types"
import type { ReactNode } from "react"
import type { ToolState, ToolInfo } from "./types"

export const HIDDEN_STEP_DETAIL_KIND = {
  markdown: "markdown",
  text: "text",
} as const

export type HiddenStepDetailKind =
  (typeof HIDDEN_STEP_DETAIL_KIND)[keyof typeof HIDDEN_STEP_DETAIL_KIND]

export type HiddenStepDetail = {
  text: string
  kind?: HiddenStepDetailKind
}

export type ToolPartProps = {
  part: MessagePart
  state: ToolState
  info: ToolInfo
  tool: string
  directory?: string
  onOpenSession?: (sessionID: string) => void
  defaultOpen?: boolean
}

export type HiddenStepPresentation = {
  preview?: HiddenStepDetail
  rowDetails?: HiddenStepDetail[]
  summaryLabel?: string
  summaryOnly?: boolean
  suppressErrorPreview?: boolean
}

export type ToolRenderer = {
  name: string
  render: (props: ToolPartProps) => ReactNode
  isContextTool?: boolean
  hiddenSteps?: (props: ToolPartProps) => HiddenStepPresentation | undefined
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
export type { ToolState, ToolInfo, ToolAttachment } from "./types"
