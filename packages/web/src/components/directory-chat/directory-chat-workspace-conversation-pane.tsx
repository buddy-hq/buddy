import type { ComponentProps } from "react"
import { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
import { DirectoryChatWorkspaceThreadBrowser } from "@/components/directory-chat/directory-chat-workspace-thread-browser"

type DirectoryChatWorkspaceConversationPaneProps = Omit<
  ComponentProps<typeof DirectoryChatConversationPane>,
  "className" | "mainPaneTab" | "topContent"
> & {
  linkedSessionID?: string
  onFloatChat?: () => void
  onNewSession: () => void | Promise<void>
  onSelectSession: (sessionID: string) => void | Promise<void>
}

export function DirectoryChatWorkspaceConversationPane(
  props: DirectoryChatWorkspaceConversationPaneProps,
) {
  const { linkedSessionID, onFloatChat, onNewSession, onSelectSession, ...conversationPaneProps } =
    props
  const threadBrowserState = props.chatState

  return (
    <DirectoryChatConversationPane
      {...conversationPaneProps}
      topContent={
        <DirectoryChatWorkspaceThreadBrowser
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
