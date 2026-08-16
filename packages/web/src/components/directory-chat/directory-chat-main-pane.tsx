import { Button, ScrollArea } from "@buddy/ui"
import { useQuery } from "@tanstack/react-query"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  type TouchEvent,
  type UIEvent,
  type WheelEvent,
} from "react"
import { ChatEmptyStateBoard } from "@/components/directory-chat/chat-empty-state-board"
import { preventDefaultForFileDrag } from "@/components/directory-chat/directory-chat-file-drop"
import { SessionContextUsage } from "@/components/directory-chat/session-context-usage"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/directory-chat/permission-dock"
import { QuestionDock } from "@/components/directory-chat/question-dock"
import {
  SessionFollowupDock,
  type QueuedFollowupItem,
} from "@/components/directory-chat/session-followup-dock"
import { language } from "@/context/language"
import {
  PromptComposer,
  type PromptComposerAttachmentsApi,
} from "@/components/prompt/prompt-composer"
import { useAdaptiveSelectMode } from "@/components/prompt/use-adaptive-select-mode"
import type { GetStartedChat } from "@/lib/get-started-chats"
import type { DirectoryChatState } from "@/lib/directory-chat/use-directory-chat-state"
import { getSessionContextMetrics } from "@/state/context-metrics"
import { providerCatalogSnapshotQueryOptions } from "@/state/bootstrap-query"
import type { ResourceReadingTarget } from "@/state/resources-query"
import type { MessageWithParts, ProviderInfo, QuestionRequest } from "@/state/chat-types"
import type { PermissionReply } from "@/state/permission-types"
import { ArrowDownIcon, Redo2Icon } from "@/icons/app-icons"
import { BenchClosedContextPublisher } from "@/components/bench/bench-route-context"
import { isBenchRoutePathname } from "@/lib/bench-navigation"
import { canEditImagesForModel } from "@/lib/image-editing"
import { useLocation } from "@tanstack/react-router"
import { WhiteboardOpeningPreview } from "@/components/whiteboard/whiteboard-opening-preview"
import { findLatestTodoSnapshot } from "@/components/chat/tools/todo-state"
import { isAnonymousOpenCodeProvider } from "@/lib/provider-catalog"
import {
  AssistantErrorCard,
  createAssistantErrorCardSpec,
  type AssistantErrorActionID,
} from "@/components/chat/assistant-error-card"
import { isHiddenFromUserMessage } from "@/components/chat/utils/message-visibility"
import { resolveLatestTerminalAssistantError } from "@/state/chat-error-model"
import type { RetryActionID } from "@/components/chat/session-retry-notice"
import { usePlatform } from "@/context/platform"
import {
  resolveComposerAccessoryLayout,
  type ComposerAccessoryLayout,
} from "@/components/prompt/composer-accessory-layout"
import { useGameStore } from "@/state/game-store"

type PromptComposerProps = Omit<
  ComponentProps<typeof PromptComposer>,
  "className" | "sessionContextUsage" | "todoSnapshot"
>

