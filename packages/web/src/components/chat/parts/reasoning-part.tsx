import { memo } from 'react'
import { Markdown } from '@/components/Markdown'
import { useThrottledText } from '../shared/hooks'
import type { MessagePart } from '@/state/chat-types'

interface ReasoningPartProps {
  part: MessagePart
}

export const ReasoningPart = memo(function ReasoningPart({ part }: ReasoningPartProps) {
  const text = String(part.text ?? '')
  const throttledText = useThrottledText(text)
  if (!throttledText.trim()) return null

  return (
    <div className="w-full text-muted-foreground">
      <div className="mt-3">
        <Markdown text={throttledText} cacheKey={part.id} />
      </div>
    </div>
  )
})
