import { memo, useState } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import type { MarkdownMermaidContext } from "@/components/markdown/Markdown"
import type { MarkdownChemistryContext } from "@/components/markdown/Markdown"
import { CopyAction } from "../../copy-action"
import { useAdaptiveStreamingText } from "../../hooks/use-streaming-text"
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@buddy/ui"
import { SplitIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import type { WorkspaceResourceOpener } from "@/lib/use-workspace-file-open"
import { useTranscriptMessage } from "@/state/transcript-repository"
import type { ChatTextPart } from "../../utils/part-guards"
import { isSvgAutoRepairAssistantMessage } from "../../utils/message-visibility"

type AssistantTextPartProps = {
  part: ChatTextPart
  copyEnabled: boolean
  interrupted?: boolean
  streaming?: boolean
  preferEagerMarkdown?: boolean
  stripLeadingFigureImage?: boolean
  stripLeadingMermaidSources?: string[]
  directory?: string
  onOpenResource?: WorkspaceResourceOpener
  onForkMessage?: () => Promise<void> | void
}

function stripLeadingRenderFigureMarkdown(text: string): string {
  return text.replace(
    /^\s*!\[[^\]]*\]\((\/api\/objects\/(?:figure|freeform-figure)\/[^)\s]+\/raw(?:\?[^)\s]+)?)\)(?:\r?\n\s*)*/u,
    "",
  )
}

function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/gu, "\n").trim()
}

export function stripLeadingRenderMermaidMarkdown(text: string, sources: string[]): string {
  const expectedSources = new Set(
    sources.map((source) => normalizeMermaidSource(source)).filter((source) => source.length > 0),
  )
  if (expectedSources.size === 0) {
    return text
  }

  const match = text.match(
    /^\s*(`{3,}|~{3,})\s*mermaid(?:[ \t][^\n]*)?\r?\n([\s\S]*?)\r?\n\1(?:\r?\n\s*)*/u,
  )
  if (!match?.[0] || typeof match[2] !== "string") {
    return text
  }

  const blockSource = normalizeMermaidSource(match[2])
  if (!expectedSources.has(blockSource)) {
    return text
  }

  return text.slice(match[0].length)
}

function assistantTextPartEqual(
  prevProps: AssistantTextPartProps,
  nextProps: AssistantTextPartProps,
): boolean {
  if (prevProps.part.id !== nextProps.part.id) return false
  if (prevProps.copyEnabled !== nextProps.copyEnabled) return false
  if (prevProps.interrupted !== nextProps.interrupted) return false
  if (prevProps.streaming !== nextProps.streaming) return false
  if (prevProps.preferEagerMarkdown !== nextProps.preferEagerMarkdown) return false
  if (prevProps.stripLeadingFigureImage !== nextProps.stripLeadingFigureImage) return false
  if (prevProps.stripLeadingMermaidSources !== nextProps.stripLeadingMermaidSources) return false
  if (prevProps.directory !== nextProps.directory) return false
  if (prevProps.onOpenResource !== nextProps.onOpenResource) return false
  if (prevProps.onForkMessage !== nextProps.onForkMessage) return false
  return prevProps.part.text === nextProps.part.text
}

export const AssistantTextPart = memo(function AssistantTextPart({
  part,
  copyEnabled,
  interrupted,
  streaming = false,
  preferEagerMarkdown,
  stripLeadingFigureImage,
  stripLeadingMermaidSources,
  directory,
  onOpenResource,
  onForkMessage,
}: AssistantTextPartProps) {
  const [branching, setBranching] = useState(false)
  const text = part.text
  const withoutLeadingFigure = stripLeadingFigureImage
    ? stripLeadingRenderFigureMarkdown(text)
    : text
  const visibleText = stripLeadingMermaidSources?.length
    ? stripLeadingRenderMermaidMarkdown(withoutLeadingFigure, stripLeadingMermaidSources)
    : withoutLeadingFigure
  const displayedText = useAdaptiveStreamingText(visibleText, {
    live: streaming && interrupted !== true,
  })
  const useStreamingMath = streaming || displayedText !== visibleText || interrupted === true
  const message = useTranscriptMessage(part.messageID)
  const mermaidContext: MarkdownMermaidContext | undefined =
    directory && part.sessionID && part.messageID && part.id
      ? {
          directory,
          sessionID: part.sessionID,
          messageID: part.messageID,
          partID: part.id,
        }
      : undefined
  const chemistryContext: MarkdownChemistryContext | undefined =
    directory &&
    part.sessionID &&
    part.messageID &&
    part.id &&
    !isSvgAutoRepairAssistantMessage(message)
      ? {
          directory,
          sessionID: part.sessionID,
          messageID: part.messageID,
          partID: part.id,
        }
      : undefined
  if (!displayedText.trim()) return null

  async function handleForkClick() {
    if (!onForkMessage || branching) return
    setBranching(true)
    try {
      await onForkMessage()
    } catch {
      // Action layer reports fork failures on the directory.
    } finally {
      setBranching(false)
    }
  }

  return (
    <div className="group/text-part min-w-0 w-full max-w-full">
      <div className="min-w-0 w-full max-w-full transition-opacity duration-75 ease-out">
        <Markdown
          text={displayedText}
          cacheKey={part.id}
          mermaidContext={mermaidContext}
          chemistryContext={chemistryContext}
          isStreaming={useStreamingMath}
          isInterrupted={interrupted}
          preferEagerRender={preferEagerMarkdown}
          directory={directory}
          onOpenResource={onOpenResource}
        />
      </div>
      {copyEnabled ? (
        <div
          className={cn(
            "mt-3 flex min-h-6 items-center gap-2.5 text-text-weaker transition-opacity duration-200 ease-out",
            "opacity-0 group-hover/text-part:opacity-100 group-focus-within/text-part:opacity-100",
            "pointer-events-none group-hover/text-part:pointer-events-auto group-focus-within/text-part:pointer-events-auto",
            interrupted && "w-full justify-end",
          )}
        >
          {/* Same icon size as before; drop the 32×32 padded box so the row is left-flush. */}
          <CopyAction
            value={displayedText}
            label="Copy response"
            className="h-auto w-auto shrink-0 rounded-sm p-0 text-inherit hover:bg-transparent hover:text-text-weak"
          />
          {onForkMessage ? (
            <Tooltip>
              <TooltipTrigger
                type="button"
                disabled={branching}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation()
                  void handleForkClick()
                }}
                className="inline-flex h-auto w-auto shrink-0 items-center justify-center rounded-sm p-0 text-inherit transition-colors hover:bg-transparent hover:text-text-weak disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={language.t("chat.assistantMessage.branch")}
              >
                <SplitIcon className="h-4 w-4 rotate-90" />
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                <p>{language.t("chat.assistantMessage.branch")}</p>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}, assistantTextPartEqual)
