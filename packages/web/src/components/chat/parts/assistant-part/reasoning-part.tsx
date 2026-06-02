import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { Markdown } from "@/components/markdown/Markdown"
import { useThrottledText } from "../../hooks/use-throttled-text"
import type { ChatReasoningPart } from "../../utils/part-guards"

const REASONING_SCROLL_BOTTOM_THRESHOLD_PX = 24

type ReasoningPartProps = {
  part: ChatReasoningPart
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

export const ReasoningPart = memo(function ReasoningPart({ part }: ReasoningPartProps) {
  const text = part.text
  const throttledText = useThrottledText(text)
  const { scrollRef, contentRef, handleScroll } = useReasoningAutoScroll(throttledText)

  if (!throttledText.trim()) return null

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="min-w-0 w-full max-w-full max-h-[min(42vh,28rem)] overflow-y-auto overscroll-contain opacity-60"
    >
      <div ref={contentRef} className="min-w-0 w-full max-w-full px-4">
        <Markdown text={throttledText} cacheKey={part.id} />
      </div>
    </div>
  )
})
