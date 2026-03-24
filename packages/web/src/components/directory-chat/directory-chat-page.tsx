import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { CreateTeachingFileDialog } from "@/components/teaching/create-teaching-file-dialog"
import { DirectoryChatMainPane } from "@/components/directory-chat/directory-chat-main-pane"
import { DirectoryChatRightSidebar } from "@/components/directory-chat/directory-chat-right-sidebar"
import { DirectoryChatShell } from "@/components/directory-chat/directory-chat-shell"
import { useDirectoryChatPageController } from "@/lib/directory-chat/use-directory-chat-page-controller"

type DirectoryChatPageProps = {
  directoryToken: string
}

export function DirectoryChatPage(props: DirectoryChatPageProps) {
  const controller = useDirectoryChatPageController({
    directoryToken: props.directoryToken,
  })

  if (controller.status === "invalid") {
    return <div className="p-6">Invalid notebook identifier in URL.</div>
  }

  if (controller.status === "opening") {
    return <div className="p-6">Opening notebook...</div>
  }

  return (
    <DirectoryChatShell
      leftSidebar={<ChatLeftSidebar {...controller.leftSidebarProps} />}
      mainPane={<DirectoryChatMainPane {...controller.mainPaneProps} />}
      rightSidebar={<DirectoryChatRightSidebar {...controller.rightSidebarProps} />}
      createTeachingFileDialog={<CreateTeachingFileDialog {...controller.dialogProps} />}
      {...controller.shellProps}
    />
  )
}
