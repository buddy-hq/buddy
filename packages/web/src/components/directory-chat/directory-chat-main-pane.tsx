import { Button, ScrollArea } from "@buddy/ui"
import {
  useMemo,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent,
  type UIEvent,
  type WheelEvent,
} from "react"
import { ChatEmptyStateBoard } from "@/components/directory-chat/chat-empty-state-board"
import { SessionContextUsage } from "@/components/directory-chat/session-context-usage"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/directory-chat/permission-dock"
import { QuestionDock } from "@/components/directory-chat/question-dock"
import { language } from "@/context/language"
import { PromptComposer } from "@/components/prompt/prompt-composer"
import { useAdaptiveSelectMode } from "@/components/prompt/use-adaptive-select-mode"
import type { DirectoryChatState } from "@/lib/directory-chat/use-directory-chat-state"
import { getSessionContextMetrics } from "@/state/context-metrics"
import type { ResourceOpenOptions, ResourceReadingTarget } from "@/state/resources-query"
import type { MessageWithParts, ProviderInfo, QuestionRequest } from "@/state/chat-types"
import { BookOpenIcon, PresentationIcon, Redo2Icon } from "lucide-react"
import { WhiteboardAutoOpen } from "@/components/whiteboard/whiteboard-auto-open"
import { hasWhiteboardCreate } from "@/components/whiteboard/whiteboard-progressive"
import { useChatStore } from "@/state/chat-store"
import { encodeDirectory } from "@/lib/directory-token"
import { useLocation, useNavigate } from "@tanstack/react-router"

type PromptComposerProps = Omit<
  ComponentProps<typeof PromptComposer>,
  "className" | "sessionContextUsage"
>

type DirectoryChatMainPaneProps = {
  directory: string
  chatState: DirectoryChatState
  transcriptRef: RefObject<HTMLElement | null>
  transcriptContentRef: RefObject<HTMLElement | null>
  userScrolled: boolean
  onTranscriptScroll: (event: UIEvent<HTMLElement>) => void
  onTranscriptWheel: (event: WheelEvent<HTMLElement>) => void
  onTranscriptKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onTranscriptPointerDown: (event: PointerEvent<HTMLElement>) => void
  onTranscriptTouchStart: (event: TouchEvent<HTMLElement>) => void
  onTranscriptTouchMove: (event: TouchEvent<HTMLElement>) => void
  onTranscriptTouchEnd: () => void
  onTranscriptTouchCancel: () => void
  onTranscriptInteraction?: () => void
  onAssistantTextFinalRender?: () => void
  onOpenSession: (sessionID: string) => void
  onOpenResource: (
    directory: string,
    resource: ResourceReadingTarget,
    options?: ResourceOpenOptions,
  ) => void
  onRevertMessage?: (input: { sessionID: string; messageID: string }) => Promise<void> | void
  onRestoreRevertedMessages?: () => Promise<void> | void
  onPermissionReply: (reply: "once" | "always" | "reject") => Promise<void>
  onQuestionReply: (requestID: string, answers: string[][]) => Promise<void>
  onQuestionReject: (requestID: string) => Promise<void>
  promptComposerProps: PromptComposerProps
  topContent?: ReactNode
  directories: string[]
  onSelectNotebook: (directory: string) => void
}

const COMPACTION_BUFFER_TOKENS = 20_000
const OUTPUT_TOKEN_MAX = 32_000
const WHITEBOARD_ROUTE_SUFFIX = "/whiteboard"
const READING_ROUTE_SUFFIX = "/read"
const WORKSPACE_SHORTCUT_BUTTON_CLASS =
  "text-text-weaker/70 hover:bg-surface-base-hover hover:text-text-base aria-pressed:text-text-interactive-base"
const WHITEBOARD_SHORTCUT_LABEL = "Toggle whiteboard view"
const READING_SHORTCUT_LABEL = "Toggle reading view"

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

function WorkspaceViewShortcuts(props: { directory: string; messages: MessageWithParts[] }) {
  const location = useLocation()
  const navigate = useNavigate()
  const lastOpenedReadingResource = useChatStore(
    (state) => state.lastOpenedReadingResourceByDirectory[props.directory],
  )
  const encodedDirectory = encodeDirectory(props.directory)
  const isWhiteboardRoute = location.pathname.endsWith(WHITEBOARD_ROUTE_SUFFIX)
  const isReadingRoute = location.pathname.endsWith(READING_ROUTE_SUFFIX)
  const showWhiteboardShortcut = isWhiteboardRoute || hasWhiteboardCreate(props.messages)
  const showReadingShortcut = isReadingRoute || lastOpenedReadingResource !== undefined

  if (!showWhiteboardShortcut && !showReadingShortcut) return null

  return (
    <div
      data-component="prompt-workspace-shortcuts"
      className="flex items-center gap-0.5"
    >
      {showWhiteboardShortcut ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className={WORKSPACE_SHORTCUT_BUTTON_CLASS}
          aria-label={WHITEBOARD_SHORTCUT_LABEL}
          title={WHITEBOARD_SHORTCUT_LABEL}
          aria-pressed={isWhiteboardRoute}
          onClick={() => {
            if (isWhiteboardRoute) {
              void navigate({
                to: "/$directory/chat",
                params: { directory: encodedDirectory },
              })
              return
            }
            void navigate({
              to: "/$directory/whiteboard",
              params: { directory: encodedDirectory },
            })
          }}
        >
          <PresentationIcon />
        </Button>
      ) : null}
      {showReadingShortcut ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className={WORKSPACE_SHORTCUT_BUTTON_CLASS}
          aria-label={READING_SHORTCUT_LABEL}
          title={READING_SHORTCUT_LABEL}
          aria-pressed={isReadingRoute}
          onClick={() => {
            if (isReadingRoute || !lastOpenedReadingResource) {
              void navigate({
                to: "/$directory/chat",
                params: { directory: encodedDirectory },
              })
              return
            }

            void navigate({
              to: "/$directory/read",
              params: { directory: encodedDirectory },
              search: lastOpenedReadingResource.resourceID
                ? {
                    path: lastOpenedReadingResource.path,
                    resource: lastOpenedReadingResource.resourceID,
                  }
                : {
                    path: lastOpenedReadingResource.path,
                  },
            })
          }}
        >
          <BookOpenIcon />
        </Button>
      ) : null}
    </div>
  )
}

