import { measureElement as measureVirtualElement, useVirtualizer } from "@tanstack/react-virtual"
import { memo, useCallback, useEffect, useMemo } from "react"
import { TooltipProvider } from "@buddy/ui"

import "./tools"

import {
  buildTurns,
  estimateTurnHeight,
  chatTranscriptEqual,
  CHAT_SCROLL_ANCHOR_THRESHOLD_PX,
} from "./utils"
import {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { useChatStore } from "@/state/chat-store"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"
import type { ChatTranscriptProps, TurnRowProps } from "./types"
import { TurnRenderer } from "./turn-renderer"

const EMPTY_MESSAGES: MessageWithParts[] = []
const EMPTY_PROVIDERS: ProviderInfo[] = []

const TurnRow = memo(function TurnRow({
  turn,
  turnIndex,
  totalTurns,
  addBottomSpacing = false,
  providers,
  isLastTurnBusy,
  directory,
  onAssistantTextFinalRender,
  onOpenSession,
  onForkMessage,
  onRevertMessage,
  showReasoningSummaries,
  shellToolDefaultOpen,
  editToolDefaultOpen,
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
        directory={directory}
        onAssistantTextFinalRender={
          turnIndex === totalTurns - 1 ? onAssistantTextFinalRender : undefined
        }
        onOpenSession={onOpenSession}
        onForkMessage={onForkMessage}
        onRevertMessage={onRevertMessage}
        showReasoningSummaries={showReasoningSummaries}
        shellToolDefaultOpen={shellToolDefaultOpen}
        editToolDefaultOpen={editToolDefaultOpen}
      />
    </div>
  )
})

export const ChatTranscript = memo(function ChatTranscript(props: ChatTranscriptProps) {
  const {
    directory,
    editToolDefaultOpen: editToolDefaultOpenProp,
    isBusy: isBusyProp,
    messages: messagesProp,
    onAssistantTextFinalRender,
    onForkMessage,
    onOpenSession,
    onRevertMessage,
    providers: providersProp,
    scrollViewportRef,
    shellToolDefaultOpen: shellToolDefaultOpenProp,
    showReasoningSummaries: showReasoningSummariesProp,
  } = props
  const directoryState = useChatStore((state) =>
    directory ? state.directories[directory] : undefined,
  )
  const messages = messagesProp ?? directoryState?.messages ?? EMPTY_MESSAGES
  const providers = providersProp ?? directoryState?.providers ?? EMPTY_PROVIDERS
  const isBusy = isBusyProp ?? directoryState?.isBusy ?? false
  const turns = useMemo(() => buildTurns(messages), [messages])

  const lastMessage = messages[messages.length - 1]
  const isLastTurnBusy =
    isBusy && (lastMessage?.info.role === "assistant" || lastMessage?.info.role === "user")

  const showReasoningSummaries = showReasoningSummariesProp ?? true
  const shellToolDefaultOpen = shellToolDefaultOpenProp ?? false
  const editToolDefaultOpen = editToolDefaultOpenProp ?? false

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
                      directory={directory}
                      onAssistantTextFinalRender={handleAssistantTextFinalRender}
                      onOpenSession={onOpenSession}
                      onForkMessage={onForkMessage}
                      onRevertMessage={onRevertMessage}
                      showReasoningSummaries={showReasoningSummaries}
                      shellToolDefaultOpen={shellToolDefaultOpen}
                      editToolDefaultOpen={editToolDefaultOpen}
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
                      directory={directory}
                      onAssistantTextFinalRender={handleAssistantTextFinalRender}
                      onOpenSession={onOpenSession}
                      onForkMessage={onForkMessage}
                      onRevertMessage={onRevertMessage}
                      showReasoningSummaries={showReasoningSummaries}
                      shellToolDefaultOpen={shellToolDefaultOpen}
                      editToolDefaultOpen={editToolDefaultOpen}
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
                directory={directory}
                onAssistantTextFinalRender={handleAssistantTextFinalRender}
                onOpenSession={onOpenSession}
                onForkMessage={onForkMessage}
                onRevertMessage={onRevertMessage}
                showReasoningSummaries={showReasoningSummaries}
                shellToolDefaultOpen={shellToolDefaultOpen}
                editToolDefaultOpen={editToolDefaultOpen}
              />
            </div>
          ))
        )}
      </div>
    </TooltipProvider>
  )
}, chatTranscriptEqual)
