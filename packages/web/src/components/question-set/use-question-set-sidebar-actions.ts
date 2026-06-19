import { useUiPreferences } from "@/state/ui-preferences"
import { useWorkspaceQuestionSetObjectPanelStore } from "@/state/workspace-question-set-object-panel-store"
import type { ChatRightSidebarTab } from "@/components/layout/chat-right-sidebar"
import {
  QUESTION_SET_SIDEBAR_TAB,
  shouldCloseSelectedQuestionSet,
} from "./question-set-sidebar-state"

export function useQuestionSetSidebarActions() {
  const openQuestionSet = useWorkspaceQuestionSetObjectPanelStore((state) => state.openQuestionSet)
  const closeQuestionSet = useWorkspaceQuestionSetObjectPanelStore((state) => state.closeQuestionSet)
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const setRightSidebarTab = useUiPreferences((state) => state.setRightSidebarTab)

  function openWorkspaceQuestionSet(input: {
    directory: string
    objectID: string
    selectedObjectID?: string
    fallbackTab?: ChatRightSidebarTab
  }) {
    const shouldClose = shouldCloseSelectedQuestionSet({
      rightSidebarOpen,
      rightSidebarTab,
      selectedObjectID: input.selectedObjectID,
      objectID: input.objectID,
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

    openQuestionSet(input.directory, input.objectID)
    setRightSidebarTab(QUESTION_SET_SIDEBAR_TAB)
    setRightSidebarOpen(true)
  }

  return {
    openWorkspaceQuestionSet,
  }
}
