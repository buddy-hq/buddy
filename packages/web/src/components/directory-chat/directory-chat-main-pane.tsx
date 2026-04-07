import { ScrollArea } from "@buddy/ui"
import type { ComponentProps, RefObject, UIEvent } from "react"
import { ChatEmptyState } from "@/components/directory-chat/chat-empty-state"
import { SessionContextUsage } from "@/components/directory-chat/session-context-usage"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/directory-chat/permission-dock"
import { language } from "@/context/language"
import { getFilename } from "@/components/layout/sidebar-helpers"
import { ChevronRightIcon } from "@/components/layout/sidebar-icons"
import { PromptComposer } from "@/components/prompt/prompt-composer"
import type { DirectoryChatState } from "@/lib/directory-chat/use-directory-chat-state"

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
  onNewSession: () => void
  onPermissionReply: (reply: "once" | "always" | "reject") => Promise<void>
  promptComposerProps: PromptComposerProps
}

export function DirectoryChatMainPane(props: DirectoryChatMainPaneProps) {
  const {
    directory,
    chatState,
    transcriptRef,
    onTranscriptScroll,
    onAssistantTextFinalRender,
    onOpenSession,
    onNewSession,
    onPermissionReply,
    promptComposerProps,
  } = props

  return (
    <main
      data-component="directory-chat-main-pane"
      className="flex-1 min-w-0 min-h-0 flex flex-col bg-background-stronger"
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea
            data-component="chat-transcript-scroll-area"
            viewportRef={transcriptRef as React.Ref<HTMLDivElement>}
            onScroll={onTranscriptScroll as React.UIEventHandler<HTMLDivElement>}
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

          <div className="mx-auto w-full max-w-full px-4 md:max-w-200 2xl:max-w-[1000px]">
            <PromptComposer
              {...promptComposerProps}
              className="mb-4"
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
