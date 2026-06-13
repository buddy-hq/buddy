import { memo } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import type { MarkdownMermaidContext } from "@/components/markdown/Markdown"
import { CopyAction } from "../../copy-action"
import { useAdaptiveStreamingText } from "../../hooks/use-streaming-text"
import { cn } from "@buddy/ui"
import type { WorkspaceResourceOpener } from "@/lib/use-workspace-file-open"
import type { ChatTextPart } from "../../utils/part-guards"

type AssistantTextPartProps = {
  part: ChatTextPart
  copyEnabled: boolean
  metaText?: string
  interrupted?: boolean
  streaming?: boolean
  preferEagerMarkdown?: boolean
  stripLeadingFigureImage?: boolean
  stripLeadingMermaidSources?: string[]
  directory?: string
  onOpenResource?: WorkspaceResourceOpener
  onFinalRender?: () => void
}

function stripLeadingRenderFigureMarkdown(text: string): string {
  return text.replace(
    /^\s*!\[[^\]]*\]\((\/api\/artifacts\/(?:figure|freeform-figure)\/[^)\s]+\/raw(?:\?[^)\s]+)?)\)(?:\r?\n\s*)*/u,
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
  if (prevProps.metaText !== nextProps.metaText) return false
  if (prevProps.interrupted !== nextProps.interrupted) return false
  if (prevProps.streaming !== nextProps.streaming) return false
  if (prevProps.preferEagerMarkdown !== nextProps.preferEagerMarkdown) return false
  if (prevProps.stripLeadingFigureImage !== nextProps.stripLeadingFigureImage) return false
  if (prevProps.stripLeadingMermaidSources !== nextProps.stripLeadingMermaidSources) return false
  if (prevProps.directory !== nextProps.directory) return false
  if (prevProps.onOpenResource !== nextProps.onOpenResource) return false
  if (prevProps.onFinalRender !== nextProps.onFinalRender) return false
  return prevProps.part.text === nextProps.part.text
}

export const AssistantTextPart = memo(function AssistantTextPart({
  part,
  copyEnabled,
  metaText,
  interrupted,
  streaming = false,
  preferEagerMarkdown,
  stripLeadingFigureImage,
  stripLeadingMermaidSources,
  directory,
  onOpenResource,
  onFinalRender,
}: AssistantTextPartProps) {
  const text = part.text
  const withoutLeadingFigure = stripLeadingFigureImage
    ? stripLeadingRenderFigureMarkdown(text)
    : text
  const visibleText = stripLeadingMermaidSources?.length
    ? stripLeadingRenderMermaidMarkdown(withoutLeadingFigure, stripLeadingMermaidSources)
    : withoutLeadingFigure
  const displayedText = useAdaptiveStreamingText(visibleText, {
    live: streaming && interrupted !== true,
    onFinalRender,
  })
  const useStreamingMath = streaming || displayedText !== visibleText || interrupted === true
  const mermaidContext: MarkdownMermaidContext | undefined =
    directory && part.sessionID && part.messageID && part.id
      ? {
          directory,
          sessionID: part.sessionID,
          messageID: part.messageID,
          partID: part.id,
        }
      : undefined
  if (!displayedText.trim()) return null

  return (
    <div className="group/text-part min-w-0 w-full max-w-full">
      <div className="min-w-0 w-full max-w-full transition-opacity duration-75 ease-out">
        <Markdown
          text={displayedText}
          cacheKey={part.id}
          mermaidContext={mermaidContext}
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
            "mt-1 flex min-h-6 items-center gap-2.5 transition-opacity duration-200 ease-out",
            "opacity-0 group-hover/text-part:opacity-100 group-focus-within/text-part:opacity-100",
            "pointer-events-none group-hover/text-part:pointer-events-auto group-focus-within/text-part:pointer-events-auto",
            interrupted && "w-full justify-end",
          )}
        >
          <CopyAction value={displayedText} label="Copy response" />
          {metaText ? <span className="text-xs font-medium text-text-weak">{metaText}</span> : null}
        </div>
      ) : null}
    </div>
  )
}, assistantTextPartEqual)
