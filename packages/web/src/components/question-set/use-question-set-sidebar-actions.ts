import { useUiPreferences } from "@/state/ui-preferences"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"
import type { ChatRightSidebarTab } from "@/components/layout/chat-right-sidebar"
import {
  QUESTION_SET_SIDEBAR_TAB,
  shouldCloseSelectedQuestionSet,
} from "./question-set-sidebar-state"

export function useQuestionSetSidebarActions() {
  const openQuestionSet = useWorkspaceQuestionSetPanelStore((state) => state.openQuestionSet)
  const closeQuestionSet = useWorkspaceQuestionSetPanelStore((state) => state.closeQuestionSet)
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const setRightSidebarTab = useUiPreferences((state) => state.setRightSidebarTab)

  function openWorkspaceQuestionSet(input: {
    directory: string
    artifactID: string
    selectedArtifactID?: string
    fallbackTab?: ChatRightSidebarTab
  }) {
    const shouldClose = shouldCloseSelectedQuestionSet({
      rightSidebarOpen,
      rightSidebarTab,
      selectedArtifactID: input.selectedArtifactID,
      artifactID: input.artifactID,
    })

    if (shouldClose) {
      closeQuestionSet(input.directory)
      setRightSidebarTab(
        input.fallbackTab && input.fallbackTab !== QUESTION_SET_SIDEBAR_TAB
          ? input.fallbackTab
          : "curriculum",
      )
      setRightSidebarOpen(false)
      return
    }

    openQuestionSet(input.directory, input.artifactID)
    setRightSidebarTab(QUESTION_SET_SIDEBAR_TAB)
    setRightSidebarOpen(true)
  }

  return {
    openWorkspaceQuestionSet,
  }
}
