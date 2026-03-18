import { GenericTool } from "../tools/generic-tool"
import { getToolRenderer, isContextTool, HIDDEN_TOOLS } from "../tools/registry"
import { parseToolState } from "../tools/parse-tool-state"
import { getToolInfo } from "../tools/tool-info"
import { isBuddyCustomTool } from "../shared/utils"
import type { MessagePart } from "@/state/chat-types"
import type { ToolPartProps } from "../tools/registry"

// Import BuddyCustomTool separately to avoid circular dependency
import { BuddyCustomTool } from "../tools/python-calculator-tool"

interface ToolPartRendererProps {
  part: MessagePart
  onOpenSession?: (sessionID: string) => void
}

export function ToolPartCard({ part, onOpenSession }: ToolPartRendererProps) {
  const tool = String(part.tool ?? "")

  // Hidden tools return null
  if (HIDDEN_TOOLS.has(tool)) {
    return null
  }

  const state = parseToolState(part)
  const info = getToolInfo(tool, state.input)
  const props: ToolPartProps = { part, state, info, tool, onOpenSession }

  // Check if this is a Buddy custom tool (but not python_calculator which is registered separately)
  if (isBuddyCustomTool(tool) && tool !== "python_calculator") {
    return <BuddyCustomTool {...props} />
  }

  // Try to get registered tool renderer
  const renderer = getToolRenderer(tool)
  if (renderer) {
    return <>{renderer.render(props)}</>
  }

  // Fallback to generic tool
  return <GenericTool {...props} />
}

export { isContextTool }
