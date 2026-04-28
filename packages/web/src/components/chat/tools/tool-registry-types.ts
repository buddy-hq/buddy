import type { MessagePart } from "@/state/chat-types"
import type { ReactNode } from "react"

import type { ToolAttachment, ToolInfo, ToolState } from "./types"

export type ToolPartProps = {
  part: MessagePart
  state: ToolState
  info: ToolInfo
  tool: string
  directory?: string
  onOpenSession?: (sessionID: string) => void
  defaultOpen?: boolean
}

export type ToolSummaryDisplay = "row" | "card"

export type ToolSummaryPattern =
  | "info"
  | "metadata"
  | "query"
  | "read"
  | "artifact"
  | "command"
  | "link"

export type ToolSummaryAggregate =
  | { key: string; mode: "none" }
  | {
      key: string
      mode: "label-times"
      label: string
      entryLabel?: "label" | "title"
    }
  | { key: string; mode: "action-times"; action: string }
  | {
      key: string
      mode: "count-items"
      past: string
      singular: string
      plural: string
    }

export type ToolSummary = {
  display: ToolSummaryDisplay
  pattern: ToolSummaryPattern
  suppressError?: boolean
  aggregate?: ToolSummaryAggregate
}

export type ToolCardRenderer = (props: ToolPartProps) => ReactNode

export type ToolRenderer = {
  hidden?: boolean
  card?: ToolCardRenderer
  summary?: ToolSummary
}

export type ResolvedSummaryContentFormat = "text" | "markdown"

export type ResolvedSummaryContent = {
  value: string
  format: ResolvedSummaryContentFormat
}

export type ResolvedToolSummaryAggregate =
  | {
      key: string
      mode: "label-times"
      label: string
      entryLabel?: "label" | "title"
    }
  | { key: string; mode: "action-times"; action: string }
  | {
      key: string
      mode: "count-items"
      past: string
      singular: string
      plural: string
    }

export type ResolvedToolSummary = {
  display: ToolSummaryDisplay
  label: string
  preview?: ResolvedSummaryContent
  details?: ResolvedSummaryContent[]
  errorPreview?: string
  errorVisibility: "visible" | "suppressed"
  suppressError?: boolean
  aggregate?: ResolvedToolSummaryAggregate
}

export type { ToolAttachment, ToolInfo, ToolState } from "./types"
