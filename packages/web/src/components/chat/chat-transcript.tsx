import { measureElement as measureVirtualElement, useVirtualizer } from "@tanstack/react-virtual"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { TooltipProvider } from "@buddy/ui"

import { buildTurns, estimateTurnHeight, chatTranscriptEqual } from "./utils/message-utils"
import "@/components/chat/tools/text-shimmer.css"
import {
  MARKDOWN_MATH_PLACEHOLDER_BLOCK_DISPLAY,
  MARKDOWN_MATH_PLACEHOLDER_COMPONENT,
  MARKDOWN_MATH_PLACEHOLDER_LINE_SLOT,
} from "@/components/markdown/markdown-math-placeholder"
import {
  getInitialStagedTurnCount,
  sliceStagedTurns,
  shouldStageTranscriptEntry,
} from "./transcript-staging"
import {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_ESTIMATED_HEIGHT_PX,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_STAGE_BATCH_TURNS,
  VIRTUAL_CHAT_STAGE_INITIAL_TURNS,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { useChatStore } from "@/state/chat-store"
import { IDLE_SESSION_STATUS } from "@/state/session-status"
import type { ChatTranscriptProps, ChatTurn, TurnRowProps } from "./types"
import { TurnRenderer } from "./turn-renderer"
import { isHiddenFromUserMessage } from "./utils/message-visibility"
import { ChatScrollProvider } from "./chat-scroll-context"

const EMPTY_MESSAGES: never[] = []
const EMPTY_PROVIDERS: never[] = []
const HISTORY_PREPEND_TOP_THRESHOLD_PX = 160
const HISTORY_PREPEND_COOLDOWN_MS = 180

function ChatHistorySkeleton() {
  return (
    <span
      data-component={MARKDOWN_MATH_PLACEHOLDER_COMPONENT}
      data-display={MARKDOWN_MATH_PLACEHOLDER_BLOCK_DISPLAY}
      aria-hidden="true"
    >
      <span data-slot={MARKDOWN_MATH_PLACEHOLDER_LINE_SLOT} />
      <span data-slot={MARKDOWN_MATH_PLACEHOLDER_LINE_SLOT} />
    </span>
  )
}

const TurnRow = memo(function TurnRow({
  turn,
  turnIndex,
  totalTurns,
  addBottomSpacing = false,
  preferEagerMarkdown = false,
  providers,
  isLastTurnBusy,
  activeSessionStatus,
  directory,
  onAssistantTextFinalRender,
  onOpenSession,
  onOpenResource,
  onForkMessage,
  onRevertMessage,
}: TurnRowProps) {
  return (
    <div
      className={
        addBottomSpacing && turnIndex !== totalTurns - 1
          ? "min-w-0 w-full max-w-full pb-12"
          : "min-w-0 w-full max-w-full"
      }
    >
      <TurnRenderer
        turn={turn}
        turnIndex={turnIndex}
        totalTurns={totalTurns}
        preferEagerMarkdown={preferEagerMarkdown}
        providers={providers}
        isBusy={isLastTurnBusy && turnIndex === totalTurns - 1}
        activeSessionStatus={activeSessionStatus}
        directory={directory}
        onAssistantTextFinalRender={
          turnIndex === totalTurns - 1 ? onAssistantTextFinalRender : undefined
        }
        onOpenSession={onOpenSession}
        onOpenResource={onOpenResource}
        onForkMessage={onForkMessage}
        onRevertMessage={onRevertMessage}
      />
    </div>
  )
})

export const ChatTranscript = memo(function ChatTranscript(props: ChatTranscriptProps) {
  const {
    directory,
    onAssistantTextFinalRender,
    onForkMessage,
    onOpenSession,
    onOpenResource,
    onRevertMessage,
    scrollViewportRef,
    userScrolled = false,
  } = props
  const directoryState = useChatStore((state) =>
    directory ? state.directories[directory] : undefined,
  )
  const sessions = directoryState?.sessions ?? []
  const allMessages = directoryState?.messages ?? EMPTY_MESSAGES
  const activeSession = directoryState?.sessionID
    ? sessions.find((session) => session.id === directoryState.sessionID)
    : undefined
  const revertMessageID = activeSession?.revert?.messageID
  const messages = useMemo(() => {
    const visibleMessages = allMessages.filter((message) => !isHiddenFromUserMessage(message))
    return revertMessageID
      ? visibleMessages.filter((message) => message.info.id < revertMessageID)
      : visibleMessages
  }, [allMessages, revertMessageID])
  const providers = directoryState?.providers ?? EMPTY_PROVIDERS
  const isBusy = directoryState?.isBusy ?? false
  const sessionID = directoryState?.sessionID
  const activeSessionStatus = directoryState?.sessionID
    ? (directoryState.sessionStatusByID[directoryState.sessionID] ?? IDLE_SESSION_STATUS)
    : IDLE_SESSION_STATUS
  const baseTurns = useMemo(() => buildTurns(messages), [messages])
  const hasBusyPlaceholderTurn = isBusy && baseTurns.length === 0
  const turns = useMemo<ChatTurn[]>(
    () =>
      hasBusyPlaceholderTurn
        ? [
            {
              key: `turn:busy:${sessionID ?? directory ?? "active"}`,
              assistants: [],
            },
          ]
        : baseTurns,
    [baseTurns, directory, hasBusyPlaceholderTurn, sessionID],
  )

  const lastMessage = messages[messages.length - 1]
  const isLastTurnBusy =
    isBusy &&
    (hasBusyPlaceholderTurn ||
      lastMessage?.info.role === "assistant" ||
      lastMessage?.info.role === "user")

  const shouldStageEntry = shouldStageTranscriptEntry({
    turns,
  })
  const initialStagedTurnCount = useMemo(
    () =>
      getInitialStagedTurnCount({
        sessionID,
        turns,
      }),
    [sessionID, turns],
  )
  const [stagedTurnCount, setStagedTurnCount] = useState<number | undefined>(initialStagedTurnCount)
  const stagedSessionRef = useRef<string | undefined>(sessionID)
  const stagedTurnsLengthRef = useRef(turns.length)
  const entryFadeSessionRef = useRef<string | undefined>(sessionID)
  const historyPrependFrameRef = useRef<number | undefined>(undefined)
  const historyPrependCooldownRef = useRef<number | undefined>(undefined)
  const historyPrependAnchorRef = useRef<{
    scrollHeight: number
    scrollTop: number
    sessionID: string | undefined
  } | null>(null)
  const [entryFadeVisible, setEntryFadeVisible] = useState(!shouldStageEntry)

  stagedTurnsLengthRef.current = turns.length
  const effectiveStagedTurnCount =
    stagedSessionRef.current === sessionID ? stagedTurnCount : initialStagedTurnCount
  const shouldShowEntryFade =
    shouldStageEntry && entryFadeSessionRef.current !== sessionID ? false : entryFadeVisible

  useEffect(() => {
    const cancel = () => {
      if (historyPrependFrameRef.current !== undefined) {
        window.cancelAnimationFrame(historyPrependFrameRef.current)
        historyPrependFrameRef.current = undefined
      }
      if (historyPrependCooldownRef.current !== undefined) {
        window.clearTimeout(historyPrependCooldownRef.current)
        historyPrependCooldownRef.current = undefined
      }
    }

    cancel()
    stagedSessionRef.current = sessionID
    const totalTurns = stagedTurnsLengthRef.current

    if (!sessionID || !shouldStageEntry) {
      setStagedTurnCount(totalTurns)
      return cancel
    }

    const count = Math.min(totalTurns, VIRTUAL_CHAT_STAGE_INITIAL_TURNS)
    setStagedTurnCount(count)
    return cancel
  }, [sessionID, shouldStageEntry])

  useLayoutEffect(() => {
    entryFadeSessionRef.current = sessionID

    if (!sessionID || !shouldStageEntry) {
      setEntryFadeVisible(true)
      return
    }

    setEntryFadeVisible(false)
    const raf = window.requestAnimationFrame(() => {
      setEntryFadeVisible(true)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [sessionID, shouldStageEntry])

  useEffect(() => {
    if (shouldStageEntry) return
    setStagedTurnCount(turns.length)
  }, [sessionID, shouldStageEntry, turns.length])

  const { renderedTurns, renderedStartIndex } = useMemo(
    () => sliceStagedTurns(turns, effectiveStagedTurnCount),
    [effectiveStagedTurnCount, turns],
  )
  const hasHiddenHistory = renderedStartIndex > 0
  const estimatedRenderedTranscriptHeight = useMemo(
    () => renderedTurns.reduce((total, turn) => total + estimateTurnHeight(turn), 0),
    [renderedTurns],
  )
  const unvirtualizedTailTurns = isLastTurnBusy
    ? VIRTUAL_CHAT_BUSY_TAIL_TURNS
    : VIRTUAL_CHAT_TAIL_TURNS
  const firstUnvirtualizedTurnIndex = Math.max(renderedTurns.length - unvirtualizedTailTurns, 0)
  const virtualizedTurns = renderedTurns.slice(0, firstUnvirtualizedTurnIndex)
  const liveTurns = renderedTurns.slice(firstUnvirtualizedTurnIndex)
  const shouldVirtualizeTurns =
    renderedStartIndex === 0 &&
    !!scrollViewportRef &&
    virtualizedTurns.length > 0 &&
    (renderedTurns.length >= VIRTUAL_CHAT_MIN_TURNS ||
      estimatedRenderedTranscriptHeight >= VIRTUAL_CHAT_MIN_ESTIMATED_HEIGHT_PX)

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: shouldVirtualizeTurns ? virtualizedTurns.length : 0,
    getScrollElement: () => scrollViewportRef?.current ?? null,
    getItemKey: (index) => virtualizedTurns[index]?.key ?? index,
    estimateSize: (index) => {
      const turn = virtualizedTurns[index]
      return turn ? estimateTurnHeight(turn) : VIRTUAL_CHAT_TURN_ESTIMATE_PX
    },
    measureElement: measureVirtualElement,
    enabled: shouldVirtualizeTurns,
    overscan: VIRTUAL_CHAT_OVERSCAN,
    useAnimationFrameWithResizeObserver: true,
  })

  useEffect(() => {
    if (!shouldVirtualizeTurns) return

    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => userScrolled

    return () => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
    }
  }, [rowVirtualizer, shouldVirtualizeTurns, userScrolled])

  const handleAssistantTextFinalRender = useCallback(() => {
    onAssistantTextFinalRender?.()
  }, [onAssistantTextFinalRender])
  const loadOlderHistory = useCallback(() => {
    if (!hasHiddenHistory) return
    if (historyPrependFrameRef.current !== undefined) return
    if (historyPrependCooldownRef.current !== undefined) return

    const viewport = scrollViewportRef?.current
    if (viewport instanceof HTMLElement) {
      historyPrependAnchorRef.current = {
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
        sessionID,
      }
    }

    historyPrependFrameRef.current = window.requestAnimationFrame(() => {
      historyPrependFrameRef.current = undefined
      setStagedTurnCount((current) => {
        const total = stagedTurnsLengthRef.current
        const safeCurrent = current ?? VIRTUAL_CHAT_STAGE_INITIAL_TURNS
        return Math.min(total, safeCurrent + VIRTUAL_CHAT_STAGE_BATCH_TURNS)
      })
      historyPrependCooldownRef.current = window.setTimeout(() => {
        historyPrependCooldownRef.current = undefined
      }, HISTORY_PREPEND_COOLDOWN_MS)
    })
  }, [hasHiddenHistory, scrollViewportRef, sessionID])

  useLayoutEffect(() => {
    const anchor = historyPrependAnchorRef.current
    const viewport = scrollViewportRef?.current
    if (!anchor || !(viewport instanceof HTMLElement) || anchor.sessionID !== sessionID) return

    const delta = viewport.scrollHeight - anchor.scrollHeight
    if (Math.abs(delta) > 0.5) {
      viewport.scrollTop = Math.max(0, anchor.scrollTop + delta)
    }
    historyPrependAnchorRef.current = null
  }, [renderedStartIndex, scrollViewportRef, sessionID])

  useEffect(() => {
    if (!hasHiddenHistory) return
    const viewport = scrollViewportRef?.current
    if (!(viewport instanceof HTMLElement)) return

    const handleScroll = () => {
      if (viewport.scrollTop <= HISTORY_PREPEND_TOP_THRESHOLD_PX) {
        loadOlderHistory()
      }
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [hasHiddenHistory, loadOlderHistory, scrollViewportRef])

  const preferEagerMarkdown = renderedStartIndex > 0
  const shouldBottomPackStagedTail =
    renderedStartIndex > 0 && !shouldVirtualizeTurns && !isLastTurnBusy

  return (
    <ChatScrollProvider viewportRef={scrollViewportRef}>
      <TooltipProvider>
        <div
          data-chat-transcript-tail-pack={shouldBottomPackStagedTail ? "bottom" : "natural"}
          className={`flex min-w-0 w-full max-w-full flex-col items-start gap-8 ${
            shouldBottomPackStagedTail ? "min-h-full justify-end" : ""
          }`}
          style={{
            opacity: shouldShowEntryFade ? 1 : 0,
            transform: shouldShowEntryFade ? "translateY(0)" : "translateY(6px)",
            transition: shouldStageEntry
              ? "opacity 160ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1)"
              : undefined,
          }}
        >
          {hasHiddenHistory ? (
            <button
              type="button"
              aria-label="Load older messages"
              onClick={loadOlderHistory}
              className="group flex w-full rounded-md px-4 py-1 text-left transition-opacity duration-150 hover:opacity-90"
            >
              <ChatHistorySkeleton />
            </button>
          ) : null}
          {shouldVirtualizeTurns ? (
            <>
              <div
                className="relative min-w-0 w-full max-w-full"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const turn = virtualizedTurns[virtualRow.index]
                  if (!turn) return null

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute inset-x-0 top-0 min-w-0 max-w-full"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <TurnRow
                        turn={turn}
                        turnIndex={renderedStartIndex + virtualRow.index}
                        totalTurns={turns.length}
                        addBottomSpacing
                        providers={providers}
                        isLastTurnBusy={isLastTurnBusy}
                        activeSessionStatus={activeSessionStatus}
                        directory={directory}
                        onAssistantTextFinalRender={handleAssistantTextFinalRender}
                        onOpenSession={onOpenSession}
                        onOpenResource={onOpenResource}
                        onForkMessage={onForkMessage}
                        onRevertMessage={onRevertMessage}
                      />
                    </div>
                  )
                })}
              </div>

              {liveTurns.length > 0 ? (
                <div className="flex min-w-0 w-full max-w-full flex-col gap-8">
                  {liveTurns.map((turn, offset) => (
                    <div key={turn.key} className="min-w-0 w-full max-w-full">
                      <TurnRow
                        turn={turn}
                        turnIndex={renderedStartIndex + firstUnvirtualizedTurnIndex + offset}
                        totalTurns={turns.length}
                        preferEagerMarkdown={preferEagerMarkdown}
                        providers={providers}
                        isLastTurnBusy={isLastTurnBusy}
                        activeSessionStatus={activeSessionStatus}
                        directory={directory}
                        onAssistantTextFinalRender={handleAssistantTextFinalRender}
                        onOpenSession={onOpenSession}
                        onOpenResource={onOpenResource}
                        onForkMessage={onForkMessage}
                        onRevertMessage={onRevertMessage}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            renderedTurns.map((turn, turnIndex) => (
              <div key={turn.key} className="min-w-0 w-full max-w-full">
                <TurnRow
                  turn={turn}
                  turnIndex={renderedStartIndex + turnIndex}
                  totalTurns={turns.length}
                  addBottomSpacing
                  preferEagerMarkdown={preferEagerMarkdown}
                  providers={providers}
                  isLastTurnBusy={isLastTurnBusy}
                  activeSessionStatus={activeSessionStatus}
                  directory={directory}
                  onAssistantTextFinalRender={handleAssistantTextFinalRender}
                  onOpenSession={onOpenSession}
                  onOpenResource={onOpenResource}
                  onForkMessage={onForkMessage}
                  onRevertMessage={onRevertMessage}
                />
              </div>
            ))
          )}
        </div>
      </TooltipProvider>
    </ChatScrollProvider>
  )
}, chatTranscriptEqual)
