import type { ComponentProps } from "react"
import { cn } from "@buddy/ui"
import { DirectoryChatMainPane } from "@/components/directory-chat/directory-chat-main-pane"

type DirectoryChatConversationPaneProps = ComponentProps<typeof DirectoryChatMainPane> & {
  className?: string
}

export function DirectoryChatConversationPane(props: DirectoryChatConversationPaneProps) {
  const { className, ...mainPaneProps } = props

  return (
    <div
      data-component="directory-chat-conversation-pane"
      data-main-pane="chat"
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background-stronger [view-transition-name:buddy-chat-conversation]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <DirectoryChatMainPane {...mainPaneProps} />
      </div>
    </div>
  )
}