type DirectoryChatMainPaneProps = {
  directory: string
  chatState: DirectoryChatState
  transcriptRef: RefObject<HTMLElement | null>
  showJumpToLatest: boolean
  initialScrollOffset: () => number | undefined
  shouldAnchorBottom: () => boolean
  hasScrollGesture: () => boolean
  onJumpToLatest: () => void
  onTranscriptScroll: (event: UIEvent<HTMLElement>) => void
  onTranscriptWheel: (event: WheelEvent<HTMLElement>) => void
  onTranscriptKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onTranscriptPointerDown: (event: PointerEvent<HTMLElement>) => void
  onTranscriptTouchStart: (event: TouchEvent<HTMLElement>) => void
  onTranscriptTouchMove: (event: TouchEvent<HTMLElement>) => void
  onTranscriptTouchEnd: () => void
  onTranscriptTouchCancel: () => void
  onTranscriptInteraction?: () => void
  onTranscriptViewportHeightChange?: (element: HTMLElement) => void
  markTranscriptProgrammaticScroll?: (element: HTMLElement, top: number) => void
  onOpenSession: (sessionID: string) => void
  onOpenResource: (directory: string, resource: ResourceReadingTarget) => void
  onForkMessage?: (input: { sessionID: string; messageID?: string }) => Promise<void> | void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRestoreRevertedMessages?: () => Promise<void> | void
  onPermissionReply: (reply: PermissionReply) => Promise<void>
  onQuestionReply: (requestID: string, answers: string[][]) => Promise<void>
  onQuestionReject: (requestID: string) => Promise<void>
  onContinueTerminalError?: (input: { sessionID: string }) => Promise<void> | void
  onCompactTerminalError?: (input: {
    sessionID: string
    userMessageID: string
  }) => Promise<void> | void
  onContinueTruncated?: (input: { sessionID: string }) => Promise<void> | void
  onOpenProviderSettings?: () => void
  onStopTurn?: () => Promise<void> | void
  promptComposerProps: PromptComposerProps
  queuedFollowups?: QueuedFollowupItem[]
  sendingQueuedFollowupID?: string
  onSendQueuedFollowup?: (id: string) => void
  onEditQueuedFollowup?: (id: string) => void
  topContent?: ReactNode
  directories: string[]
  onSelectNotebook: (directory: string) => void
  onStartGetStartedChat?: (chat: GetStartedChat) => Promise<void> | void
  compactPromptComposer?: boolean
}

const COMPACTION_BUFFER_TOKENS = 20_000
const OUTPUT_TOKEN_MAX = 32_000
const CHAT_LAYOUT_RESIZE_SETTLE_DELAY_MS = 100

type ChatLayoutMeasurements = {
  paneHeight: number
  reservedContentHeight: number
  hasBlockingResponseSurface: boolean
}

const EMPTY_CHAT_LAYOUT_MEASUREMENTS: ChatLayoutMeasurements = {
  paneHeight: 0,
  reservedContentHeight: 0,
  hasBlockingResponseSurface: false,
}

function measuredElementHeight(element: HTMLElement | null): number {
  return element ? Math.round(element.getBoundingClientRect().height) : 0
}

type AutoCompactionWarning = {
  usage: number
  threshold: number
  thresholdUsage: number
  remaining: number
}

function resolveMaxOutputTokens(outputLimit: number | undefined) {
  const bounded = Math.min(outputLimit ?? OUTPUT_TOKEN_MAX, OUTPUT_TOKEN_MAX)
  return bounded || OUTPUT_TOKEN_MAX
}

export function resolveAutoCompactionWarning(input: {
  autoCompactionEnabled?: boolean
  messages: MessageWithParts[]
  providers: ProviderInfo[]
}): AutoCompactionWarning | undefined {
  if (input.autoCompactionEnabled === false) {
    return undefined
  }

  const context = getSessionContextMetrics(input.messages, input.providers).context
  if (!context) {
    return undefined
  }

  const model = context.model
  const contextLimit =
    typeof model?.limit.context === "number"
      ? model.limit.context
      : typeof context.limit === "number"
        ? context.limit
        : undefined
  if (typeof contextLimit !== "number" || contextLimit <= 0) {
    return undefined
  }

  const outputLimit = typeof model?.limit.output === "number" ? model.limit.output : undefined
  const inputLimit = typeof model?.limit.input === "number" ? model.limit.input : undefined
  const maxOutputTokens = resolveMaxOutputTokens(outputLimit)
  const reserved = Math.min(COMPACTION_BUFFER_TOKENS, maxOutputTokens)

  const threshold =
    typeof inputLimit === "number" && inputLimit > 0
      ? Math.max(inputLimit - reserved, 0)
      : Math.max(contextLimit - maxOutputTokens, 0)

  if (threshold <= 0) {
    return undefined
  }

  const used = context.total
  const remaining = Math.max(threshold - used, 0)
  if (remaining > reserved) {
    return undefined
  }

  return {
    usage: Math.round((used / threshold) * 100),
    threshold,
    thresholdUsage: Math.round((threshold / contextLimit) * 100),
    remaining,
  }
}

