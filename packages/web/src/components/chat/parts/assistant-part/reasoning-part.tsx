import { memo } from "react"
import { Markdown } from "@/components/Markdown"
import { useThrottledText } from "../../hooks/use-throttled-text"
import type { MessagePart } from "@/state/chat-types"

interface ReasoningPartProps {
  part: MessagePart
}

export const ReasoningPart = memo(function ReasoningPart({ part }: ReasoningPartProps) {
  const text = String(part.text ?? "")
  const throttledText = useThrottledText(text)

  if (!throttledText.trim()) return null

  return (
    <div className="mt-3 w-full">
      <Markdown text={throttledText} cacheKey={part.id} className="text-sm text-text-weak/60" />
    </div>
  )
})
