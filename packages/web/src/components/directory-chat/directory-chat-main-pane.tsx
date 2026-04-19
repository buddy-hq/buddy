import { ScrollArea } from "@buddy/ui"
import { useMemo, type ComponentProps, type ReactNode, type RefObject, type UIEvent } from "react"
import { ChatEmptyState } from "@/components/directory-chat/chat-empty-state"
import { SessionContextUsage } from "@/components/directory-chat/session-context-usage"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/directory-chat/permission-dock"
import { QuestionDock } from "@/components/directory-chat/question-dock"
import { language } from "@/context/language"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { PromptComposer } from "@/components/prompt/prompt-composer"
import type { DirectoryChatState } from "@/lib/directory-chat/use-directory-chat-state"
import { getSessionContextMetrics } from "@/state/context-metrics"
import type { MessageWithParts, ProviderInfo, QuestionRequest } from "@/state/chat-types"

type PromptComposerProps = Omit<
  ComponentProps<typeof PromptComposer>,
  "className" | "sessionContextUsage"
>

type DirectoryChatMainPaneProps = {
  directory: string
  chatState: DirectoryChatState
  transcriptRef: RefObject<HTMLElement>
  onTranscriptScroll: (event: UIEvent<HTMLElement>) => void
  onAssistantTextFinalRender?: () => void
  onOpenSession: (sessionID: string) => void
  onPermissionReply: (reply: "once" | "always" | "reject") => Promise<void>
  onQuestionReply: (requestID: string, answers: string[][]) => Promise<void>
  onQuestionReject: (requestID: string) => Promise<void>
  promptComposerProps: PromptComposerProps
  topContent?: ReactNode
}

const COMPACTION_BUFFER_TOKENS = 20_000
const OUTPUT_TOKEN_MAX = 32_000

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

export function DirectoryChatMainPane(props: DirectoryChatMainPaneProps) {
  const {
    directory,
    chatState,
    transcriptRef,
    onTranscriptScroll,
    onAssistantTextFinalRender,
    onOpenSession,
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
  const activeQuestion = currentSessionQuestions[0]

  return (
    <main
      data-component="directory-chat-main-pane"
      className="flex-1 min-w-0 min-h-0 flex flex-col bg-background-stronger"
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          {props.topContent ? (
            <div className="mx-auto w-full max-w-full px-4 pt-4 md:max-w-200 2xl:max-w-[1000px]">
              <div className="mb-4">{props.topContent}</div>
            </div>
          ) : null}
          <ScrollArea
            data-component="chat-transcript-scroll-area"
            viewportRef={transcriptRef as React.Ref<HTMLDivElement>}
            onScroll={onTranscriptScroll as React.UIEventHandler<HTMLDivElement>}
            fillContentWidth
            className="min-w-0 flex-1 min-h-0"
          >
            <div
              className={`mx-auto min-w-0 w-full max-w-full px-4 pt-4 pb-12 space-y-4 md:max-w-200 2xl:max-w-[1000px] ${
                chatState.messages.length === 0 && chatState.isReady ? "h-full" : ""
              }`}
            >
              {!chatState.isReady ? (
                <p className="text-sm text-text-weak">
                  {language.t("directoryChat.loadingConversationHistory")}
                </p>
              ) : chatState.messages.length === 0 ? (
                <div className="h-full flex flex-col">
                  <ChatEmptyState directoryLabel={getFilename(directory)} />
                </div>
              ) : (
                <>
                  <ChatTranscript
                    directory={directory}
                    scrollViewportRef={transcriptRef}
                    onAssistantTextFinalRender={onAssistantTextFinalRender}
                    onOpenSession={onOpenSession}
                  />
                </>
              )}
            </div>
          </ScrollArea>

          {chatState.error ? (
            <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200 2xl:max-w-[1000px]">
              <div className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
                {chatState.error}
              </div>
            </div>
          ) : null}

          {activeQuestion ? (
            <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200 2xl:max-w-[1000px]">
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
            <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200 2xl:max-w-[1000px]">
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
            <div className="mx-auto w-full max-w-full px-4 pb-2 md:max-w-200 2xl:max-w-[1000px]">
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

          <div className="mx-auto w-full max-w-full px-4 md:max-w-200 2xl:max-w-[1000px]">
            <PromptComposer
              {...promptComposerProps}
              className="mb-1"
              sessionContextUsage={
                <SessionContextUsage
                  messages={chatState.messages}
                  providers={chatState.providers}
                />
              }
            />
          </div>
        </div>
      </div>
    </main>
  )
}
