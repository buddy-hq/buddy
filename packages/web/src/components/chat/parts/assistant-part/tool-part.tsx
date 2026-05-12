import { memo } from "react"
import { parseToolState } from "../../tools/parse-tool-state"
import { parseToolUiMetadata } from "../../tools/parse-tool-ui-metadata"
import { resolveToolRenderer } from "../../tools/registry"
import { getToolInfo } from "../../tools/tool-info"
import type { ToolPartProps } from "../../tools/registry"
import type { ChatToolPart } from "../../utils/part-guards"

interface ToolPartRendererProps {
  part: ChatToolPart
  directory?: string
  onOpenSession?: (sessionID: string) => void
  defaultOpen?: boolean
}

function toolPartCardEqual(
  prevProps: ToolPartRendererProps,
  nextProps: ToolPartRendererProps,
): boolean {
  if (prevProps.part.id !== nextProps.part.id) return false
  if (prevProps.directory !== nextProps.directory) return false
  if (prevProps.onOpenSession !== nextProps.onOpenSession) return false
  if (prevProps.defaultOpen !== nextProps.defaultOpen) return false

  const prevState = parseToolState(prevProps.part)
  const nextState = parseToolState(nextProps.part)

  return (
    prevState.status === nextState.status &&
    JSON.stringify(prevState.output) === JSON.stringify(nextState.output) &&
    JSON.stringify(prevState.metadata) === JSON.stringify(nextState.metadata) &&
    JSON.stringify(prevState.attachments) === JSON.stringify(nextState.attachments)
  )
}

export const ToolPartCard = memo(function ToolPartCard({
  part,
  directory,
  onOpenSession,
  defaultOpen,
}: ToolPartRendererProps) {
  const tool = part.tool

  const state = parseToolState(part)
  const toolUi = parseToolUiMetadata(state.metadata)
  const renderer = resolveToolRenderer(tool, toolUi)
  if (renderer.hidden || !renderer.card) {
    return null
  }

  const info = getToolInfo(tool, state)
  const props: ToolPartProps = {
    part,
    state,
    info,
    tool,
    icon: renderer.icon,
    directory,
    onOpenSession,
    defaultOpen,
  }

  return <>{renderer.card(props)}</>
}, toolPartCardEqual)
