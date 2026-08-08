import { memo } from "react"
import type { ResourceReadingTarget } from "@/state/resources-query"
import { BasicTool } from "../../tools/basic-tool"
import { InlineAssetBoundary } from "../../inline-asset-boundary"
import { parseToolState } from "../../tools/parse-tool-state"
import { parseToolPresentation } from "../../tools/parse-tool-presentation"
import { resolveToolIcon, resolveToolRenderer } from "../../tools/registry"
import { getToolInfo } from "../../tools/tool-info"
import type { ToolCardRenderer, ToolPartProps } from "../../tools/registry"
import type { ChatToolPart } from "../../utils/part-guards"

type ToolPartRendererProps = {
  part: ChatToolPart
  directory?: string
  canEditImages?: boolean
  onOpenSession?: (sessionID: string) => void
  onOpenResource?: (directory: string, resource: ResourceReadingTarget) => void
  defaultOpen?: boolean
}

function toolPartCardEqual(
  prevProps: ToolPartRendererProps,
  nextProps: ToolPartRendererProps,
): boolean {
  if (prevProps.part.id !== nextProps.part.id) return false
  if (prevProps.directory !== nextProps.directory) return false
  if (prevProps.canEditImages !== nextProps.canEditImages) return false
  if (prevProps.onOpenSession !== nextProps.onOpenSession) return false
  if (prevProps.onOpenResource !== nextProps.onOpenResource) return false
  if (prevProps.defaultOpen !== nextProps.defaultOpen) return false

  const prevState = parseToolState(prevProps.part)
  const nextState = parseToolState(nextProps.part)

  return (
    prevState.status === nextState.status &&
    JSON.stringify(prevProps.part.metadata) === JSON.stringify(nextProps.part.metadata) &&
    JSON.stringify(prevState.output) === JSON.stringify(nextState.output) &&
    JSON.stringify(prevState.metadata) === JSON.stringify(nextState.metadata) &&
    JSON.stringify(prevState.attachments) === JSON.stringify(nextState.attachments)
  )
}

function DeferredToolCardFallback(props: ToolPartProps) {
  return (
    <div data-component="deferred-tool-fallback">
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
    </div>
  )
}

function DeferredToolCardContent(props: { card: ToolCardRenderer; toolProps: ToolPartProps }) {
  return <>{props.card(props.toolProps)}</>
}

export const ToolPartCard = memo(function ToolPartCard({
  part,
  directory,
  canEditImages,
  onOpenSession,
  onOpenResource,
  defaultOpen,
}: ToolPartRendererProps) {
  const tool = part.tool

  const state = parseToolState(part)
  const presentation = parseToolPresentation(part)
  if (
    !presentation ||
    presentation.archetype === "silent" ||
    presentation.outcome.type === "silent"
  ) {
    return null
  }
  const renderer = resolveToolRenderer(presentation.renderer)
  const icon = resolveToolIcon(presentation.icon)

  const info = getToolInfo(tool, state, presentation)
  const props: ToolPartProps = {
    part,
    state,
    info,
    tool,
    icon,
    directory,
    canEditImages,
    onOpenSession,
    onOpenResource,
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
