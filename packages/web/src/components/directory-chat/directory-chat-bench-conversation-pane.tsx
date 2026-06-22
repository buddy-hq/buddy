import type { ComponentProps } from "react"
import { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
import { DirectoryChatBenchThreadBrowser } from "@/components/directory-chat/directory-chat-bench-thread-browser"

type DirectoryChatBenchConversationPaneProps = Omit<
  ComponentProps<typeof DirectoryChatConversationPane>,
  "className" | "topContent"
> & {
  linkedSessionID?: string
  onNewSession: () => void | Promise<void>
  onSelectSession: (sessionID: string) => void | Promise<void>
  showThreadBrowser?: boolean
}

export function DirectoryChatBenchConversationPane(props: DirectoryChatBenchConversationPaneProps) {
  const {
    linkedSessionID,
    onNewSession,
    onSelectSession,
    showThreadBrowser = true,
    ...conversationPaneProps
  } = props
  const threadBrowserState = props.chatState

  return (
    <DirectoryChatConversationPane
      {...conversationPaneProps}
      topContent={
        showThreadBrowser ? (
          <DirectoryChatBenchThreadBrowser
            sessionTitle={threadBrowserState.sessionTitle}
            sessions={threadBrowserState.sessions}
            activeSessionID={threadBrowserState.sessionID}
            linkedSessionID={linkedSessionID}
            parentSession={threadBrowserState.parentSession}
            onNewSession={onNewSession}
            onSelectSession={onSelectSession}
          />
        ) : undefined
      }
      className="h-full w-full"
    />
  )
}
