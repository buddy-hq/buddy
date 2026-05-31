import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatWorkspaceConversationPane } from "@/components/directory-chat/directory-chat-workspace-conversation-pane"
import { DirectoryChatWorkspacePageLayout } from "@/components/directory-chat/directory-chat-workspace-page-layout"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { language } from "@/context/language"
import { resourceSessionKey, useChatStore } from "@/state/chat-store"

const READING_ROUTE_SUFFIX = "/read" as const

export const Route = createFileRoute("/$directory/_workspace")({
  component: DirectoryWorkspaceRouteLayout,
})

function DirectoryWorkspaceRouteLayout() {
  const location = useLocation()
  const { controller } = useDirectoryNotebookRouteContext()
  const linkedReadingSessionID = useChatStore((state) => {
    if (controller.status !== "ready" || !location.pathname.endsWith(READING_ROUTE_SUFFIX)) {
      return undefined
    }

    const directory = controller.mainPaneProps.directory
    const resourceID = state.activeReadingResourceByDirectory[directory]?.resourceID
    return resourceID
      ? state.linkedSessionByResource[resourceSessionKey(directory, resourceID)]
      : undefined
  })

  if (controller.status === "invalid") {
    return <DirectoryInvalidNotebook />
  }

  if (controller.status === "opening") {
    return (
      <div data-component="directory-chat-workspace-opening" className="p-6">
        {language.t("directoryChat.openingNotebook")}
      </div>
    )
  }

  const currentDirectory = controller.mainPaneProps.directory
  const sessionID = controller.mainPaneProps.chatState.sessionID

  return (
    <DirectoryChatWorkspacePageLayout
      workspaceKey={`${location.href}:${sessionID ?? ""}`}
      workspace={<Outlet />}
      conversation={
        <DirectoryChatWorkspaceConversationPane
          {...controller.mainPaneProps}
          linkedSessionID={linkedReadingSessionID}
          onNewSession={() => {
            void controller.leftSidebarProps.onNewSession(currentDirectory)
          }}
          onSelectSession={(nextSessionID) => {
            void controller.leftSidebarProps.onSelectSession(currentDirectory, nextSessionID)
          }}
        />
      }
    />
  )
}
