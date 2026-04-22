import type { ComponentProps } from "react"
import { cn } from "@buddy/ui"
import { AgentsMdPanel } from "@/components/agents/agents-md-panel"
import { DirectoryChatMainPane } from "@/components/directory-chat/directory-chat-main-pane"
import {
  LibraryPanel,
  type LibraryPanelResourceTarget,
} from "@/components/layout/chat-left-sidebar/library-panel"
import { WorkspaceFlashcardPanel } from "@/components/layout/workspace-flashcard-panel"
import { WorkspaceMermaidPanel } from "@/components/layout/workspace-mermaid-panel"
import { WorkspaceQuestionSetPanel } from "@/components/layout/workspace-question-set-panel"
import type { NotebookMainPaneTab } from "@/state/ui-preferences"

type DirectoryChatConversationPaneProps = ComponentProps<typeof DirectoryChatMainPane> & {
  mainPaneTab: NotebookMainPaneTab
  onOpenResource: (directory: string, resource: LibraryPanelResourceTarget) => void
  onOpenQuestionSet: (directory: string, artifactID: string, selectedArtifactID?: string) => void
  selectedPersonaDefaultSurface: "curriculum" | "editor" | "figure" | "question-set"
  libraryOpen?: boolean
  directories?: string[]
  className?: string
}

export function DirectoryChatConversationPane(props: DirectoryChatConversationPaneProps) {
  const {
    className,
    mainPaneTab,
    onOpenResource,
    onOpenQuestionSet,
    selectedPersonaDefaultSurface,
    libraryOpen,
    directories,
    ...mainPaneProps
  } = props

  const panel = libraryOpen ? (
    <div
      data-library-scroll-container
      className="scrollbar-hover h-full min-h-0 overflow-y-auto p-4"
    >
      <div className="mx-auto w-full max-w-full md:max-w-200 2xl:max-w-[1000px]">
        <LibraryPanel
          directories={directories ?? []}
          onOpenResource={onOpenResource}
          onOpenQuestionSet={onOpenQuestionSet}
        />
      </div>
    </div>
  ) : mainPaneTab === "chat" ? (
    <DirectoryChatMainPane {...mainPaneProps} />
  ) : mainPaneTab === "library" ? (
    <div
      data-library-scroll-container
      className="scrollbar-hover h-full min-h-0 overflow-y-auto p-4"
    >
      <div className="mx-auto w-full max-w-full md:max-w-200 2xl:max-w-[1000px]">
        <LibraryPanel
          directories={[mainPaneProps.directory]}
          onOpenResource={onOpenResource}
          onOpenQuestionSet={onOpenQuestionSet}
        />
      </div>
    </div>
  ) : mainPaneTab === "resources" ? (
    <div
      data-library-scroll-container
      className="scrollbar-hover h-full min-h-0 overflow-y-auto p-4"
    >
      <div className="mx-auto w-full max-w-full md:max-w-200 2xl:max-w-[1000px]">
        <LibraryPanel
          directories={[mainPaneProps.directory]}
          onOpenResource={onOpenResource}
          onOpenQuestionSet={onOpenQuestionSet}
          initialTab="resources"
        />
      </div>
    </div>
  ) : mainPaneTab === "diagrams" ? (
    <WorkspaceMermaidPanel directory={mainPaneProps.directory} />
  ) : mainPaneTab === "instructions" ? (
    <div className="h-full min-h-0 p-3">
      <AgentsMdPanel directory={mainPaneProps.directory} className="h-full min-h-0" />
    </div>
  ) : mainPaneTab === "flashcard" ? (
    <WorkspaceFlashcardPanel directory={mainPaneProps.directory} />
  ) : (
    <WorkspaceQuestionSetPanel
      directory={mainPaneProps.directory}
      selectedPersonaDefaultSurface={selectedPersonaDefaultSurface}
    />
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
