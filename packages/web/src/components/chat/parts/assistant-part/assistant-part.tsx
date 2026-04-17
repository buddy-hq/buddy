import { memo } from "react"
import { parseToolState } from "../../tools/parse-tool-state"
import { AssistantTextPart } from "./text-part"
import { ReasoningPart } from "./reasoning-part"
import { ToolPartCard } from "./tool-part"
import type { MessagePart } from "@/state/chat-types"
import { isChatReasoningPart, isChatTextPart, isChatToolPart } from "../../utils/part-guards"

// Serialize tool state for comparison
function getToolStateHash(part: MessagePart): string {
  if (!isChatToolPart(part)) return ""
  const state = parseToolState(part)
  return `${state.status}:${JSON.stringify(state.output)}:${JSON.stringify(state.metadata)}:${JSON.stringify(state.attachments)}`
}

export interface AssistantPartRendererProps {
  part: MessagePart
  copyPartID?: string
  metaText?: string
  interrupted?: boolean
  onOpenSession?: (sessionID: string) => void
  stripLeadingFigureImage?: boolean
  stripLeadingMermaidSource?: string
  directory?: string
  defaultOpen?: boolean
  onTextFinalRender?: () => void
}

// Custom equality check for AssistantPartRenderer props
function assistantPartRendererEqual(
  prevProps: AssistantPartRendererProps,
  nextProps: AssistantPartRendererProps,
): boolean {
  if (prevProps.part.id !== nextProps.part.id) return false
  if (prevProps.copyPartID !== nextProps.copyPartID) return false
  if (prevProps.metaText !== nextProps.metaText) return false
  if (prevProps.interrupted !== nextProps.interrupted) return false
  if (prevProps.stripLeadingFigureImage !== nextProps.stripLeadingFigureImage) return false
  if (prevProps.stripLeadingMermaidSource !== nextProps.stripLeadingMermaidSource) return false
  if (prevProps.directory !== nextProps.directory) return false
  if (prevProps.onOpenSession !== nextProps.onOpenSession) return false
  if (prevProps.defaultOpen !== nextProps.defaultOpen) return false
  if (prevProps.onTextFinalRender !== nextProps.onTextFinalRender) return false

  // Deep comparison for part content
  if (isChatTextPart(prevProps.part) && isChatTextPart(nextProps.part)) {
    return prevProps.part.text === nextProps.part.text
  }
  if (isChatReasoningPart(prevProps.part) && isChatReasoningPart(nextProps.part)) {
    return prevProps.part.text === nextProps.part.text
  }
  if (isChatToolPart(prevProps.part) && isChatToolPart(nextProps.part)) {
    return getToolStateHash(prevProps.part) === getToolStateHash(nextProps.part)
  }

  return prevProps.part.type === nextProps.part.type
}

export const AssistantPartRenderer = memo(function AssistantPartRenderer({
  part,
  copyPartID,
  metaText,
  interrupted,
  onOpenSession,
  stripLeadingFigureImage,
  stripLeadingMermaidSource,
  directory,
  defaultOpen,
  onTextFinalRender,
}: AssistantPartRendererProps) {
  if (part.type === "step-start" || part.type === "step-finish") {
    return null
  }

  if (isChatTextPart(part)) {
    return (
      <AssistantTextPart
        part={part}
        copyEnabled={copyPartID === part.id}
        metaText={metaText}
        interrupted={interrupted}
        stripLeadingFigureImage={stripLeadingFigureImage}
        stripLeadingMermaidSource={stripLeadingMermaidSource}
        onFinalRender={onTextFinalRender}
      />
    )
  }

  if (isChatReasoningPart(part)) {
    return <ReasoningPart part={part} />
  }

  if (part.type === "patch") {
    return null
  }

  if (isChatToolPart(part)) {
    return (
      <ToolPartCard
        part={part}
        directory={directory}
        onOpenSession={onOpenSession}
        defaultOpen={defaultOpen}
      />
    )
  }

  if (part.type === "compaction") return null

  return (
    <div className="w-full rounded-md border border-border-base bg-background-base p-2">
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-text-weak">
        {JSON.stringify(part, null, 2)}
      </pre>
    </div>
  )
}, assistantPartRendererEqual)
