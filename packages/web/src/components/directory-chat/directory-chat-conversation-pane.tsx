import type { ComponentProps } from "react"
import { cn } from "@buddy/ui"
import { AgentsMdPanel } from "@/components/agents/agents-md-panel"
import { DirectoryChatMainPane } from "@/components/directory-chat/directory-chat-main-pane"
import {
  ChatLeftSidebarResourcesSection,
  type SidebarResourceTarget,
} from "@/components/layout/chat-left-sidebar/resources-section"
import { WorkspaceMermaidPanel } from "@/components/layout/workspace-mermaid-panel"
import { WorkspaceQuestionSetPanel } from "@/components/layout/workspace-question-set-panel"
import type { NotebookMainPaneTab } from "@/state/ui-preferences"

type DirectoryChatConversationPaneProps = ComponentProps<typeof DirectoryChatMainPane> & {
  mainPaneTab: NotebookMainPaneTab
  resourcesRefreshToken: number
  onOpenResource: (directory: string, resource: SidebarResourceTarget) => void
  className?: string
}

export function DirectoryChatConversationPane(props: DirectoryChatConversationPaneProps) {
  const { className, mainPaneTab, resourcesRefreshToken, onOpenResource, ...mainPaneProps } = props

  const panel =
    mainPaneTab === "chat" ? (
      <DirectoryChatMainPane {...mainPaneProps} />
    ) : mainPaneTab === "resources" ? (
      <div className="scrollbar-hover h-full min-h-0 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-full md:max-w-200 2xl:max-w-[1000px]">
          <ChatLeftSidebarResourcesSection
            directory={mainPaneProps.directory}
            refreshToken={resourcesRefreshToken}
            onOpenResource={onOpenResource}
            defaultOpen
            className="mb-0"
          />
        </div>
      </div>
    ) : mainPaneTab === "diagrams" ? (
      <WorkspaceMermaidPanel directory={mainPaneProps.directory} />
    ) : mainPaneTab === "instructions" ? (
      <div className="h-full min-h-0 p-3">
        <AgentsMdPanel directory={mainPaneProps.directory} className="h-full min-h-0" />
      </div>
    ) : (
      <WorkspaceQuestionSetPanel directory={mainPaneProps.directory} />
    )

  return (
    <div
      data-component="directory-chat-conversation-pane"
      data-main-pane-tab={mainPaneTab}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background-stronger",
        className,
      )}
    >
      {panel}
    </div>
  )
}
