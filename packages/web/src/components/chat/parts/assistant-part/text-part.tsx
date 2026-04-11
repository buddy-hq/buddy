import { memo } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import { CopyAction } from "../../copy-action"
import { useAdaptiveStreamingText } from "../../hooks/use-streaming-text"
import { cn } from "@buddy/ui"
import type { ChatTextPart } from "../../utils/part-guards"

type AssistantTextPartProps = {
  part: ChatTextPart
  copyEnabled: boolean
  metaText?: string
  interrupted?: boolean
  stripLeadingFigureImage?: boolean
  stripLeadingMermaidSource?: string
  onFinalRender?: () => void
}

function stripLeadingRenderFigureMarkdown(text: string): string {
  return text.replace(
    /^\s*!\[[^\]]*\]\((\/api\/(?:figures|freeform-figures)\/[^)\s]+)\)(?:\r?\n\s*)*/u,
    "",
  )
}

function normalizeMermaidSource(source: string): string {
  return source.replace(/\r\n?/gu, "\n").trim()
}

function stripLeadingRenderMermaidMarkdown(text: string, source: string): string {
  const expectedSource = normalizeMermaidSource(source)
  if (!expectedSource) {
    return text
  }

  const match = text.match(
    /^\s*(`{3,}|~{3,})\s*mermaid(?:[ \t][^\n]*)?\r?\n([\s\S]*?)\r?\n\1(?:\r?\n\s*)*/u,
  )
  if (!match?.[0] || typeof match[2] !== "string") {
    return text
  }

  const blockSource = normalizeMermaidSource(match[2])
  if (blockSource !== expectedSource) {
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
  if (prevProps.stripLeadingFigureImage !== nextProps.stripLeadingFigureImage) return false
  if (prevProps.stripLeadingMermaidSource !== nextProps.stripLeadingMermaidSource) return false
  if (prevProps.onFinalRender !== nextProps.onFinalRender) return false
  return prevProps.part.text === nextProps.part.text
}

export const AssistantTextPart = memo(function AssistantTextPart({
  part,
  copyEnabled,
  metaText,
  interrupted,
  stripLeadingFigureImage,
  stripLeadingMermaidSource,
  onFinalRender,
}: AssistantTextPartProps) {
  const text = part.text
  const withoutLeadingFigure = stripLeadingFigureImage
    ? stripLeadingRenderFigureMarkdown(text)
    : text
  const visibleText = stripLeadingMermaidSource
    ? stripLeadingRenderMermaidMarkdown(withoutLeadingFigure, stripLeadingMermaidSource)
    : withoutLeadingFigure
  const displayedText = useAdaptiveStreamingText(visibleText, onFinalRender)
  if (!displayedText.trim()) return null

  return (
    <div className="group/text-part mt-4 min-w-0 w-full max-w-full">
      <div className="min-w-0 w-full max-w-full transition-opacity duration-75 ease-out">
        <Markdown text={displayedText} cacheKey={part.id} />
      </div>
      {copyEnabled || (interrupted && metaText) ? (
        <div
          className={cn(
            "mt-1 flex min-h-6 items-center gap-2.5 transition-opacity duration-200 ease-out",
            interrupted
              ? "w-full justify-end opacity-100"
              : "opacity-0 group-hover/text-part:opacity-100 group-focus-within/text-part:opacity-100",
            "pointer-events-none group-hover/text-part:pointer-events-auto group-focus-within/text-part:pointer-events-auto",
          )}
        >
          {copyEnabled ? <CopyAction value={displayedText} label="Copy response" /> : null}
          {metaText ? <span className="text-xs font-medium text-text-weak">{metaText}</span> : null}
        </div>
      ) : null}
    </div>
  )
}, assistantTextPartEqual)
