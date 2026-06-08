import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatWorkspaceConversationPane } from "@/components/directory-chat/directory-chat-workspace-conversation-pane"
import { DirectoryChatWorkspacePageLayout } from "@/components/directory-chat/directory-chat-workspace-page-layout"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { language } from "@/context/language"
import { encodeDirectory } from "@/lib/directory-token"
import { resourceSessionKey, useChatStore } from "@/state/chat-store"

const READING_ROUTE_SUFFIX = "/read" as const
const WHITEBOARD_ROUTE_SUFFIX = "/whiteboard" as const

export const Route = createFileRoute("/$directory/_workspace")({
  component: DirectoryWorkspaceRouteLayout,
})

function DirectoryWorkspaceRouteLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { controller } = useDirectoryNotebookRouteContext()
  const isWhiteboardRoute = location.pathname.endsWith(WHITEBOARD_ROUTE_SUFFIX)
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
  const encodedDirectory = encodeDirectory(currentDirectory)

  async function openChatRoute() {
    await navigate({
      to: "/$directory/chat",
      params: {
        directory: encodedDirectory,
      },
    })
  }

  return (
    <DirectoryChatWorkspacePageLayout
      workspaceKey={`${location.href}:${sessionID ?? ""}`}
      workspace={<Outlet />}
      conversation={(controls) => (
        <DirectoryChatWorkspaceConversationPane
          {...controller.mainPaneProps}
          linkedSessionID={linkedReadingSessionID}
          onFloatChat={controls.onFloatChat}
          onNewSession={() => {
            void (async () => {
              await controller.leftSidebarProps.onNewSession(currentDirectory)
              if (isWhiteboardRoute) {
                await openChatRoute()
              }
            })()
          }}
          onSelectSession={(nextSessionID) => {
            void (async () => {
              await controller.leftSidebarProps.onSelectSession(currentDirectory, nextSessionID)
              if (isWhiteboardRoute && nextSessionID) {
                await openChatRoute()
              }
            })()
          }}
        />
      )}
    />
  )
}
