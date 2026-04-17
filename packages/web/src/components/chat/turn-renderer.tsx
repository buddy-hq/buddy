import { memo, useMemo } from "react"

import { language } from "@/context/language"
import { formatMessageError } from "./utils/error"
import { useAssistantDerivedState } from "./hooks/use-assistant-derived-state"
import { useAssistantMeta } from "./hooks/use-assistant-meta"
import { UserSection } from "./sections/user-section"
import { AssistantSection } from "./sections/assistant-section"
import { MessageDivider } from "./parts/assistant-part/message-divider"
import { AssistantErrorCard } from "./assistant-error-card"
import { SessionRetryNotice } from "./session-retry-notice"
import { useChatSettings } from "@/state/chat-settings"
import { IDLE_SESSION_STATUS } from "@/state/session-status"
import { shallow } from "zustand/shallow"
import type { TurnRendererProps } from "./types"

export function areTurnRendererPropsEqual(
  prevProps: TurnRendererProps,
  nextProps: TurnRendererProps,
): boolean {
  if (prevProps.turnIndex !== nextProps.turnIndex) return false
  if (prevProps.totalTurns !== nextProps.totalTurns) return false
  if (prevProps.isBusy !== nextProps.isBusy) return false
  if (prevProps.activeSessionStatus !== nextProps.activeSessionStatus) return false
  if (prevProps.directory !== nextProps.directory) return false
  if (prevProps.onAssistantTextFinalRender !== nextProps.onAssistantTextFinalRender) return false
  if (prevProps.onOpenSession !== nextProps.onOpenSession) return false
  if (prevProps.onForkMessage !== nextProps.onForkMessage) return false
  if (prevProps.onRevertMessage !== nextProps.onRevertMessage) return false
  if (prevProps.providers !== nextProps.providers) return false

  const prevTurn = prevProps.turn
  const nextTurn = nextProps.turn

  if (prevTurn.key !== nextTurn.key) return false
  if (prevTurn.user !== nextTurn.user) return false
  if (prevTurn.assistants.length !== nextTurn.assistants.length) return false

  for (let index = 0; index < prevTurn.assistants.length; index += 1) {
    if (prevTurn.assistants[index] !== nextTurn.assistants[index]) return false
  }

  return true
}

export const TurnRenderer = memo(function TurnRenderer({
  turn,
  turnIndex,
  totalTurns,
  providers,
  isBusy,
  activeSessionStatus,
  directory,
  onAssistantTextFinalRender,
  onOpenSession,
  onForkMessage,
  onRevertMessage,
}: TurnRendererProps) {
  const { showReasoningSummaries, shellToolDefaultOpen, editToolDefaultOpen } = useChatSettings(
    (state) => ({
      showReasoningSummaries: state.showReasoningSummaries,
      shellToolDefaultOpen: state.shellToolDefaultOpen,
      editToolDefaultOpen: state.editToolDefaultOpen,
    }),
    shallow,
  )

  const isLastTurn = turnIndex === totalTurns - 1
  const userMessage = turn.user
  const assistantMessages = turn.assistants
  const turnHasCompaction = useMemo(
    () => (userMessage?.parts ?? []).some((part) => part.type === "compaction"),
    [userMessage?.parts],
  )

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
    assistantAborted,
  } = useAssistantDerivedState(assistantParts, showReasoningSummaries, assistantMessages)

  const assistantErrorText = useMemo(() => formatMessageError(assistantError), [assistantError])

  const lastAssistantTextID = assistantTextParts[assistantTextParts.length - 1]?.id
  const assistantCopyPartID = isBusy && isLastTurn ? undefined : lastAssistantTextID
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
  const turnSessionStatus = isLastTurn ? activeSessionStatus : IDLE_SESSION_STATUS

  const showAssistantSection = assistantMessages.length > 0 || (isBusy && isLastTurn)
  const showThinking =
    isBusy &&
    isLastTurn &&
    !assistantErrored &&
    (turnSessionStatus.type === "busy" || turnHasCompaction) &&
    (showReasoningSummaries ? assistantItems.length === 0 : true)

  return (
    <article className="relative min-w-0 w-full max-w-full px-4 md:px-5">
      <UserSection
        userMessage={userMessage}
        providers={providers}
        onForkMessage={onForkMessage}
        onRevertMessage={onRevertMessage}
      />

      {turnHasCompaction ? (
        <div data-session-compaction-divider>
          <MessageDivider label={language.t("chat.compaction.compacted")} />
        </div>
      ) : null}

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

      {assistantAborted ? <MessageDivider label="Interrupted" /> : null}

      {isLastTurn ? <SessionRetryNotice status={turnSessionStatus} /> : null}

      {assistantErrorText && !assistantAborted && !isBusy ? (
        <AssistantErrorCard message={assistantErrorText} errorName={assistantErrorName} />
      ) : null}
    </article>
  )
}, areTurnRendererPropsEqual)