export function resolveCurrentSessionQuestions(input: {
  pendingQuestions: QuestionRequest[]
  sessionID: DirectoryChatState["sessionID"]
}) {
  if (!input.sessionID) {
    return []
  }

  return input.pendingQuestions.filter((request) => request.sessionID === input.sessionID)
}

export function resolveRevertedUserMessageCount(input: {
  messages: MessageWithParts[]
  revertMessageID?: string
}) {
  const revertMessageID = input.revertMessageID
  if (!revertMessageID) {
    return 0
  }

  return input.messages.filter(
    (message) => message.info.role === "user" && message.info.id >= revertMessageID,
  ).length
}

export function DirectoryChatMainPane(props: DirectoryChatMainPaneProps) {
  const location = useLocation()
  const platform = usePlatform()
  const {
    directory,
    chatState,
    transcriptRef,
    showJumpToLatest,
    initialScrollOffset,
    shouldAnchorBottom,
    hasScrollGesture,
    onJumpToLatest,
    onTranscriptScroll,
    onTranscriptWheel,
    onTranscriptKeyDown,
    onTranscriptPointerDown,
    onTranscriptTouchStart,
    onTranscriptTouchMove,
    onTranscriptTouchEnd,
    onTranscriptTouchCancel,
    onTranscriptInteraction,
    onTranscriptViewportHeightChange,
    markTranscriptProgrammaticScroll,
    onOpenSession,
    onOpenResource,
    onForkMessage,
    onRevertMessage,
    onRestoreRevertedMessages,
    onPermissionReply,
    onQuestionReply,
    onQuestionReject,
    onContinueTerminalError,
    onCompactTerminalError,
    onContinueTruncated,
    onOpenProviderSettings,
    onStopTurn,
    promptComposerProps,
    compactPromptComposer,
  } = props
  // SAFETY: ScrollArea owns a div viewport; the controller intentionally exposes its ref as HTMLElement.
  const transcriptViewportRef = transcriptRef as Ref<HTMLDivElement>
  const abortPromptComposer = promptComposerProps.onAbort
  const providerCatalogQuery = useQuery(providerCatalogSnapshotQueryOptions(directory))
  const autoCompactionWarning = useMemo(() => resolveAutoCompactionWarning(chatState), [chatState])
  const queuedFollowups = props.queuedFollowups ?? []
  const currentSessionQuestions = useMemo(
    () =>
      resolveCurrentSessionQuestions({
        pendingQuestions: chatState.pendingQuestions,
        sessionID: chatState.sessionID,
      }),
    [chatState.pendingQuestions, chatState.sessionID],
  )
  const revertMessageID = chatState.sessionFamily.current?.revert?.messageID
  const revertedUserMessageCount = useMemo(
    () =>
      resolveRevertedUserMessageCount({
        messages: chatState.messages,
        revertMessageID,
      }),
    [chatState.messages, revertMessageID],
  )
  const todoSnapshot = useMemo(
    () =>
      findLatestTodoSnapshot({
        messages: chatState.messages,
        revertMessageID,
      }),
    [chatState.messages, revertMessageID],
  )
  const visibleMessages = useMemo(() => {
    const visible = chatState.messages.filter((message) => !isHiddenFromUserMessage(message))
    return revertMessageID
      ? visible.filter((message) => message.info.id < revertMessageID)
      : visible
  }, [chatState.messages, revertMessageID])
  const terminalError = useMemo(
    () => resolveLatestTerminalAssistantError(visibleMessages, chatState.providers),
    [chatState.providers, visibleMessages],
  )
  const terminalErrorProvider = terminalError
    ? chatState.providers.find((provider) => provider.id === terminalError.providerID)
    : undefined
  const terminalErrorProviderName =
    terminalErrorProvider && !isAnonymousOpenCodeProvider(terminalErrorProvider)
      ? terminalErrorProvider.name
      : undefined
  const terminalErrorSpec = terminalError
    ? createAssistantErrorCardSpec(terminalError.model, terminalErrorProviderName)
    : undefined
  const activeQuestion = currentSessionQuestions[0]
  const isTranscriptLoading =
    !!chatState.sessionID &&
    chatState.loadingSessionID === chatState.sessionID &&
    chatState.messages.length === 0
  const promptSelectorMode = useAdaptiveSelectMode({
    sessionID: chatState.sessionID,
    isReady: chatState.isReady,
    messages: chatState.messages,
  })
  const canEditImages = canEditImagesForModel({
    providerID: chatState.effectiveModelSelection?.providerID,
    acceptsImages: chatState.selectedModelAcceptsImages,
    chatGptOAuthReady: providerCatalogQuery.data?.openAIModelAvailability.status === "ready",
  })

  // The prompt composer publishes its attachment API here so files dropped
  // anywhere in this pane (not just on the composer) get attached.
  const attachmentsApiRef = useRef<PromptComposerAttachmentsApi | null>(null)
  const chatLayoutRef = useRef<HTMLDivElement | null>(null)
  const topContentRef = useRef<HTMLDivElement | null>(null)
  const blockingSurfacesRef = useRef<HTMLDivElement | null>(null)
  const [isFileDragging, setIsFileDragging] = useState(false)
  const [chatLayoutMeasurements, setChatLayoutMeasurements] = useState<ChatLayoutMeasurements>(
    EMPTY_CHAT_LAYOUT_MEASUREMENTS,
  )
  const [dismissedTerminalMessageID, setDismissedTerminalMessageID] = useState<string>()
  const isGameVisible = useGameStore((state) => state.isGameVisible)
  const setGameVisible = useGameStore((state) => state.setGameVisible)
  const setGamePaused = useGameStore((state) => state.setPaused)
  const setGameMinimized = useGameStore((state) => state.setMinimized)
  // Only accept drops while the composer is actually mounted below.
  const dropzoneEnabled = !activeQuestion && !chatState.parentSession

  useLayoutEffect(() => {
    const pane = chatLayoutRef.current
    const topContent = topContentRef.current
    const blockingSurfaces = blockingSurfacesRef.current
    if (!pane || !topContent || !blockingSurfaces) return

    let settleTimer: number | undefined
    const sync = () => {
      const blockingResponseSurfaceHeight = measuredElementHeight(blockingSurfaces)
      const next: ChatLayoutMeasurements = {
        paneHeight: measuredElementHeight(pane),
        reservedContentHeight: measuredElementHeight(topContent) + blockingResponseSurfaceHeight,
        hasBlockingResponseSurface: blockingResponseSurfaceHeight > 0,
      }
      setChatLayoutMeasurements((current) =>
        current.paneHeight === next.paneHeight &&
        current.reservedContentHeight === next.reservedContentHeight &&
        current.hasBlockingResponseSurface === next.hasBlockingResponseSurface
          ? current
          : next,
      )
    }
    const scheduleSync = () => {
      if (settleTimer !== undefined) {
        window.clearTimeout(settleTimer)
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = undefined
        sync()
      }, CHAT_LAYOUT_RESIZE_SETTLE_DELAY_MS)
    }

    sync()
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(scheduleSync)
    observer.observe(pane)
    observer.observe(topContent)
    observer.observe(blockingSurfaces)
    return () => {
      observer.disconnect()
      if (settleTimer !== undefined) {
        window.clearTimeout(settleTimer)
      }
    }
  }, [])

  useEffect(() => {
    if (!activeQuestion || !isGameVisible) return
    setGameVisible(false)
    setGamePaused(true)
    setGameMinimized(true)
  }, [activeQuestion, isGameVisible, setGameMinimized, setGamePaused, setGameVisible])

  const composerAccessoryLayout = useMemo<ComposerAccessoryLayout>(
    () => resolveComposerAccessoryLayout(chatLayoutMeasurements),
    [chatLayoutMeasurements],
  )

  const handlePaneDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!preventDefaultForFileDrag(event) || !dropzoneEnabled) return
    setIsFileDragging(true)
  }
  const handlePaneDragOver = (event: DragEvent<HTMLElement>) => {
    if (!preventDefaultForFileDrag(event) || !dropzoneEnabled) return
    if (!isFileDragging) setIsFileDragging(true)
  }
  const handlePaneDragLeave = (event: DragEvent<HTMLElement>) => {
    const relatedNode = event.relatedTarget instanceof Node ? event.relatedTarget : null
    if (event.currentTarget.contains(relatedNode)) return
    setIsFileDragging(false)
  }
  const handlePaneDrop = (event: DragEvent<HTMLElement>) => {
    setIsFileDragging(false)
    if (!preventDefaultForFileDrag(event) || !dropzoneEnabled) return
    attachmentsApiRef.current?.addAttachments(event.dataTransfer.files)
  }

  const stopTurn = useCallback(() => {
    if (onStopTurn) {
      void onStopTurn()
      return
    }
    abortPromptComposer()
  }, [abortPromptComposer, onStopTurn])

  function handleTerminalAction(action: AssistantErrorActionID) {
    if (!terminalError || !chatState.sessionID) return

    switch (action) {
      case "open-settings":
        onOpenProviderSettings?.()
        return
      case "try-again":
        void onContinueTerminalError?.({ sessionID: chatState.sessionID })
        return
      case "stop":
        stopTurn()
        return
      case "compact-and-continue":
        void onCompactTerminalError?.({
          sessionID: chatState.sessionID,
          userMessageID: terminalError.userMessageID,
        })
        return
      case "new-session":
        promptComposerProps.onNewSession()
        return
      case "dismiss":
        setDismissedTerminalMessageID(terminalError.assistantMessageID)
        return
      case "continue":
        void onContinueTruncated?.({ sessionID: chatState.sessionID })
        return
      case "copy-details":
        return
    }
  }

  const handleRetryAction = useCallback(
    (input: { action: RetryActionID; userMessageID: string; link?: string }) => {
      switch (input.action) {
        case "stop":
          stopTurn()
          return
        case "open-action":
          if (input.link) platform.openLink(input.link)
          return
      }
    },
    [platform, stopTurn],
  )

  const handleContinueTruncated = useCallback(() => {
    if (!chatState.sessionID) return
    void onContinueTruncated?.({ sessionID: chatState.sessionID })
  }, [chatState.sessionID, onContinueTruncated])

  return (
    <main
      data-component="directory-chat-main-pane"
      className="relative flex-1 min-w-0 min-h-0 flex flex-col bg-background-stronger"
      onDragEnter={handlePaneDragEnter}
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
    >
      {isFileDragging ? (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border border-dashed border-border-interactive-base/50 bg-background-base/80 text-sm text-text-base shadow-sm backdrop-blur-sm">
          {language.t("prompt.composer.draggingHint")}
        </div>
      ) : null}
      <WhiteboardOpeningPreview
        directory={directory}
        sessionID={chatState.sessionID}
        messages={chatState.messages}
      />
      {!isBenchRoutePathname(location.pathname) ? (
        <BenchClosedContextPublisher activeSessionID={chatState.sessionID} />
      ) : null}
      <div ref={chatLayoutRef} className="flex-1 min-h-0 flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={topContentRef} className="shrink-0">
            {props.topContent ? (
              <div className="mx-auto w-full max-w-full px-4 pt-4 md:max-w-200">
                <div className="mb-4">{props.topContent}</div>
              </div>
            ) : null}
          </div>
          <div className="relative min-h-0 flex-1">
            <ScrollArea
              data-component="chat-transcript-scroll-area"
              viewportRef={transcriptViewportRef}
              onScroll={onTranscriptScroll}
              onWheel={onTranscriptWheel}
              onKeyDown={onTranscriptKeyDown}
              onPointerDown={onTranscriptPointerDown}
              onTouchStart={onTranscriptTouchStart}
              onTouchMove={onTranscriptTouchMove}
              onTouchEnd={onTranscriptTouchEnd}
              onTouchCancel={onTranscriptTouchCancel}
              fillContentWidth
              className="h-full min-w-0 min-h-0"
            >
              <div
                onClick={onTranscriptInteraction}
                className={`mx-auto min-w-0 w-full max-w-full px-4 pt-4 space-y-4 md:max-w-200 ${
                  chatState.messages.length === 0 && chatState.isReady
                    ? "flex h-full min-h-0 flex-col pb-3"
                    : ""
                }`}
              >
                {!chatState.isReady ? (
                  <p className="text-sm text-text-weak">
                    {language.t("directoryChat.loadingConversationHistory")}
                  </p>
                ) : isTranscriptLoading ? (
                  <div className="space-y-6 pt-2">
                    <div className="h-3 w-28 rounded-full bg-surface-raised-base" />
                    <div className="space-y-3">
                      <div className="h-4 w-4/5 rounded-full bg-surface-raised-base/80" />
                      <div className="h-4 w-3/5 rounded-full bg-surface-raised-base/60" />
                      <div className="h-40 w-full rounded-xl bg-surface-raised-base/50" />
                    </div>
                    <div className="space-y-3">
                      <div className="h-4 w-2/3 rounded-full bg-surface-raised-base/60" />
                      <div className="h-4 w-1/2 rounded-full bg-surface-raised-base/50" />
                    </div>
                  </div>
                ) : chatState.messages.length === 0 ? (
                  <div className="flex h-full min-h-0 flex-col overflow-visible py-1">
                    <ChatEmptyStateBoard
                      directory={directory}
                      directories={props.directories}
                      selectedModel={chatState.selectedModelKey}
                      persona={chatState.selectedPersona}
                      onSelectNotebook={props.onSelectNotebook}
                      onStartGetStartedChat={props.onStartGetStartedChat}
                    />
                  </div>
                ) : (
                  <ChatTranscript
                    key={chatState.sessionID}
                    directory={directory}
                    canEditImages={canEditImages}
                    scrollViewportRef={transcriptRef}
                    initialScrollOffset={initialScrollOffset}
                    shouldAnchorBottom={shouldAnchorBottom}
                    hasScrollGesture={hasScrollGesture}
                    onViewportHeightChange={onTranscriptViewportHeightChange}
                    markProgrammaticScroll={markTranscriptProgrammaticScroll}
                    onOpenSession={onOpenSession}
                    onOpenResource={onOpenResource}
                    onForkMessage={onForkMessage}
                    onRevertMessage={onRevertMessage}
                    onRetryAction={handleRetryAction}
                    onContinueTruncated={handleContinueTruncated}
                  />
                )}
              </div>
            </ScrollArea>
            {showJumpToLatest ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background-stronger shadow-md"
                onClick={onJumpToLatest}
              >
                <ArrowDownIcon className="mr-1 h-4 w-4" />
                {language.t("chat.jumpToLatest")}
              </Button>
            ) : null}
          </div>

          <div ref={blockingSurfacesRef} className="shrink-0">
            {chatState.pendingPermissions.length > 0 ? (
              <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200">
                <PermissionDock
                  request={chatState.pendingPermissions[0]!}
                  pendingCount={Math.max(0, chatState.pendingPermissions.length - 1)}
                  onReply={async (reply) => {
                    await onPermissionReply(reply)
                  }}
                />
              </div>
            ) : null}

            {autoCompactionWarning ? (
              <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200">
                <div className="rounded-md border border-border-base/70 bg-surface-weak/35 px-3 py-2 text-xs text-text-weak">
                  <p className="font-medium text-text-base">
                    {language.t("prompt.compactionNotice.title")}
                  </p>
                  <p className="mt-0.5">
                    {language.t("prompt.compactionNotice.threshold", {
                      usage: autoCompactionWarning.usage,
                      threshold: autoCompactionWarning.threshold.toLocaleString(),
                      thresholdUsage: autoCompactionWarning.thresholdUsage,
                      remaining: autoCompactionWarning.remaining.toLocaleString(),
                    })}
                  </p>
                </div>
              </div>
            ) : null}

            {revertedUserMessageCount > 0 && onRestoreRevertedMessages ? (
              <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200">
                <div className="flex items-center justify-between gap-3 rounded-md border border-border-base/70 bg-surface-weak/35 px-3 py-2 text-xs text-text-weak">
                  <div className="min-w-0">
                    <p className="font-medium text-text-base">
                      {language.t(
                        revertedUserMessageCount === 1
                          ? "chat.revertNotice.summary.one"
                          : "chat.revertNotice.summary.other",
                        {
                          count: revertedUserMessageCount,
                        },
                      )}
                    </p>
                    <p className="mt-0.5">{language.t("chat.revertNotice.description")}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={chatState.isBusy}
                    className="shrink-0"
                    onClick={() => void onRestoreRevertedMessages()}
                  >
                    <Redo2Icon className="mr-1 h-4 w-4" />
                    {language.t("chat.revertNotice.restore")}
                  </Button>
                </div>
              </div>
            ) : null}

            {queuedFollowups.length > 0 &&
            props.onSendQueuedFollowup &&
            props.onEditQueuedFollowup ? (
              <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200">
                <SessionFollowupDock
                  items={queuedFollowups}
                  sendingID={props.sendingQueuedFollowupID}
                  onSend={props.onSendQueuedFollowup}
                  onEdit={props.onEditQueuedFollowup}
                />
              </div>
            ) : null}

            {terminalError &&
            terminalErrorSpec &&
            terminalError.assistantMessageID !== dismissedTerminalMessageID &&
            !chatState.parentSession ? (
              <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200">
                <AssistantErrorCard
                  spec={terminalErrorSpec}
                  alert
                  onAction={handleTerminalAction}
                />
              </div>
            ) : null}
          </div>

          {activeQuestion ? (
            <div className="mx-auto w-full max-w-200 shrink-0 px-4 pb-4 pt-2">
              <QuestionDock
                key={activeQuestion.id}
                request={activeQuestion}
                pendingCount={Math.max(0, currentSessionQuestions.length - 1)}
                onReply={(answers) => onQuestionReply(activeQuestion.id, answers)}
                onReject={() => onQuestionReject(activeQuestion.id)}
              />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-full px-4 md:max-w-200">
              {!chatState.parentSession && (
                <PromptComposer
                  {...promptComposerProps}
                  attachmentsApiRef={attachmentsApiRef}
                  selectorMode={promptSelectorMode}
                  compact={
                    chatLayoutMeasurements.paneHeight > 0
                      ? composerAccessoryLayout.compact
                      : compactPromptComposer
                  }
                  className="mb-1"
                  todoSnapshot={todoSnapshot}
                  accessoryLayout={composerAccessoryLayout}
                  sessionContextUsage={
                    <SessionContextUsage
                      messages={chatState.messages}
                      providers={chatState.providers}
                      selectedModel={
                        chatState.effectiveModelInfo
                          ? {
                              name: chatState.effectiveModelInfo.name,
                              providerID: chatState.effectiveModelInfo.providerID,
                              contextLimit: chatState.effectiveModelInfo.limit.context,
                            }
                          : undefined
                      }
                    />
                  }
                />
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
