import type { MessagePart } from "@/state/chat-types"
import type { ReactNode } from "react"

import type { ResourceOpenOptions, ResourceReadingTarget } from "@/state/resources-query"
import type { ToolAttachment, ToolInfo, ToolState } from "./types"

/**
 * A function that renders the tool's icon with a given Tailwind className.
 * Defined once in the tool registry; used by both card renderers and the
 * hidden-steps toggle so there is a single source of truth for each icon.
 */
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
  onOpenResource?: (
    directory: string,
    resource: ResourceReadingTarget,
    options?: ResourceOpenOptions,
  ) => void
  defaultOpen?: boolean
}

export type ToolSummaryDisplay = "row" | "card"

export type ToolSummaryPattern = "info" | "metadata" | "query" | "read" | "command" | "link"

export type ToolCountSummary = {
  verb: string
  singular: string
  plural: string
}

export type ToolSummary = {
  display: ToolSummaryDisplay
  pattern: ToolSummaryPattern
  suppressError?: boolean
  countSummary?: ToolCountSummary
}

export type ToolCardRenderer = (props: ToolPartProps) => ReactNode

export type ToolRenderer = {
  hidden?: boolean
  inline?: boolean
  renderInlineErrorCard?: boolean
  card?: ToolCardRenderer
  summary?: ToolSummary
  icon?: ToolIconRenderer
  deferUntilVisible?: boolean
}

export type ResolvedSummaryContentFormat = "text" | "markdown"

export type ResolvedSummaryContent = {
  value: string
  format: ResolvedSummaryContentFormat
}

export type ResolvedToolSummary = {
  display: ToolSummaryDisplay
  label: string
  details?: ResolvedSummaryContent[]
  errorVisibility: "visible" | "suppressed"
}

export type { ToolAttachment, ToolInfo, ToolState } from "./types"
