import type { ChatRightSidebarTab } from "@/components/layout/chat-right-sidebar"

export const QUESTION_SET_SIDEBAR_TAB = "question-set" as const satisfies ChatRightSidebarTab

export function shouldCloseSelectedQuestionSet(input: {
  rightSidebarOpen: boolean
  rightSidebarTab: ChatRightSidebarTab
  selectedObjectID?: string
  objectID: string
}) {
  return (
    input.rightSidebarOpen &&
    input.rightSidebarTab === QUESTION_SET_SIDEBAR_TAB &&
    input.selectedObjectID === input.objectID
  )
}
