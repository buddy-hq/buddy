import { useEffect } from "react"
import { ChatRightSidebar } from "@/components/layout/chat-right-sidebar"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"
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
  showPaletteTab: boolean
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
    showPaletteTab,
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
    showPaletteTab,
    systemPromptRefreshToken,
    isStartingInteractiveLesson,
    onOpenCreateTeachingFileDialog,
    onStartInteractiveLesson,
  })
  const selectedQuestionSetArtifactID = useWorkspaceQuestionSetPanelStore(
    (state) => state.selectedArtifactIDByDirectory[directory],
  )
  const rightSidebarOpen = chatState.rightSidebarOpen
  const rightSidebarTab = chatState.rightSidebarTab
  const selectedPersonaDefaultSurface = chatState.selectedPersonaDefaultSurface
  const setRightSidebarOpen = chatState.setRightSidebarOpen
  const setRightSidebarTab = chatState.setRightSidebarTab

  useEffect(() => {
    if (!rightSidebarOpen) {
      return
    }
    if (rightSidebarTab !== "question-set") {
      return
    }
    if (selectedQuestionSetArtifactID) {
      return
    }

    setRightSidebarTab(selectedPersonaDefaultSurface)
    setRightSidebarOpen(false)
  }, [
    rightSidebarOpen,
    rightSidebarTab,
    selectedPersonaDefaultSurface,
    setRightSidebarOpen,
    setRightSidebarTab,
    selectedQuestionSetArtifactID,
  ])

  return (
    <ChatRightSidebar
      directory={directory}
      activeTab={chatState.rightSidebarActiveTab}
      onTabChange={chatState.setRightSidebarTab}
      surfaces={chatState.selectedPersonaSurfaces}
      showCapabilitiesTab={showCapabilitiesTab}
      showSystemPromptTab={showSystemPromptTab}
      showSnapshotTab={showSnapshotTab}
      showPaletteTab={showPaletteTab}
      agentsPanel={panels.agentsPanel}
      systemPromptPanel={panels.systemPromptPanel}
      palettePanel={panels.palettePanel}
      filesPanel={panels.filesPanel}
      sessionID={chatState.sessionID}
      persona={chatState.selectedPersona}
      onRunAction={onRunCurriculumAction}
      editorPanel={panels.editorPanel}
      figurePanel={panels.figurePanel}
      onClose={() => {
        useWorkspaceQuestionSetPanelStore.getState().closeQuestionSet(directory)
        chatState.setRightSidebarTab(chatState.selectedPersonaDefaultSurface)
        chatState.setRightSidebarOpen(false)
      }}
      className="w-full h-full"
    />
  )
}
