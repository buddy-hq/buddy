import { memo } from "react"
import { HiddenStepsPlaceholder } from "../tools/hidden-steps/thinking-placeholder"
import { HiddenSteps } from "../tools/hidden-steps/index"
import { AssistantPartRenderer } from "../parts/assistant-part/assistant-part"
import { parseToolState } from "../tools/parse-tool-state"
import { parseRenderFigureOutput } from "../tools/render/render-figure"
import { parseRenderMermaidSources } from "../tools/render/mermaid"
import { toolDefaultOpen } from "../utils/constants"
import type { AssistantSectionProps } from "../types"

export const AssistantSection = memo(function AssistantSection({
  assistantItems,
  collapsedAbstractedKeys,
  assistantCopyPartID,
  assistantMetaText,
  assistantAborted,
  isBusy,
  preferEagerMarkdown,
  shellToolDefaultOpen,
  editToolDefaultOpen,
  directory,
  onOpenSession,
  onAssistantTextFinalRender,
  isLastTurn,
  lastAssistantTextID,
  showThinking,
  currentReasoningHeading,
}: AssistantSectionProps) {
  return (
    <div className="mt-5 flex min-w-0 w-full max-w-full flex-col items-start gap-4">
      {assistantItems.map((item, itemIndex) => {
        if (item.type === "abstracted") {
          return (
            <HiddenSteps
              key={item.key}
              parts={item.parts}
              onOpenSession={onOpenSession}
              directory={directory}
              copyPartID={assistantCopyPartID}
              metaText={assistantMetaText}
              interrupted={assistantAborted}
              isBusy={isBusy}
              collapsePreview={collapsedAbstractedKeys.has(item.key)}
              shellToolDefaultOpen={shellToolDefaultOpen}
            />
          )
        }

        const previousItem = assistantItems[itemIndex - 1]
        const previousPart = previousItem?.type === "part" ? previousItem.part : undefined
        const previousPartState = previousPart ? parseToolState(previousPart) : undefined
        const stripLeadingFigureImage =
          item.part.type === "text" &&
          previousPart?.type === "tool" &&
          (String(previousPart.tool ?? "") === "render_figure" ||
            String(previousPart.tool ?? "") === "render_freeform_figure") &&
          previousPartState?.status === "completed" &&
          !!parseRenderFigureOutput(previousPartState)
        const stripLeadingMermaidSources =
          item.part.type === "text" &&
          previousPart?.type === "tool" &&
          String(previousPart.tool ?? "") === "render_mermaid" &&
          previousPartState?.status === "completed"
            ? Object.values(parseRenderMermaidSources(previousPartState)).filter(
                (source): source is string =>
                  typeof source === "string" && source.trim().length > 0,
              )
            : undefined

        return (
          <AssistantPartRenderer
            key={item.key}
            part={item.part}
            copyPartID={assistantCopyPartID}
            metaText={assistantMetaText}
            interrupted={assistantAborted}
            preferEagerMarkdown={preferEagerMarkdown}
            onOpenSession={onOpenSession}
            stripLeadingFigureImage={stripLeadingFigureImage}
            stripLeadingMermaidSources={stripLeadingMermaidSources}
            directory={directory}
            onTextFinalRender={
              isLastTurn && item.part.type === "text" && item.part.id === lastAssistantTextID
                ? onAssistantTextFinalRender
                : undefined
            }
            defaultOpen={
              item.part.type === "tool"
                ? toolDefaultOpen(
                    String(item.part.tool ?? ""),
                    shellToolDefaultOpen,
                    editToolDefaultOpen,
                  )
                : undefined
            }
          />
        )
      })}
      {showThinking ? <HiddenStepsPlaceholder detail={currentReasoningHeading} /> : null}
    </div>
  )
})
