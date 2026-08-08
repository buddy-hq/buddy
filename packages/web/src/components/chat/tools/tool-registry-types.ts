import type { MessagePart } from "@/state/chat-types"
import type { ReactNode } from "react"

import type { ResourceReadingTarget } from "@/state/resources-query"
import type { ToolAttachment, ToolInfo, ToolState } from "./types"

/** Draws the semantic action icon selected by the resolved presentation snapshot. */
export type ToolIconRenderer = (className: string) => ReactNode

export type ToolPartProps = {
  part: MessagePart
  state: ToolState
  info: ToolInfo
  tool: string
  icon?: ToolIconRenderer
  directory?: string
  canEditImages?: boolean
  onOpenSession?: (sessionID: string) => void
  onOpenResource?: (directory: string, resource: ResourceReadingTarget) => void
  defaultOpen?: boolean
}

export type ToolCardRenderer = (props: ToolPartProps) => ReactNode

export type ToolRenderer = {
  card: ToolCardRenderer
  deferUntilVisible?: boolean
}

export type { ToolAttachment, ToolInfo, ToolState } from "./types"
