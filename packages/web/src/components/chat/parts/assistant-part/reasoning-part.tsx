import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import { useAdaptiveStreamingText } from "../../hooks/use-streaming-text"
import type { ChatReasoningPart } from "../../utils/part-guards"

const REASONING_SCROLL_BOTTOM_THRESHOLD_PX = 24

type ReasoningPartProps = {
  part: ChatReasoningPart
  streaming?: boolean
}

function isScrolledNearBottom(element: HTMLDivElement): boolean {
  return (
    element.scrollHeight - element.clientHeight - element.scrollTop <=
    REASONING_SCROLL_BOTTOM_THRESHOLD_PX
  )
}

function useReasoningAutoScroll(contentKey: string) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const shouldFollowRef = useRef(true)
  const programmaticScrollRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current
    if (!element) return

    programmaticScrollRef.current = true
    element.scrollTop = element.scrollHeight

    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false
    })
  }, [])

  const handleScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element || programmaticScrollRef.current) return
    shouldFollowRef.current = isScrolledNearBottom(element)
  }, [])

  useLayoutEffect(() => {
    if (!shouldFollowRef.current) return
    scrollToBottom()
  }, [contentKey, scrollToBottom])

  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => {
      if (!shouldFollowRef.current) return
      scrollToBottom()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToBottom])

  return { scrollRef, contentRef, handleScroll }
}

export const ReasoningPart = memo(function ReasoningPart({
  part,
  streaming = false,
}: ReasoningPartProps) {
  const text = part.text
  const displayedText = useAdaptiveStreamingText(text, { live: streaming })
  const { scrollRef, contentRef, handleScroll } = useReasoningAutoScroll(displayedText)
  const renderAsStreamingText =
    streaming || displayedText !== text || typeof part.time.end !== "number"

  if (!displayedText.trim()) return null

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="min-w-0 w-full max-w-full max-h-[min(42vh,28rem)] overflow-y-auto overscroll-contain opacity-60"
    >
      <div ref={contentRef} className="min-w-0 w-full max-w-full px-4">
        {renderAsStreamingText ? (
          <div
            data-reasoning-streaming-plain="true"
            className="min-w-0 w-full max-w-full whitespace-pre-wrap text-xs leading-[1.6] text-text-base [overflow-wrap:anywhere]"
          >
            {displayedText}
          </div>
        ) : (
          <Markdown text={displayedText} cacheKey={part.id} preferEagerRender />
        )}
      </div>
    </div>
  )
})
