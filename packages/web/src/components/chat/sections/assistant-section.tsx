import { memo } from "react"
import { AbstractedThinkingPlaceholder } from "../tools/abstracted-tool-group"
import { AbstractedToolGroup } from "../tools/abstracted-tool-group"
import { AssistantPartRenderer } from "../parts/assistant-part/assistant-part"
import { parseToolState } from "../tools/parse-tool-state"
import { parseRenderFigureOutput } from "../tools/render/render-figure"
import { parseRenderMermaidOutput } from "../tools/render/mermaid"
import { toolDefaultOpen } from "../utils/constants"
import type { AssistantSectionProps } from "../types"

export const AssistantSection = memo(function AssistantSection({
  assistantItems,
  collapsedAbstractedKeys,
  assistantCopyPartID,
  assistantMetaText,
  assistantAborted,
  isBusy,
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
    <div className="mt-[18px] flex min-w-0 w-full max-w-full flex-col items-start gap-3">
      {assistantItems.map((item, itemIndex) => {
        if (item.type === "abstracted") {
          return (
            <AbstractedToolGroup
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
        const stripLeadingMermaidSource =
          item.part.type === "text" &&
          previousPart?.type === "tool" &&
          String(previousPart.tool ?? "") === "render_mermaid" &&
          previousPartState?.status === "completed"
            ? parseRenderMermaidOutput(previousPartState)?.source
            : undefined

        return (
          <AssistantPartRenderer
            key={item.key}
            part={item.part}
            copyPartID={assistantCopyPartID}
            metaText={assistantMetaText}
            interrupted={assistantAborted}
            onOpenSession={onOpenSession}
            stripLeadingFigureImage={stripLeadingFigureImage}
            stripLeadingMermaidSource={stripLeadingMermaidSource}
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
      {showThinking ? <AbstractedThinkingPlaceholder detail={currentReasoningHeading} /> : null}
    </div>
  )
})
