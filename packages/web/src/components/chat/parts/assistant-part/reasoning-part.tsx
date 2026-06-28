import { memo } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import type { ChatReasoningPart } from "../../utils/part-guards"

type ReasoningPartProps = {
  part: ChatReasoningPart
  streaming?: boolean
}

export const ReasoningPart = memo(function ReasoningPart({
  part,
  streaming = false,
}: ReasoningPartProps) {
  const text = part.text
  const isStreaming = streaming || typeof part.time.end !== "number"

  if (!text.trim()) return null

  return (
    <div className="min-w-0 w-full max-w-full opacity-60">
      <div className="min-w-0 w-full max-w-full px-4">
        <Markdown text={text} cacheKey={part.id} isStreaming={isStreaming} />
      </div>
    </div>
  )
})
