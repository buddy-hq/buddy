import { ScrollArea } from "@buddy/ui"
import { useCallback, useEffect, useState } from "react"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { JumpToLatestButton } from "@/components/chat/jump-to-latest-button"
import { BENCH_MODE_REQUEST_POLICY } from "@/lib/bench-navigation"
import { useAutoScroll } from "@/lib/directory-chat/use-auto-scroll"
import { useOpenReadingResource } from "@/lib/use-open-reading-resource"
import { prefetchSessionMessages } from "@/state/chat-actions"
import {
  useTranscriptSessionMessages,
  useTranscriptSessionMeta,
} from "@/state/transcript-repository"

type SessionBenchSurfaceProps = {
  directory: string
  sessionID: string
  onOpenSession?: (sessionID: string) => void
}

function SessionTranscriptLoading() {
  return (
    <div className="space-y-6 pt-2">
      <div className="h-3 w-28 rounded-full bg-surface-raised-base" />
      <div className="space-y-3">
        <div className="h-4 w-4/5 rounded-full bg-surface-raised-base/80" />
        <div className="h-4 w-3/5 rounded-full bg-surface-raised-base/60" />
        <div className="h-40 w-full rounded-xl bg-surface-raised-base/50" />
      </div>
    </div>
  )
}

/** A parallel subagent transcript that never changes the main chat's active session. */
export function SessionBenchSurface(props: SessionBenchSurfaceProps) {
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const messages = useTranscriptSessionMessages(props.directory, props.sessionID)
  const transcriptMeta = useTranscriptSessionMeta(props.directory, props.sessionID)
  const autoScroll = useAutoScroll({
    attachmentKey: `${props.directory}\u0000bench-session\u0000${props.sessionID}`,
  })
  const openReadingResource = useOpenReadingResource({ mode: BENCH_MODE_REQUEST_POLICY })
  const setScrollViewport = useCallback(
    (element: HTMLDivElement | null) => {
      autoScroll.scrollRef.current = element
    },
    [autoScroll.scrollRef],
  )

  useEffect(() => {
    let current = true
    setLoadError(undefined)
    void prefetchSessionMessages(props.directory, props.sessionID).catch((cause) => {
      if (!current) return
      setLoadError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => {
      current = false
    }
  }, [props.directory, props.sessionID])

  return (
    <div
      data-component="session-bench-surface"
      data-session-id={props.sessionID}
      className="relative flex h-full min-h-0 w-full min-w-0 flex-col bg-background-stronger"
    >
      <ScrollArea
        data-component="session-bench-transcript-scroll-area"
        viewportRef={setScrollViewport}
        onScroll={autoScroll.handleScroll}
        onWheel={autoScroll.handleWheel}
        onKeyDown={autoScroll.handleKeyDown}
        onPointerDown={autoScroll.handlePointerDown}
        onTouchStart={autoScroll.handleTouchStart}
        onTouchMove={autoScroll.handleTouchMove}
        onTouchEnd={autoScroll.handleTouchEnd}
        onTouchCancel={autoScroll.handleTouchCancel}
        fillContentWidth
        className="h-full min-h-0 min-w-0"
      >
        <div
          onClick={autoScroll.handleInteraction}
          className="mx-auto w-full min-w-0 max-w-full space-y-4 px-4 pb-6 pt-4 md:max-w-200"
        >
          {loadError ? (
            <p className="text-sm text-text-critical-base">{loadError}</p>
          ) : transcriptMeta.loading && messages.length === 0 ? (
            <SessionTranscriptLoading />
          ) : messages.length === 0 ? (
            <p className="text-sm text-text-weaker">
              This subagent has not produced any activity yet.
            </p>
          ) : (
            <ChatTranscript
              key={props.sessionID}
              directory={props.directory}
              sessionID={props.sessionID}
              scrollViewportRef={autoScroll.scrollRef}
              initialScrollOffset={autoScroll.initialScrollOffset}
              shouldAnchorBottom={autoScroll.shouldAnchorBottom}
              hasScrollGesture={autoScroll.hasScrollGesture}
              onViewportHeightChange={autoScroll.handleScrollGeometryChange}
              onContentSizeChange={autoScroll.handleScrollGeometryChange}
              markProgrammaticScroll={autoScroll.markProgrammaticScroll}
              onOpenSession={props.onOpenSession}
              onOpenResource={openReadingResource}
            />
          )}
        </div>
      </ScrollArea>

      {autoScroll.showJumpToLatest ? (
        <JumpToLatestButton onClick={autoScroll.forceScrollToBottom} />
      ) : null}
    </div>
  )
}
