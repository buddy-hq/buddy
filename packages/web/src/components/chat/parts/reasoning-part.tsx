import { memo } from "react"
import { BrainIcon } from "lucide-react"
import { Markdown } from "@/components/Markdown"
import { useThrottledText } from "../shared/hooks"
import type { MessagePart } from "@/state/chat-types"

interface ReasoningPartProps {
  part: MessagePart
}

export const ReasoningPart = memo(function ReasoningPart({ part }: ReasoningPartProps) {
  const text = String(part.text ?? "")
  const throttledText = useThrottledText(text)
  if (!throttledText.trim()) return null

  return (
    <div className="w-full">
      <div className="mt-3 rounded-lg border border-border-base bg-surface-weak/40 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-weak">
          <BrainIcon size={14} className="opacity-70" />
          <span>Thinking</span>
        </div>
        <Markdown text={throttledText} cacheKey={part.id} className="text-text-weak" />
      </div>
    </div>
  )
})
