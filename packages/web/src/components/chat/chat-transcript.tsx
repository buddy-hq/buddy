import { measureElement as measureVirtualElement, useVirtualizer } from "@tanstack/react-virtual"
import { memo, useCallback, useEffect, useMemo } from "react"
import { TooltipProvider } from "@buddy/ui"

import "./tools/tools"

import { buildTurns, estimateTurnHeight, chatTranscriptEqual } from "./utils/message-utils"
import { CHAT_SCROLL_ANCHOR_THRESHOLD_PX } from "./utils/constants"
import {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { useChatStore } from "@/state/chat-store"
import { IDLE_SESSION_STATUS } from "@/state/session-status"
import type { ChatTranscriptProps, TurnRowProps } from "./types"
import { TurnRenderer } from "./turn-renderer"

const EMPTY_MESSAGES: never[] = []
const EMPTY_PROVIDERS: never[] = []

const TurnRow = memo(function TurnRow({
  turn,
  turnIndex,
  totalTurns,
  addBottomSpacing = false,
  providers,
  isLastTurnBusy,
  activeSessionStatus,
  directory,
  onAssistantTextFinalRender,
  onOpenSession,
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
        providers={providers}
        isBusy={isLastTurnBusy && turnIndex === totalTurns - 1}
        activeSessionStatus={activeSessionStatus}
        directory={directory}
        onAssistantTextFinalRender={
          turnIndex === totalTurns - 1 ? onAssistantTextFinalRender : undefined
        }
        onOpenSession={onOpenSession}
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
    onRevertMessage,
    scrollViewportRef,
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
  const messages = useMemo(
    () =>
      revertMessageID
        ? allMessages.filter((message) => message.info.id < revertMessageID)
        : allMessages,
    [allMessages, revertMessageID],
  )
  const providers = directoryState?.providers ?? EMPTY_PROVIDERS
  const isBusy = directoryState?.isBusy ?? false
  const activeSessionStatus = directoryState?.sessionID
    ? (directoryState.sessionStatusByID[directoryState.sessionID] ?? IDLE_SESSION_STATUS)
    : IDLE_SESSION_STATUS
  const turns = useMemo(() => buildTurns(messages), [messages])

  const lastMessage = messages[messages.length - 1]
  const isLastTurnBusy =
    isBusy && (lastMessage?.info.role === "assistant" || lastMessage?.info.role === "user")

  const unvirtualizedTailTurns = isLastTurnBusy
    ? VIRTUAL_CHAT_BUSY_TAIL_TURNS
    : VIRTUAL_CHAT_TAIL_TURNS
  const firstUnvirtualizedTurnIndex = Math.max(turns.length - unvirtualizedTailTurns, 0)
  const virtualizedTurns = turns.slice(0, firstUnvirtualizedTurnIndex)
  const liveTurns = turns.slice(firstUnvirtualizedTurnIndex)
  const shouldVirtualizeTurns =
    !!scrollViewportRef && turns.length >= VIRTUAL_CHAT_MIN_TURNS && virtualizedTurns.length > 0

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

    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (_item, _delta, instance) => {
      const scrollElement = instance.scrollElement
      if (!(scrollElement instanceof HTMLElement)) return true

      const remainingDistance =
        scrollElement.scrollHeight - (scrollElement.scrollTop + scrollElement.clientHeight)
      return remainingDistance > CHAT_SCROLL_ANCHOR_THRESHOLD_PX
    }

    return () => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
    }
  }, [rowVirtualizer, shouldVirtualizeTurns])

  const handleAssistantTextFinalRender = useCallback(() => {
    onAssistantTextFinalRender?.()
  }, [onAssistantTextFinalRender])

  return (
    <TooltipProvider>
      <div className="flex min-w-0 w-full max-w-full flex-col items-start gap-12">
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
                      turnIndex={virtualRow.index}
                      totalTurns={turns.length}
                      addBottomSpacing
                      providers={providers}
                      isLastTurnBusy={isLastTurnBusy}
                      activeSessionStatus={activeSessionStatus}
                      directory={directory}
                      onAssistantTextFinalRender={handleAssistantTextFinalRender}
                      onOpenSession={onOpenSession}
                      onForkMessage={onForkMessage}
                      onRevertMessage={onRevertMessage}
                    />
                  </div>
                )
              })}
            </div>

            {liveTurns.length > 0 ? (
              <div className="flex min-w-0 w-full max-w-full flex-col gap-12">
                {liveTurns.map((turn, offset) => (
                  <div key={turn.key} className="min-w-0 w-full max-w-full">
                    <TurnRow
                      turn={turn}
                      turnIndex={firstUnvirtualizedTurnIndex + offset}
                      totalTurns={turns.length}
                      providers={providers}
                      isLastTurnBusy={isLastTurnBusy}
                      activeSessionStatus={activeSessionStatus}
                      directory={directory}
                      onAssistantTextFinalRender={handleAssistantTextFinalRender}
                      onOpenSession={onOpenSession}
                      onForkMessage={onForkMessage}
                      onRevertMessage={onRevertMessage}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          turns.map((turn, turnIndex) => (
            <div key={turn.key} className="min-w-0 w-full max-w-full">
              <TurnRow
                turn={turn}
                turnIndex={turnIndex}
                totalTurns={turns.length}
                addBottomSpacing
                providers={providers}
                isLastTurnBusy={isLastTurnBusy}
                activeSessionStatus={activeSessionStatus}
                directory={directory}
                onAssistantTextFinalRender={handleAssistantTextFinalRender}
                onOpenSession={onOpenSession}
                onForkMessage={onForkMessage}
                onRevertMessage={onRevertMessage}
              />
            </div>
          ))
        )}
      </div>
    </TooltipProvider>
  )
}, chatTranscriptEqual)
