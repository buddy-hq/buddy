import type { ComponentProps } from "react"
import { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
import { DirectoryChatBenchThreadBrowser } from "@/components/directory-chat/directory-chat-bench-thread-browser"

type DirectoryChatBenchConversationPaneProps = Omit<
  ComponentProps<typeof DirectoryChatConversationPane>,
  "className" | "mainPaneTab" | "topContent"
> & {
  linkedSessionID?: string
  onFloatChat?: () => void
  onNewSession: () => void | Promise<void>
  onSelectSession: (sessionID: string) => void | Promise<void>
}

export function DirectoryChatBenchConversationPane(
  props: DirectoryChatBenchConversationPaneProps,
) {
  const { linkedSessionID, onFloatChat, onNewSession, onSelectSession, ...conversationPaneProps } =
    props
  const threadBrowserState = props.chatState

  return (
    <DirectoryChatConversationPane
      {...conversationPaneProps}
      topContent={
        <DirectoryChatBenchThreadBrowser
          sessionTitle={threadBrowserState.sessionTitle}
          sessions={threadBrowserState.sessions}
          activeSessionID={threadBrowserState.sessionID}
          linkedSessionID={linkedSessionID}
          parentSession={threadBrowserState.parentSession}
          onFloatChat={onFloatChat}
          onNewSession={onNewSession}
          onSelectSession={onSelectSession}
        />
      }
      mainPaneTab="chat"
      className="h-full w-full"
    />
  )
}
