import { useEffect, useMemo, useRef } from "react"
import { WhiteboardPane } from "@/components/whiteboard/whiteboard-pane"
import { suppressWhiteboardAutoOpen } from "@/components/whiteboard/whiteboard-auto-open-state"
import { readLatestActiveWhiteboardCreateKey } from "@/components/whiteboard/whiteboard-progressive"
import { language } from "@/context/language"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { DirectoryInvalidNotebook } from "./directory-invalid-notebook"

type DirectoryChatWhiteboardPageProps = {
  directory: string
}

export function DirectoryChatWhiteboardPage(props: DirectoryChatWhiteboardPageProps) {
  const { controller } = useDirectoryNotebookRouteContext()

  if (controller.status === "invalid") {
    return <DirectoryInvalidNotebook />
  }

  if (controller.status === "opening") {
    return (
      <div data-component="directory-chat-whiteboard-opening" className="p-6">
        {language.t("directoryChat.openingNotebook")}
      </div>
    )
  }

  const chatState = controller.mainPaneProps.chatState
  const activeWhiteboardCreateKey = useMemo(
    () => readLatestActiveWhiteboardCreateKey(chatState.messages),
    [chatState.messages],
  )
  const activeWhiteboardCreateKeyRef = useRef(activeWhiteboardCreateKey)

  useEffect(() => {
    activeWhiteboardCreateKeyRef.current = activeWhiteboardCreateKey
  }, [activeWhiteboardCreateKey])

  useEffect(() => {
    return () => {
      suppressWhiteboardAutoOpen(props.directory, activeWhiteboardCreateKeyRef.current)
    }
  }, [props.directory])

  return (
    <div data-component="directory-chat-whiteboard-page" className="h-full min-h-0 w-full">
      <WhiteboardPane
        directory={props.directory}
        sessionID={chatState.sessionID}
        isBusy={chatState.isBusy}
        messages={chatState.messages}
      />
    </div>
  )
}
