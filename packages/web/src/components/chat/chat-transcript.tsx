import { measureElement as measureVirtualElement, useVirtualizer } from "@tanstack/react-virtual"
import { memo, useCallback, useEffect, useMemo } from "react"
import { TooltipProvider } from "@buddy/ui"

import "./tools"

import {
  isMessageAbortError,
  formatMessageError,
  buildTurns,
  estimateTurnHeight,
  toolDefaultOpen,
  chatTranscriptEqual,
  turnRendererEqual,
  CHAT_SCROLL_ANCHOR_THRESHOLD_PX,
} from "./utils"
import { useAssistantMeta, useAssistantDerivedState } from "./hooks"
import {
  UserMessagePart,
  AbstractedToolGroup,
  AbstractedThinkingPlaceholder,
  AssistantErrorCard,
  AssistantPartRenderer,
  FileAttachmentPart,
  MessageDivider,
} from "./parts"
import { isAttachmentFilePart } from "./shared/highlighted-text"
import { parseToolState } from "./tools/parse-tool-state"
import { parseRenderFigureOutput, parseRenderMermaidOutput } from "./tools/tools"
import {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { useChatStore } from "@/state/chat-store"
import type { MessageWithParts, ProviderInfo } from "@/state/chat-types"
import type {
  ChatTranscriptProps,
  TurnRowProps,
  TurnRendererProps,
  AssistantSectionProps,
  UserSectionProps,
} from "./types"

const EMPTY_MESSAGES: MessageWithParts[] = []
const EMPTY_PROVIDERS: ProviderInfo[] = []

const TurnRow = memo(function TurnRow({
  turn,
  turnIndex,
  totalTurns,
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
    <div className={turnIndex === totalTurns - 1 ? "" : "pb-12"}>
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

const AssistantSection = memo(function AssistantSection({
  assistantItems,
  collapsedAbstractedKeys,
  assistantCopyPartID,
  assistantMetaText,
  assistantAborted,
  isBusy,
  shellToolDefaultOpen,
  editToolDefaultOpen,
  directory,
  onOpenSession,
  onAssistantTextFinalRender,
  isLastTurn,
  lastAssistantTextID,
  showThinking,
  currentReasoningHeading,
}: AssistantSectionProps) {
  return (
    <div className="mt-[18px] flex w-full flex-col items-start gap-3">
      {assistantItems.map((item, itemIndex) => {
        if (item.type === "abstracted") {
          return (
            <AbstractedToolGroup
              key={item.key}
              parts={item.parts}
              onOpenSession={onOpenSession}
              directory={directory}
              copyPartID={assistantCopyPartID}
              metaText={assistantMetaText}
              interrupted={assistantAborted}
              isBusy={isBusy}
              collapsePreview={collapsedAbstractedKeys.has(item.key)}
              shellToolDefaultOpen={shellToolDefaultOpen}
            />
          )
        }

        const previousItem = assistantItems[itemIndex - 1]
        const previousPart = previousItem?.type === "part" ? previousItem.part : undefined
        const previousPartState = previousPart ? parseToolState(previousPart) : undefined
        const stripLeadingFigureImage =
          item.part.type === "text" &&
          previousPart?.type === "tool" &&
          (String(previousPart.tool ?? "") === "render_figure" ||
            String(previousPart.tool ?? "") === "render_freeform_figure") &&
          previousPartState?.status === "completed" &&
          !!parseRenderFigureOutput(previousPartState)
        const stripLeadingMermaidSource =
          item.part.type === "text" &&
          previousPart?.type === "tool" &&
          String(previousPart.tool ?? "") === "render_mermaid" &&
          previousPartState?.status === "completed"
            ? parseRenderMermaidOutput(previousPartState)?.source
            : undefined

        return (
          <AssistantPartRenderer
            key={item.key}
            part={item.part}
            copyPartID={assistantCopyPartID}
            metaText={assistantMetaText}
            interrupted={assistantAborted}
            onOpenSession={onOpenSession}
            stripLeadingFigureImage={stripLeadingFigureImage}
            stripLeadingMermaidSource={stripLeadingMermaidSource}
            directory={directory}
            onTextFinalRender={
              isLastTurn && item.part.type === "text" && item.part.id === lastAssistantTextID
                ? onAssistantTextFinalRender
                : undefined
            }
            defaultOpen={
              item.part.type === "tool"
                ? toolDefaultOpen(
                    String(item.part.tool ?? ""),
                    shellToolDefaultOpen,
                    editToolDefaultOpen,
                  )
                : undefined
            }
          />
        )
      })}
      {showThinking ? <AbstractedThinkingPlaceholder detail={currentReasoningHeading} /> : null}
    </div>
  )
})

const UserSection = memo(function UserSection({
  userMessage,
  providers,
  onForkMessage,
  onRevertMessage,
}: UserSectionProps) {
  const userParts = useMemo(() => userMessage?.parts ?? [], [userMessage?.parts])
  const userFileParts = useMemo(() => userParts.filter((part) => part.type === "file"), [userParts])
  const userAttachmentParts = useMemo(
    () => userFileParts.filter(isAttachmentFilePart),
    [userFileParts],
  )
  const userInlineFileParts = useMemo(
    () => userFileParts.filter((part) => !isAttachmentFilePart(part)),
    [userFileParts],
  )
  const userAgentParts = useMemo(
    () => userParts.filter((part) => part.type === "agent"),
    [userParts],
  )
  const userTextParts = useMemo(() => userParts.filter((part) => part.type === "text"), [userParts])

  if (!userMessage) return null

  return (
    <div className="ml-auto flex w-fit flex-col items-end gap-2 text-sm">
      <div className="group/user flex w-full flex-col items-end gap-2">
        {userAttachmentParts.length > 0 ? (
          <div className="flex w-fit max-w-[min(82%,64ch)] flex-wrap justify-end gap-2">
            {userAttachmentParts.map((part) => (
              <FileAttachmentPart key={part.id} part={part} />
            ))}
          </div>
        ) : null}
        {userTextParts.map((part) => (
          <UserMessagePart
            key={part.id}
            part={part}
            info={userMessage.info}
            references={userInlineFileParts}
            agents={userAgentParts}
            providers={providers}
            onForkMessage={
              onForkMessage
                ? () =>
                    onForkMessage({
                      sessionID: userMessage.info.sessionID,
                      messageID: userMessage.info.id,
                    })
                : undefined
            }
            onRevertMessage={
              onRevertMessage
                ? () =>
                    onRevertMessage({
                      sessionID: userMessage.info.sessionID,
                      messageID: userMessage.info.id,
                    })
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
})

const TurnRenderer = memo(function TurnRenderer({
  turn,
  turnIndex,
  totalTurns,
  providers,
  isBusy,
  directory,
  onAssistantTextFinalRender,
  onOpenSession,
  onForkMessage,
  onRevertMessage,
  showReasoningSummaries,
  shellToolDefaultOpen,
  editToolDefaultOpen,
}: TurnRendererProps) {
  const isLastTurn = turnIndex === totalTurns - 1
  const userMessage = turn.user
  const assistantMessages = turn.assistants

  const assistantParts = useMemo(
    () => assistantMessages.flatMap((message) => message.parts),
    [assistantMessages],
  )

  const {
    assistantItems,
    collapsedAbstractedKeys,
    assistantTextParts,
    currentReasoningHeading,
    assistantError,
    assistantErrorName,
  } = useAssistantDerivedState(assistantParts, showReasoningSummaries, assistantMessages)

  const assistantErrorText = useMemo(() => formatMessageError(assistantError), [assistantError])

  const lastAssistantTextID = assistantTextParts[assistantTextParts.length - 1]?.id
  const lastAssistantInfo = assistantMessages[assistantMessages.length - 1]?.info
  const assistantCopyPartID = isBusy && isLastTurn ? undefined : lastAssistantTextID
  const assistantAborted =
    lastAssistantInfo?.role === "assistant" &&
    (lastAssistantInfo.finish === "aborted" || isMessageAbortError(lastAssistantInfo.error))
  const assistantErrored = assistantErrorText.length > 0

  const assistantCompleted = assistantMessages.reduce<number | undefined>((max, message) => {
    const completed = message.info.time?.completed
    if (typeof completed !== "number") return max
    if (typeof max !== "number") return completed
    return Math.max(max, completed)
  }, undefined)
  const turnStart = userMessage?.info.time?.created ?? assistantMessages[0]?.info.time?.created
  const turnDurationMs =
    typeof turnStart === "number" &&
    typeof assistantCompleted === "number" &&
    assistantCompleted >= turnStart
      ? assistantCompleted - turnStart
      : undefined

  const assistantMetaText = useAssistantMeta(
    assistantMessages,
    providers,
    turnDurationMs,
    assistantAborted,
  )

  const showAssistantSection = assistantMessages.length > 0 || (isBusy && isLastTurn)
  const showThinking =
    isBusy &&
    isLastTurn &&
    !assistantErrored &&
    (showReasoningSummaries ? assistantItems.length === 0 : true)

  return (
    <article className="relative w-full px-4 md:px-5">
      <UserSection
        userMessage={userMessage}
        providers={providers}
        onForkMessage={onForkMessage}
        onRevertMessage={onRevertMessage}
      />

      {assistantAborted ? <MessageDivider label="Interrupted" /> : null}

      {showAssistantSection ? (
        <AssistantSection
          assistantItems={assistantItems}
          collapsedAbstractedKeys={collapsedAbstractedKeys}
          assistantCopyPartID={assistantCopyPartID}
          assistantMetaText={assistantMetaText}
          assistantAborted={assistantAborted}
          isBusy={isBusy}
          shellToolDefaultOpen={shellToolDefaultOpen}
          editToolDefaultOpen={editToolDefaultOpen}
          directory={directory}
          onOpenSession={onOpenSession}
          onAssistantTextFinalRender={onAssistantTextFinalRender}
          isLastTurn={isLastTurn}
          lastAssistantTextID={lastAssistantTextID}
          showThinking={showThinking}
          currentReasoningHeading={!showReasoningSummaries ? currentReasoningHeading : undefined}
        />
      ) : null}

      {assistantErrorText ? (
        <AssistantErrorCard message={assistantErrorText} errorName={assistantErrorName} />
      ) : null}
    </article>
  )
}, turnRendererEqual)

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
      <div className="flex w-full flex-col items-start">
        {shouldVirtualizeTurns ? (
          <>
            <div
              className="relative w-full"
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
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <TurnRow
                      turn={turn}
                      turnIndex={virtualRow.index}
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
                )
              })}
            </div>

            {liveTurns.map((turn, offset) => (
              <div key={turn.key} className="w-full">
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
          </>
        ) : (
          turns.map((turn, turnIndex) => (
            <div key={turn.key} className="w-full">
              <TurnRow
                turn={turn}
                turnIndex={turnIndex}
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
          ))
        )}
      </div>
    </TooltipProvider>
  )
}, chatTranscriptEqual)
