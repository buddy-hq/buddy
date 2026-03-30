import { measureElement as measureVirtualElement, useVirtualizer } from "@tanstack/react-virtual"
import { memo, useCallback, useEffect, useMemo, type RefObject } from "react"
import { TooltipProvider } from "@buddy/ui"
import type { MessageInfo, MessagePart, MessageWithParts, ProviderInfo } from "@/state/chat-types"
import {
  VIRTUAL_CHAT_BUSY_TAIL_TURNS,
  VIRTUAL_CHAT_MIN_TURNS,
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TAIL_TURNS,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"

// Import all tool components (this registers them)
import "./tools"

// Import shared utilities
import {
  titleCase,
  formatDuration,
  reasoningHeading,
  formatMessageError,
  isMessageAbortError,
} from "./shared/utils"

// Import parts
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

// Import tool utilities
import { parseToolState } from "./tools/parse-tool-state"
import { parseRenderFigureOutput, parseRenderMermaidOutput } from "./tools/tools"
import { HIDDEN_TOOLS } from "./tools/registry"

const ABSTRACTABLE_TOOLS = new Set([
  "read",
  "list",
  "glob",
  "grep",
  "bash",
  "websearch",
  "codesearch",
  "webfetch",
  "learner_snapshot_read",
  "pedagogy_resource_ingest_full_text",
  "skill",
])

export type { MessageWithParts, ProviderInfo } from "@/state/chat-types"

interface ChatTranscriptProps {
  messages: MessageWithParts[]
  directory?: string
  providers?: ProviderInfo[]
  isBusy?: boolean
  scrollViewportRef?: RefObject<HTMLElement>
  onAssistantTextFinalRender?: () => void
  onOpenSession?: (sessionID: string) => void
  onForkMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  showReasoningSummaries?: boolean
  shellToolDefaultOpen?: boolean
  editToolDefaultOpen?: boolean
}

function chatTranscriptEqual(prevProps: ChatTranscriptProps, nextProps: ChatTranscriptProps) {
  return (
    prevProps.messages === nextProps.messages &&
    prevProps.directory === nextProps.directory &&
    prevProps.providers === nextProps.providers &&
    prevProps.isBusy === nextProps.isBusy &&
    prevProps.scrollViewportRef === nextProps.scrollViewportRef &&
    prevProps.onAssistantTextFinalRender === nextProps.onAssistantTextFinalRender &&
    prevProps.onOpenSession === nextProps.onOpenSession &&
    prevProps.onForkMessage === nextProps.onForkMessage &&
    prevProps.onRevertMessage === nextProps.onRevertMessage &&
    prevProps.showReasoningSummaries === nextProps.showReasoningSummaries &&
    prevProps.shellToolDefaultOpen === nextProps.shellToolDefaultOpen &&
    prevProps.editToolDefaultOpen === nextProps.editToolDefaultOpen
  )
}

type AssistantRenderItem =
  | {
      type: "abstracted"
      key: string
      parts: MessagePart[]
    }
  | {
      type: "part"
      key: string
      part: MessagePart
    }

type ChatTurn = {
  key: string
  user?: MessageWithParts
  assistants: MessageWithParts[]
}

const CHAT_SCROLL_ANCHOR_THRESHOLD_PX = 96

function modelLabel(info: MessageInfo): string {
  if ("modelID" in info && info.modelID) {
    return info.modelID
  }
  if ("model" in info && info.model?.modelID) {
    return info.model.modelID
  }
  return ""
}

function assistantPartRenderable(part: MessagePart, showReasoningSummaries: boolean): boolean {
  if (part.type === "text") return String(part.text ?? "").trim().length > 0
  if (part.type === "reasoning")
    return showReasoningSummaries && String(part.text ?? "").trim().length > 0
  if (part.type === "compaction") return true
  if (part.type === "step-start" || part.type === "step-finish") return false
  if (part.type !== "tool") return true

  const tool = String(part.tool ?? "")
  if (HIDDEN_TOOLS.has(tool)) return false

  if (tool === "question") {
    const state = parseToolState(part)
    return !(state.status === "pending" || state.status === "running")
  }

  return true
}

function assistantPartStartsFollowup(part: MessagePart): boolean {
  if (part.type === "step-start" || part.type === "step-finish") return false
  if (part.type === "reasoning") return false
  if (part.type === "tool") {
    const tool = String(part.tool ?? "")
    if (HIDDEN_TOOLS.has(tool)) return false
    if (ABSTRACTABLE_TOOLS.has(tool)) return false

    if (tool === "question") {
      const state = parseToolState(part)
      return !(state.status === "pending" || state.status === "running")
    }

    return true
  }

  if (part.type === "text") return String(part.text ?? "").trim().length > 0
  return true
}

function groupAssistantParts(
  parts: MessagePart[],
  showReasoningSummaries: boolean,
): AssistantRenderItem[] {
  const visibleParts = parts.filter((part) => assistantPartRenderable(part, showReasoningSummaries))

  const items: AssistantRenderItem[] = []
  let contextStart = -1

  const flushContext = (endIndex: number) => {
    if (contextStart < 0 || endIndex < contextStart) return
    const contextParts = visibleParts.slice(contextStart, endIndex + 1)
    if (contextParts.length === 0) {
      contextStart = -1
      return
    }
    items.push({
      type: "abstracted",
      key: `abstracted:${contextParts[0]?.id ?? endIndex}`,
      parts: contextParts,
    })
    contextStart = -1
  }

  visibleParts.forEach((part, index) => {
    const partIsAbstractable =
      (part.type === "tool" && ABSTRACTABLE_TOOLS.has(String(part.tool ?? ""))) ||
      part.type === "reasoning"
    if (partIsAbstractable) {
      if (contextStart < 0) contextStart = index
      return
    }

    flushContext(index - 1)
    items.push({
      type: "part",
      key: `part:${part.id}`,
      part,
    })
  })

  flushContext(visibleParts.length - 1)

  return items
}

function buildTurns(messages: MessageWithParts[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  let current: ChatTurn | undefined

  for (const message of messages) {
    if (message.info.role === "user") {
      current = {
        key: `turn:${message.info.id}`,
        user: message,
        assistants: [],
      }
      turns.push(current)
      continue
    }

    if (!current || !current.user) {
      current = {
        key: `turn:assistant:${message.info.id}`,
        assistants: [message],
      }
      turns.push(current)
      continue
    }

    current.assistants.push(message)
  }

  return turns
}

function estimateTurnHeight(turn: ChatTurn): number {
  const userPartCount = turn.user?.parts.length ?? 0
  const assistantPartCount = turn.assistants.reduce(
    (count, message) => count + message.parts.length,
    0,
  )
  const assistantMessageCount = turn.assistants.length

  return Math.max(
    VIRTUAL_CHAT_TURN_ESTIMATE_PX,
    180 + userPartCount * 36 + assistantPartCount * 40 + assistantMessageCount * 48,
  )
}

function toolDefaultOpen(
  tool: string,
  shellToolDefaultOpen: boolean,
  editToolDefaultOpen: boolean,
): boolean | undefined {
  if (tool === "bash") return shellToolDefaultOpen
  if (tool === "edit" || tool === "write" || tool === "apply_patch") return editToolDefaultOpen
  return undefined
}

// Serialize tool state for comparison (already in shared component)

// Props for TurnRenderer
interface TurnRendererProps {
  turn: ChatTurn
  turnIndex: number
  totalTurns: number
  providers: ProviderInfo[]
  isBusy: boolean
  directory?: string
  onAssistantTextFinalRender?: () => void
  onOpenSession?: (sessionID: string) => void
  onForkMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  showReasoningSummaries: boolean
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
}

// Memoized equality for TurnRenderer
function turnRendererEqual(prevProps: TurnRendererProps, nextProps: TurnRendererProps): boolean {
  if (prevProps.turnIndex !== nextProps.turnIndex) return false
  if (prevProps.totalTurns !== nextProps.totalTurns) return false
  if (prevProps.isBusy !== nextProps.isBusy) return false
  if (prevProps.directory !== nextProps.directory) return false
  if (prevProps.onAssistantTextFinalRender !== nextProps.onAssistantTextFinalRender) return false
  if (prevProps.onOpenSession !== nextProps.onOpenSession) return false
  if (prevProps.onForkMessage !== nextProps.onForkMessage) return false
  if (prevProps.onRevertMessage !== nextProps.onRevertMessage) return false
  if (prevProps.providers !== nextProps.providers) return false
  if (prevProps.showReasoningSummaries !== nextProps.showReasoningSummaries) return false
  if (prevProps.shellToolDefaultOpen !== nextProps.shellToolDefaultOpen) return false
  if (prevProps.editToolDefaultOpen !== nextProps.editToolDefaultOpen) return false

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

// Props for UserSection
interface UserSectionProps {
  userMessage?: MessageWithParts
  providers: ProviderInfo[]
  onForkMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
}

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

  // Memoize assistant computations
  const assistantMessages = turn.assistants
  const assistantParts = useMemo(
    () => assistantMessages.flatMap((message) => message.parts),
    [assistantMessages],
  )
  const assistantItems = useMemo(
    () => groupAssistantParts(assistantParts, showReasoningSummaries),
    [assistantParts, showReasoningSummaries],
  )
  const collapsedAbstractedKeys = useMemo(() => {
    const partIndexByID = new Map(assistantParts.map((part, index) => [part.id, index]))
    const keys = new Set<string>()

    for (const item of assistantItems) {
      if (item.type !== "abstracted") continue

      const lastPartID = item.parts[item.parts.length - 1]?.id
      if (!lastPartID) continue

      const rawEndIndex = partIndexByID.get(lastPartID)
      if (rawEndIndex === undefined) continue

      const hasFollowup = assistantParts
        .slice(rawEndIndex + 1)
        .some((part) => assistantPartStartsFollowup(part))

      if (hasFollowup) {
        keys.add(item.key)
      }
    }

    return keys
  }, [assistantItems, assistantParts])
  const assistantTextParts = useMemo(
    () =>
      assistantParts.filter(
        (part) => part.type === "text" && String(part.text ?? "").trim().length > 0,
      ),
    [assistantParts],
  )
  const currentReasoningHeading = useMemo(
    () =>
      assistantParts
        .filter(
          (part): part is MessagePart & { type: "reasoning"; text: string } =>
            part.type === "reasoning",
        )
        .map((part) => reasoningHeading(String(part.text ?? "")))
        .filter((value): value is string => Boolean(value))
        .slice(-1)[0],
    [assistantParts],
  )

  const lastAssistantTextID = assistantTextParts[assistantTextParts.length - 1]?.id
  const lastAssistantInfo = assistantMessages[assistantMessages.length - 1]?.info
  const assistantError = useMemo(
    () =>
      assistantMessages
        .map((message) => (message.info.role === "assistant" ? message.info.error : undefined))
        .findLast((error) => !!error && !isMessageAbortError(error)),
    [assistantMessages],
  )
  const assistantErrorText = useMemo(() => formatMessageError(assistantError), [assistantError])
  const assistantErrorName =
    assistantError &&
    typeof assistantError.name === "string" &&
    assistantError.name !== "UnknownError"
      ? assistantError.name
      : undefined
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
  const assistantMetaText = useMemo(() => {
    const info = assistantMessages[assistantMessages.length - 1]?.info
    if (!info) return ""

    // Try to find the model name from the provider list
    let modelName = modelLabel(info)
    const providerID = "providerID" in info ? info.providerID : undefined
    const modelID = "modelID" in info ? info.modelID : undefined

    if (providerID && modelID) {
      const match = providers.find((p) => p.id === providerID)
      const models = match?.models
      if (models && modelID in models) {
        const entry = models[modelID as keyof typeof models]
        if (entry && typeof entry === "object" && "name" in entry && entry.name) {
          modelName = String(entry.name)
        }
      }
    }

    return [
      titleCase(info.agent),
      modelName,
      formatDuration(turnDurationMs),
      assistantAborted ? "Interrupted" : "",
    ]
      .filter((value) => !!value)
      .join(" · ")
  }, [assistantMessages, providers, turnDurationMs, assistantAborted])
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
          {showThinking ? (
            <AbstractedThinkingPlaceholder
              detail={!showReasoningSummaries ? currentReasoningHeading : undefined}
            />
          ) : null}
        </div>
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
    isBusy,
    messages,
    onAssistantTextFinalRender,
    onForkMessage,
    onOpenSession,
    onRevertMessage,
    providers: providersProp,
    scrollViewportRef,
    shellToolDefaultOpen: shellToolDefaultOpenProp,
    showReasoningSummaries: showReasoningSummariesProp,
  } = props
  const providers = providersProp ?? []
  const turns = useMemo(() => buildTurns(messages), [messages])

  const lastMessage = messages[messages.length - 1]
  const isLastTurnBusy =
    (isBusy ?? false) &&
    (lastMessage?.info.role === "assistant" || lastMessage?.info.role === "user")

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

  const renderTurn = (turn: ChatTurn, turnIndex: number) => (
    <div className={turnIndex === turns.length - 1 ? "" : "pb-12"}>
      <TurnRenderer
        turn={turn}
        turnIndex={turnIndex}
        totalTurns={turns.length}
        providers={providers}
        isBusy={isLastTurnBusy && turnIndex === turns.length - 1}
        directory={directory}
        onAssistantTextFinalRender={
          turnIndex === turns.length - 1 ? handleAssistantTextFinalRender : undefined
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
                    {renderTurn(turn, virtualRow.index)}
                  </div>
                )
              })}
            </div>

            {liveTurns.map((turn, offset) => (
              <div key={turn.key} className="w-full">
                {renderTurn(turn, firstUnvirtualizedTurnIndex + offset)}
              </div>
            ))}
          </>
        ) : (
          turns.map((turn, turnIndex) => (
            <div key={turn.key} className="w-full">
              {renderTurn(turn, turnIndex)}
            </div>
          ))
        )}
      </div>
    </TooltipProvider>
  )
}, chatTranscriptEqual)
