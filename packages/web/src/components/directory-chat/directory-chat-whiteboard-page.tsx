import { useEffect, useMemo, useRef } from "react"
import { useLocation } from "@tanstack/react-router"
import { WhiteboardPane } from "@/components/whiteboard/whiteboard-pane"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import { routeString, whiteboardTarget } from "@/components/bench/bench-context-utils"
import { suppressWhiteboardAutoOpen } from "@/components/whiteboard/whiteboard-auto-open-state"
import { readLatestActiveWhiteboardCreateKey } from "@/components/whiteboard/whiteboard-progressive"
import { language } from "@/context/language"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import type { DirectoryChatPageControllerState } from "@/lib/directory-chat/use-directory-chat-page-controller"
import { DirectoryInvalidNotebook } from "./directory-invalid-notebook"

type DirectoryChatWhiteboardPageProps = {
  directory: string
}

type ReadyDirectoryChatController = Extract<
  DirectoryChatPageControllerState,
  { status: "ready" }
>

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

  return <ReadyDirectoryChatWhiteboardPage directory={props.directory} controller={controller} />
}

function ReadyDirectoryChatWhiteboardPage(props: {
  directory: string
  controller: ReadyDirectoryChatController
}) {
  const location = useLocation()
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: whiteboardTarget({
          directory: props.directory,
          route: routeString({
            pathname: location.pathname,
            searchStr: location.searchStr,
          }),
        }),
        metadata: ["surface: whiteboard"],
        content:
          "The whiteboard is visible on Bench. Use whiteboard_read_context for board contents, layout, visible text, and learner edits.",
        refs: [
          {
            kind: "tool" as const,
            value: "whiteboard_read_context",
            note: "Reads precise board elements, layout, visible text, and learner edits.",
          },
        ],
        hints: ["Whiteboard board state is domain context, not generic Bench context."],
      }),
    }),
    [location.pathname, location.searchStr, props.directory],
  )
  useRegisterBenchContextProvider(contextProvider)

  const chatState = props.controller.mainPaneProps.chatState
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
