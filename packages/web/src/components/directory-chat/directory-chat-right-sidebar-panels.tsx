import type { ComponentProps } from "react"
import { ChatRightSidebar } from "@/components/layout/chat-right-sidebar"
import { ResourcesPanel } from "@/components/resources/resources-panel"
import { AgentsMdPanel } from "@/components/agents/agents-md-panel"
import { SystemPromptPanel } from "@/components/debug/system-prompt-panel"
import { InteractiveLessonEmptyState } from "@/components/directory-chat/interactive-lesson-empty-state"
import { TeachingEditorPanel } from "@/components/teaching/teaching-editor-panel"
import { MathFigurePanel } from "@/components/teaching/math-figure-panel"
import { ProjectFileExplorerPanel } from "@/components/project-explorer/project-file-explorer-panel"
import type { DirectoryChatState } from "@/lib/directory-chat/use-directory-chat-state"
import type { TeachingWorkspaceController } from "@/lib/directory-chat/use-teaching-workspace"

type DirectoryChatRightSidebarPanelsProps = {
  directory: string
  chatState: DirectoryChatState
  teachingWorkspace: TeachingWorkspaceController
  showSystemPromptTab: boolean
  resourcesRefreshToken: number
  systemPromptRefreshToken: number
  isStartingInteractiveLesson: boolean
  onOpenCreateTeachingFileDialog: () => void
  onStartInteractiveLesson: () => void
}

type DirectoryChatRightSidebarPanels = Pick<
  ComponentProps<typeof ChatRightSidebar>,
  | "resourcesPanel"
  | "agentsPanel"
  | "systemPromptPanel"
  | "filesPanel"
  | "editorPanel"
  | "figurePanel"
>

export function buildDirectoryChatRightSidebarPanels(
  props: DirectoryChatRightSidebarPanelsProps,
): DirectoryChatRightSidebarPanels {
  const {
    directory,
    chatState,
    teachingWorkspace,
    showSystemPromptTab,
    resourcesRefreshToken,
    systemPromptRefreshToken,
    isStartingInteractiveLesson,
    onOpenCreateTeachingFileDialog,
    onStartInteractiveLesson,
  } = props

  const filesPanel = (
    <ProjectFileExplorerPanel className="h-full min-h-0 flex-1" directory={directory} />
  )

  const editorPanel = chatState.selectedPersonaSupportsEditor ? (
    chatState.isInteractiveMode ? (
      chatState.teachingWorkspace ? (
        <TeachingEditorPanel
          className="h-full min-h-0 flex-1 border-t-0 bg-transparent lg:border-l-0"
          workspace={chatState.teachingWorkspace}
          isBusy={chatState.isBusy}
          onCodeChange={teachingWorkspace.onTeachingCodeChange}
          onSelectFile={(relativePath) => {
            void teachingWorkspace.onTeachingSelectFile(relativePath)
          }}
          onCreateFile={onOpenCreateTeachingFileDialog}
          onSelectionChange={teachingWorkspace.onTeachingSelectionChange}
          onLanguageChange={teachingWorkspace.onTeachingLanguageChange}
          onCheckpoint={() => {
            void teachingWorkspace.onTeachingCheckpoint()
          }}
          onRestoreAccepted={() => {
            void teachingWorkspace.onTeachingRestoreAccepted()
          }}
          onLoadExternalChanges={teachingWorkspace.onLoadExternalChanges}
          onForceOverwrite={teachingWorkspace.onForceOverwrite}
        />
      ) : (
        <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-8 text-sm text-text-weak">
          Preparing lesson workspace...
        </section>
      )
    ) : (
      <InteractiveLessonEmptyState
        className="h-full min-h-0 flex-1 border-t-0 bg-transparent lg:border-l-0"
        selectedPersona={chatState.selectedPersona}
        preferredLanguage={chatState.preferredLanguage}
        isBusy={chatState.isBusy}
        canStartInteractiveLesson={!!chatState.sessionKey}
        isStartingInteractiveLesson={isStartingInteractiveLesson}
        onPreferredLanguageChange={teachingWorkspace.onTeachingPreferredLanguageChange}
        onStartInteractiveLesson={onStartInteractiveLesson}
      />
    )
  ) : undefined

  const figurePanel = chatState.selectedPersonaSupportsFigure ? (
    <MathFigurePanel className="h-full min-h-0 flex-1" />
  ) : undefined

  return {
    resourcesPanel: <ResourcesPanel directory={directory} refreshToken={resourcesRefreshToken} />,
    agentsPanel: <AgentsMdPanel directory={directory} />,
    systemPromptPanel: showSystemPromptTab ? (
      <SystemPromptPanel
        directory={directory}
        sessionID={chatState.sessionID}
        refreshToken={systemPromptRefreshToken}
      />
    ) : undefined,
    filesPanel,
    editorPanel,
    figurePanel,
  }
}
