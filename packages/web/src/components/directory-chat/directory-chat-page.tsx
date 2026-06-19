import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { CreateTeachingFileDialog } from "@/components/teaching/create-teaching-file-dialog"
import { DirectoryChatConversationPane } from "@/components/directory-chat/directory-chat-conversation-pane"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { DirectoryChatShell } from "@/components/directory-chat/directory-chat-shell"
import { DirectoryChatRightWorkspace } from "@/components/directory-chat/directory-chat-right-workspace"
import { DirectoryInvalidNotebook } from "./directory-invalid-notebook"
import { language } from "@/context/language"

export function DirectoryChatPage() {
  const { controller } = useDirectoryNotebookRouteContext()

  if (controller.status === "invalid") {
    return <DirectoryInvalidNotebook />
  }

  if (controller.status === "opening") {
    return (
      <div data-component="directory-chat-opening" className="p-6">
        {language.t("directoryChat.openingNotebook")}
      </div>
    )
  }

  const rightWorkspaceLastSelector =
    controller.mainPaneProps.chatState.rightWorkspaceLastSelectorByDirectory[
      controller.mainPaneProps.directory
    ]

  return (
    <DirectoryChatShell
      leftSidebar={<ChatLeftSidebar {...controller.leftSidebarProps} />}
      mainPane={<DirectoryChatConversationPane {...controller.mainPaneProps} />}
      rightSidebar={
        <DirectoryChatRightWorkspace
          directory={controller.mainPaneProps.directory}
          messages={controller.mainPaneProps.chatState.messages}
          sessionID={controller.mainPaneProps.chatState.sessionID}
          workspaceWidth={controller.shellProps.rightSidebarDisplayWidth}
          lastSelector={rightWorkspaceLastSelector}
          onLastSelectorChange={(selector) => {
            controller.mainPaneProps.chatState.setRightWorkspaceLastSelector(
              controller.mainPaneProps.directory,
              selector,
            )
          }}
          onOpenResource={controller.mainPaneProps.onOpenResource}
          workspaceOpen={controller.mainPaneProps.chatState.rightSidebarOpen}
        />
      }
      createTeachingFileDialog={<CreateTeachingFileDialog {...controller.dialogProps} />}
      {...controller.shellProps}
    />
  )
}
