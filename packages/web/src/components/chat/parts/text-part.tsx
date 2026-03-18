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
}

function stripLeadingRenderFigureMarkdown(text: string): string {
  return text.replace(/^\s*!\[[^\]]*\]\((\/api\/(?:figures|freeform-figures)\/[^)\s]+)\)(?:\r?\n\s*)*/u, "")
}

export function AssistantTextPart({
  part,
  copyEnabled,
  metaText,
  interrupted,
  stripLeadingFigureImage,
}: AssistantTextPartProps) {
  const text = String(part.text ?? "")
  const visibleText = stripLeadingFigureImage ? stripLeadingRenderFigureMarkdown(text) : text
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
          <CopyAction value={visibleText} label="Copy response" />
          {metaText ? <span className="text-xs text-muted-foreground">{metaText}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
