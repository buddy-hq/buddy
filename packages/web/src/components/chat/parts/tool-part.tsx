import { memo } from 'react'
import { GenericTool } from '../tools/generic-tool'
import { getToolRenderer, isContextTool, HIDDEN_TOOLS } from '../tools/registry'
import { parseToolState } from '../tools/parse-tool-state'
import { getToolInfo } from '../tools/tool-info'
import { isBuddyCustomTool } from '../shared/utils'
import type { MessagePart } from '@/state/chat-types'
import type { ToolPartProps } from '../tools/registry'

// Import BuddyCustomTool separately to avoid circular dependency
import { BuddyCustomTool } from '../tools/python-calculator-tool'

interface ToolPartRendererProps {
  part: MessagePart
  onOpenSession?: (sessionID: string) => void
  defaultOpen?: boolean
}

function toolPartCardEqual(
  prevProps: ToolPartRendererProps,
  nextProps: ToolPartRendererProps,
): boolean {
  if (prevProps.part.id !== nextProps.part.id) return false
  if (prevProps.onOpenSession !== nextProps.onOpenSession) return false
  if (prevProps.defaultOpen !== nextProps.defaultOpen) return false
  if (prevProps.part.type !== 'tool' || nextProps.part.type !== 'tool') return false

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
  onOpenSession,
  defaultOpen,
}: ToolPartRendererProps) {
  const tool = String(part.tool ?? '')

  // Hidden tools return null
  if (HIDDEN_TOOLS.has(tool)) {
    return null
  }

  const state = parseToolState(part)
  const info = getToolInfo(tool, state.input)
  const props: ToolPartProps = { part, state, info, tool, onOpenSession, defaultOpen }

  // Check if this is a Buddy custom tool (but not python_calculator which is registered separately)
  if (isBuddyCustomTool(tool) && tool !== 'python_calculator') {
    return <BuddyCustomTool {...props} />
  }

  // Try to get registered tool renderer
  const renderer = getToolRenderer(tool)
  if (renderer) {
    return <>{renderer.render(props)}</>
  }

  // Fallback to generic tool
  return <GenericTool {...props} />
}, toolPartCardEqual)

export { isContextTool }
