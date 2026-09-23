import { memo } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import type { ChatReasoningPart } from "../../utils/part-guards"
import { parseTNumber } from "../../tools/types"
import { reasoningBodyWithoutLeadingHeading } from "../../utils/markdown"

type ReasoningPartProps = {
  part: ChatReasoningPart
  streaming?: boolean
}

export const ReasoningPart = memo(function ReasoningPart({
  part,
  streaming = false,
}: ReasoningPartProps) {
  const active = parseTNumber(part.time?.end) === undefined
  const text = active ? part.text : reasoningBodyWithoutLeadingHeading(part.text)
  const isStreaming = streaming || active

  if (!text.trim()) return null

  return (
    <div className="min-w-0 w-full max-w-full opacity-60">
      <div data-chat-typography className="min-w-0 w-full max-w-full px-4">
        <Markdown text={text} cacheKey={part.id} isStreaming={isStreaming} />
      </div>
    </div>
  )
})
