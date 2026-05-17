import { memo } from "react"
import { BasicTool } from "../../tools/basic-tool"
import { InlineAssetBoundary } from "../../inline-asset-boundary"
import { parseToolState } from "../../tools/parse-tool-state"
import { parseToolUiMetadata } from "../../tools/parse-tool-ui-metadata"
import { resolveToolRenderer } from "../../tools/registry"
import { getToolInfo } from "../../tools/tool-info"
import type { ToolCardRenderer, ToolPartProps } from "../../tools/registry"
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

function DeferredToolCardFallback(props: ToolPartProps) {
  return (
    <BasicTool
      icon={props.icon?.("h-3.5 w-3.5")}
      trigger={{ title: props.info.title, subtitle: props.info.subtitle }}
      status={props.state.status}
      hideDetails
    >
      <div aria-hidden className="space-y-2 py-1">
        <div className="h-2.5 w-44 rounded-full bg-surface-weak/45" />
        <div className="h-2.5 w-28 rounded-full bg-surface-weak/35" />
      </div>
    </BasicTool>
  )
}

function DeferredToolCardContent(props: { card: ToolCardRenderer; toolProps: ToolPartProps }) {
  return <>{props.card(props.toolProps)}</>
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

  if (renderer.deferUntilVisible && state.status === "completed") {
    return (
      <InlineAssetBoundary fallback={<DeferredToolCardFallback {...props} />}>
        <DeferredToolCardContent card={renderer.card} toolProps={props} />
      </InlineAssetBoundary>
    )
  }

  return <>{renderer.card(props)}</>
}, toolPartCardEqual)
