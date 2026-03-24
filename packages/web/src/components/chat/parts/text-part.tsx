import { memo } from "react"
import { Markdown } from "@/components/Markdown"
import { CopyAction } from "../shared/copy-action"
import { useThrottledText } from "../shared/hooks"
import { cn } from "@buddy/ui"
import type { MessagePart } from "@/state/chat-types"

interface AssistantTextPartProps {
  part: MessagePart
  copyEnabled: boolean
  metaText?: string
  interrupted?: boolean
  stripLeadingFigureImage?: boolean
  stripLeadingMermaidSource?: string
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
  return prevProps.part.text === nextProps.part.text
}

export const AssistantTextPart = memo(function AssistantTextPart({
  part,
  copyEnabled,
  metaText,
  interrupted,
  stripLeadingFigureImage,
  stripLeadingMermaidSource,
}: AssistantTextPartProps) {
  const text = String(part.text ?? "")
  const withoutLeadingFigure = stripLeadingFigureImage
    ? stripLeadingRenderFigureMarkdown(text)
    : text
  const visibleText = stripLeadingMermaidSource
    ? stripLeadingRenderMermaidMarkdown(withoutLeadingFigure, stripLeadingMermaidSource)
    : withoutLeadingFigure
  const throttledText = useThrottledText(visibleText)
  if (!throttledText.trim()) return null

  return (
    <div className="group/text-part mt-6 w-full">
      <div>
        <Markdown text={throttledText} cacheKey={part.id} />
      </div>
      {copyEnabled ? (
        <div
          className={cn(
            "mt-1 flex min-h-6 items-center gap-2.5 opacity-0 transition-opacity group-hover/text-part:opacity-100 group-focus-within/text-part:opacity-100",
            "pointer-events-none group-hover/text-part:pointer-events-auto group-focus-within/text-part:pointer-events-auto",
            interrupted && "w-full justify-end",
          )}
        >
          <CopyAction value={throttledText} label="Copy response" />
          {metaText ? <span className="text-xs text-text-weak">{metaText}</span> : null}
        </div>
      ) : null}
    </div>
  )
}, assistantTextPartEqual)
