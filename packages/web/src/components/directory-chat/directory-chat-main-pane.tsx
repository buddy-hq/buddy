import { Button, SquarePenIcon, ScrollArea } from "@buddy/ui"
import type { ComponentProps, RefObject, UIEvent } from "react"
import { ChatEmptyState } from "@/components/chat/chat-empty-state"
import { SessionContextUsage } from "@/components/chat/session-context-usage"
import { ChatTranscript } from "@/components/chat/chat-transcript"
import { PermissionDock } from "@/components/chat/permission-dock"
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
    <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-background-base/20">
      <header className="border-b px-3 py-2">
        <div className="flex w-full items-center justify-between gap-2 px-1">
          <div className="min-w-0 flex items-center gap-1.5">
            {chatState.parentSession ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  onOpenSession(chatState.parentSession!.id)
                }}
                title={`Back to ${chatState.parentSession.title || "parent thread"}`}
              >
                <ChevronRightIcon className="size-3.5 rotate-180" />
              </Button>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-xs font-normal text-text-weak truncate">
                {chatState.sessionTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-text-weak hover:text-text-strong"
              onClick={onNewSession}
            >
              <SquarePenIcon className="size-4 mr-1.5" />
              New thread
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea
            viewportRef={transcriptRef as React.Ref<HTMLDivElement>}
            onScroll={onTranscriptScroll as React.UIEventHandler<HTMLDivElement>}
            className="flex-1 min-h-0"
          >
            <div
              className={`mx-auto w-full max-w-full px-4 pt-4 pb-12 space-y-4 md:max-w-200 2xl:max-w-[1000px] ${
                chatState.messages.length === 0 && chatState.isReady ? "h-full" : ""
              }`}
            >
              {!chatState.isReady ? (
                <p className="text-sm text-text-weak">Loading conversation history...</p>
              ) : chatState.messages.length === 0 ? (
                <div className="h-full flex flex-col">
                  <ChatEmptyState directoryLabel={getFilename(directory)} />
                </div>
              ) : (
                <>
                  <ChatTranscript
                    messages={chatState.messages}
                    directory={directory}
                    providers={chatState.providers}
                    isBusy={chatState.isBusy}
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
