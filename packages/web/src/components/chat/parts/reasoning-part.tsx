import { useState } from "react"
import { Markdown } from "@/components/Markdown"
import { useThrottledText } from "../shared/hooks"
import { Collapsible, CollapsibleTrigger, CollapsibleContent, ChevronRightIcon, cn } from "@buddy/ui"
import type { MessagePart } from "@/state/chat-types"

interface ReasoningPartProps {
  part: MessagePart
}

export function ReasoningPart({ part }: ReasoningPartProps) {
  const text = String(part.text ?? "")
  const throttledText = useThrottledText(text)
  const [isOpen, setIsOpen] = useState(false)
  if (!throttledText.trim()) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="w-full text-muted-foreground">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={isOpen}
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRightIcon className={cn("h-4 w-4 transition-transform", isOpen && "rotate-90")} />
            Thinking
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-3">
            <Markdown text={throttledText} cacheKey={part.id} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
