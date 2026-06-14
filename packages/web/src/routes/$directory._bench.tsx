import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatBenchConversationPane } from "@/components/directory-chat/directory-chat-bench-conversation-pane"
import { DirectoryChatBenchPageLayout } from "@/components/directory-chat/directory-chat-bench-page-layout"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { language } from "@/context/language"
import { encodeDirectory } from "@/lib/directory-token"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  readBenchChatLayoutMode,
  type BenchChatLayoutMode,
} from "@/lib/bench-navigation"
import { resourceSessionKey, useChatStore } from "@/state/chat-store"

const READING_ROUTE_SUFFIX = "/read" as const
const WHITEBOARD_ROUTE_SUFFIX = "/whiteboard" as const

type BenchRouteSearch = {
  [BENCH_CHAT_SEARCH_PARAM]?: BenchChatLayoutMode
}

export const Route = createFileRoute("/$directory/_bench")({
  validateSearch: (search: Record<string, unknown>): BenchRouteSearch => {
    const chatLayoutMode = readBenchChatLayoutMode(search[BENCH_CHAT_SEARCH_PARAM])
    return chatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING
      ? { [BENCH_CHAT_SEARCH_PARAM]: chatLayoutMode }
      : {}
  },
  component: DirectoryBenchRouteLayout,
})

function DirectoryBenchRouteLayout() {
  const location = useLocation()
  const search = Route.useSearch()
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
      <div data-component="directory-chat-bench-opening" className="p-6">
        {language.t("directoryChat.openingNotebook")}
      </div>
    )
  }

  const currentDirectory = controller.mainPaneProps.directory
  const sessionID = controller.mainPaneProps.chatState.sessionID
  const encodedDirectory = encodeDirectory(currentDirectory)
  const initialChatLayoutMode =
    search[BENCH_CHAT_SEARCH_PARAM] === BENCH_CHAT_LAYOUT_FLOATING
      ? BENCH_CHAT_LAYOUT_FLOATING
      : BENCH_CHAT_LAYOUT_DOCKED

  async function openChatRoute() {
    await navigate({
      to: "/$directory/chat",
      params: {
        directory: encodedDirectory,
      },
    })
  }

  return (
    <DirectoryChatBenchPageLayout
      benchKey={`${location.href}:${sessionID ?? ""}`}
      initialChatLayoutMode={initialChatLayoutMode}
      bench={<Outlet />}
      conversation={(controls) => (
        <DirectoryChatBenchConversationPane
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
