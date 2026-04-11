import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { CreateTeachingFileDialog } from "@/components/teaching/create-teaching-file-dialog"
import { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { DirectoryChatRightSidebar } from "@/components/directory-chat/directory-chat-right-sidebar"
import { DirectoryChatShell } from "@/components/directory-chat/directory-chat-shell"
import { language } from "@/context/language"

export function DirectoryChatPage() {
  const { controller } = useDirectoryNotebookRouteContext()

  if (controller.status === "invalid") {
    return (
      <div data-component="directory-chat-invalid" className="p-6">
        {language.t("directoryChat.invalidNotebookIdentifier")}
      </div>
    )
  }

  if (controller.status === "opening") {
    return (
      <div data-component="directory-chat-opening" className="p-6">
        {language.t("directoryChat.openingNotebook")}
      </div>
    )
  }

  return (
    <DirectoryChatShell
      leftSidebar={<ChatLeftSidebar {...controller.leftSidebarProps} />}
      mainPane={<DirectoryChatConversationPane {...controller.mainPaneProps} />}
      rightSidebar={<DirectoryChatRightSidebar {...controller.rightSidebarProps} />}
      createTeachingFileDialog={<CreateTeachingFileDialog {...controller.dialogProps} />}
      {...controller.shellProps}
    />
  )
}
