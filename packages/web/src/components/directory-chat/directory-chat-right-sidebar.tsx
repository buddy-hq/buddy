import { ChatRightSidebar } from "@/components/layout/chat-right-sidebar"
import { intentFromSelection } from "@/state/teaching-runtime"
import type { LearnerCurriculumView } from "@/state/chat-actions"
import type { DirectoryChatState } from "@/lib/directory-chat/use-directory-chat-state"
import type { TeachingWorkspaceController } from "@/lib/directory-chat/use-teaching-workspace"
import { buildDirectoryChatRightSidebarPanels } from "./directory-chat-right-sidebar-panels"

type DirectoryChatRightSidebarProps = {
  directory: string
  chatState: DirectoryChatState
  teachingWorkspace: TeachingWorkspaceController
  showCapabilitiesTab: boolean
  showSystemPromptTab: boolean
  showSnapshotTab: boolean
  resourcesRefreshToken: number
  systemPromptRefreshToken: number
  isStartingInteractiveLesson: boolean
  onRunCurriculumAction: (action: LearnerCurriculumView["actions"][number]) => void
  onOpenCreateTeachingFileDialog: () => void
  onStartInteractiveLesson: () => void
}

export function DirectoryChatRightSidebar(props: DirectoryChatRightSidebarProps) {
  const {
    directory,
    chatState,
    teachingWorkspace,
    showCapabilitiesTab,
    showSystemPromptTab,
    showSnapshotTab,
    resourcesRefreshToken,
    systemPromptRefreshToken,
    isStartingInteractiveLesson,
    onRunCurriculumAction,
    onOpenCreateTeachingFileDialog,
    onStartInteractiveLesson,
  } = props

  const panels = buildDirectoryChatRightSidebarPanels({
    directory,
    chatState,
    teachingWorkspace,
    showSystemPromptTab,
    resourcesRefreshToken,
    systemPromptRefreshToken,
    isStartingInteractiveLesson,
    onOpenCreateTeachingFileDialog,
    onStartInteractiveLesson,
  })

  return (
    <ChatRightSidebar
      directory={directory}
      activeTab={chatState.rightSidebarActiveTab}
      onTabChange={chatState.setRightSidebarTab}
      surfaces={chatState.selectedPersonaSurfaces}
      showCapabilitiesTab={showCapabilitiesTab}
      showSystemPromptTab={showSystemPromptTab}
      showSnapshotTab={showSnapshotTab}
      resourcesPanel={panels.resourcesPanel}
      agentsPanel={panels.agentsPanel}
      systemPromptPanel={panels.systemPromptPanel}
      filesPanel={panels.filesPanel}
      sessionID={chatState.sessionID}
      persona={chatState.selectedPersona}
      intent={intentFromSelection(chatState.storedIntent)}
      onRunAction={onRunCurriculumAction}
      editorPanel={panels.editorPanel}
      figurePanel={panels.figurePanel}
      onClose={() => chatState.setRightSidebarOpen(false)}
      className="w-full h-full"
    />
  )
}