export function DirectoryChatMainPane(props: DirectoryChatMainPaneProps) {
  const {
    directory,
    chatState,
    transcriptRef,
    transcriptContentRef,
    userScrolled,
    onTranscriptScroll,
    onTranscriptWheel,
    onTranscriptKeyDown,
    onTranscriptPointerDown,
    onTranscriptTouchStart,
    onTranscriptTouchMove,
    onTranscriptTouchEnd,
    onTranscriptTouchCancel,
    onTranscriptInteraction,
    onAssistantTextFinalRender,
    onOpenSession,
    onOpenResource,
    onRevertMessage,
    onRestoreRevertedMessages,
    onPermissionReply,
    onQuestionReply,
    onQuestionReject,
    promptComposerProps,
  } = props
  const autoCompactionWarning = useMemo(() => resolveAutoCompactionWarning(chatState), [chatState])
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

  return (
    <main
      data-component="directory-chat-main-pane"
      className="relative flex-1 min-w-0 min-h-0 flex flex-col bg-background-stronger"
    >
      <WhiteboardAutoOpen
        directory={directory}
        messages={chatState.messages}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          {props.topContent ? (
            <div className="mx-auto w-full max-w-full px-4 pt-4 md:max-w-200">
              <div className="mb-4">{props.topContent}</div>
            </div>
          ) : null}
          <ScrollArea
            data-component="chat-transcript-scroll-area"
            viewportRef={transcriptRef as React.Ref<HTMLDivElement>}
            onScroll={onTranscriptScroll as React.UIEventHandler<HTMLDivElement>}
            onWheel={onTranscriptWheel as React.WheelEventHandler<HTMLDivElement>}
            onKeyDown={onTranscriptKeyDown as React.KeyboardEventHandler<HTMLDivElement>}
            onPointerDown={onTranscriptPointerDown as React.PointerEventHandler<HTMLDivElement>}
            onTouchStart={onTranscriptTouchStart as React.TouchEventHandler<HTMLDivElement>}
            onTouchMove={onTranscriptTouchMove as React.TouchEventHandler<HTMLDivElement>}
            onTouchEnd={onTranscriptTouchEnd as React.TouchEventHandler<HTMLDivElement>}
            onTouchCancel={onTranscriptTouchCancel as React.TouchEventHandler<HTMLDivElement>}
            fillContentWidth
            className="min-w-0 flex-1 min-h-0"
          >
            <div
              ref={transcriptContentRef as React.Ref<HTMLDivElement>}
              onClick={onTranscriptInteraction}
              className={`mx-auto min-w-0 w-full max-w-full px-4 pt-4 pb-12 space-y-4 md:max-w-200 ${
                chatState.messages.length === 0 && chatState.isReady ? "h-full" : ""
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
                <div className="h-full flex flex-col">
                  <ChatEmptyStateBoard
                    directory={directory}
                    directories={props.directories}
                    onSelectNotebook={props.onSelectNotebook}
                  />
                </div>
              ) : (
                <>
                  <ChatTranscript
                    directory={directory}
                    scrollViewportRef={transcriptRef}
                    userScrolled={userScrolled}
                    onAssistantTextFinalRender={onAssistantTextFinalRender}
                    onOpenSession={onOpenSession}
                    onOpenResource={onOpenResource}
                    onRevertMessage={onRevertMessage}
                  />
                </>
              )}
            </div>
          </ScrollArea>

          {chatState.error ? (
            <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200">
              <div className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
                {chatState.error}
              </div>
            </div>
          ) : null}

          {activeQuestion ? (
            <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200">
              <QuestionDock
                key={activeQuestion.id}
                request={activeQuestion}
                pendingCount={Math.max(0, currentSessionQuestions.length - 1)}
                onReply={(answers) => onQuestionReply(activeQuestion.id, answers)}
                onReject={() => onQuestionReject(activeQuestion.id)}
              />
            </div>
          ) : null}

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

          <div className="mx-auto w-full max-w-full px-4 md:max-w-200">
            {!chatState.parentSession && (
              <PromptComposer
                {...promptComposerProps}
                activeQuestionID={activeQuestion?.id}
                selectorMode={promptSelectorMode}
                className="mb-1"
                contextActions={
                  <WorkspaceViewShortcuts
                    directory={directory}
                    messages={chatState.messages}
                  />
                }
                sessionContextUsage={
                  <SessionContextUsage
                    messages={chatState.messages}
                    providers={chatState.providers}
                  />
                }
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
