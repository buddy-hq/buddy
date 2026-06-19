import {
  Navigate,
  Outlet,
  createFileRoute,
  useBlocker,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { BenchRouteContextProvider } from "@/components/bench/bench-route-context"
import {
  benchContextRefsFromBenchTarget,
  benchContextTargetFromBenchTarget,
  routeString,
} from "@/components/bench/bench-context-utils"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatBenchConversationPane } from "@/components/directory-chat/directory-chat-bench-conversation-pane"
import {
  DirectoryChatBenchPageLayout,
  readInitialChatPanelWidth,
  resolveDefaultFloatingChatRect,
  resolveInitialFloatingChatContainerSize,
} from "@/components/directory-chat/directory-chat-bench-page-layout"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { language } from "@/context/language"
import { encodeDirectory } from "@/lib/directory-token"
import { guardBenchLeaveBeforeNavigation } from "@/lib/bench-leave-guard"
import type { DirectoryChatPageControllerState } from "@/lib/directory-chat/use-directory-chat-page-controller"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  BENCH_LAYOUT_PROFILE_BALANCED,
  buildBenchNavigation,
  isSameBenchTarget,
  readBenchChatLayoutMode,
  readBenchOpenPolicyStateFromLocation,
  setBenchPresentationModePreference,
  type BenchChatLayoutMode,
  type BenchMode,
} from "@/lib/bench-navigation"
import type { BenchFloatingChatState } from "@/components/bench/bench-route-context"
import { resourceSessionKey, useChatStore } from "@/state/chat-store"

type ReadyDirectoryBenchController = Extract<
  DirectoryChatPageControllerState,
  { status: "ready" }
>

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
  const { controller } = useDirectoryNotebookRouteContext()

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

  return <ReadyDirectoryBenchRouteLayout controller={controller} />
}

function ReadyDirectoryBenchRouteLayout(props: {
  controller: ReadyDirectoryBenchController
}) {
  const location = useLocation()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { controller } = props
  const currentDirectory = controller.mainPaneProps.directory
  const activeSessionID = controller.mainPaneProps.chatState.sessionID
  const encodedDirectory = encodeDirectory(currentDirectory)
  const benchPolicyState = useMemo(
    () =>
      readBenchOpenPolicyStateFromLocation({
        directory: currentDirectory,
        pathname: location.pathname,
        search,
      }),
    [currentDirectory, location.pathname, search],
  )
  const isWhiteboardTarget =
    benchPolicyState.status === "open" &&
    benchPolicyState.target.type === "object" &&
    benchPolicyState.target.ref.kind === "whiteboard"
  const linkedReadingSessionID = useChatStore((state) => {
    if (
      benchPolicyState.status !== "open" ||
      benchPolicyState.target.type !== "object" ||
      benchPolicyState.target.ref.kind !== "resource"
    ) {
      return undefined
    }

    const objectID = state.activeReadingResourceByDirectory[currentDirectory]?.objectID
    return objectID
      ? state.linkedSessionByResource[resourceSessionKey(currentDirectory, objectID)]
      : undefined
  })
  const routeChatLayoutMode =
    benchPolicyState.status === "open" ? benchPolicyState.mode : BENCH_CHAT_LAYOUT_DOCKED
  const layoutProfile =
    benchPolicyState.status === "open"
      ? benchPolicyState.layoutProfile
      : BENCH_LAYOUT_PROFILE_BALANCED
  const fallbackContextProvider = useMemo(
    () => ({
      read: () => {
        if (benchPolicyState.status !== "open") {
          throw new Error("Bench fallback context is only available while Bench is open.")
        }

        return {
          status: "open" as const,
          target: benchContextTargetFromBenchTarget({
            target: benchPolicyState.target,
            directory: currentDirectory,
            route: routeString({
              pathname: location.pathname,
              searchStr: location.searchStr,
            }),
            status: "loading",
          }),
          metadata: ["provider: route-fallback", "surface_status: loading"],
          content:
            "The Bench route is open and the surface is still loading or has not registered its live context provider yet.",
          refs: benchContextRefsFromBenchTarget(benchPolicyState.target),
          hints: ["Try bench_read_context again after the Bench surface finishes loading."],
        }
      },
    }),
    [benchPolicyState, currentDirectory, location.pathname, location.searchStr],
  )
  const [chatLayoutMode, setChatLayoutMode] =
    useState<BenchChatLayoutMode>(routeChatLayoutMode)
  const [dockedChatWidthPx, setDockedChatWidthPx] = useState(() =>
    readInitialChatPanelWidth(layoutProfile),
  )
  const [floatingRect, setFloatingRect] = useState(() =>
    resolveDefaultFloatingChatRect(
      resolveInitialFloatingChatContainerSize(),
      layoutProfile,
    ),
  )
  const [floatingChatState, setFloatingChatState] =
    useState<BenchFloatingChatState>("open")

  useEffect(() => {
    setChatLayoutMode(routeChatLayoutMode)
    if (routeChatLayoutMode === BENCH_CHAT_LAYOUT_DOCKED) {
      setFloatingChatState("open")
    }
  }, [routeChatLayoutMode])

  useBlocker({
    shouldBlockFn: async ({ next }) => {
      if (benchPolicyState.status !== "open") return false

      const nextBenchPolicyState = readBenchOpenPolicyStateFromLocation({
        directory: currentDirectory,
        pathname: next.pathname,
        search: next.search,
      })

      if (
        nextBenchPolicyState.status === "open" &&
        nextBenchPolicyState.directory === benchPolicyState.directory &&
        isSameBenchTarget(nextBenchPolicyState.target, benchPolicyState.target)
      ) {
        return false
      }

      const guardResult = await guardBenchLeaveBeforeNavigation({
        directory: currentDirectory,
        intent: nextBenchPolicyState.status === "open" ? "replace-target" : "close",
        origin: "route",
        current: benchPolicyState.target,
        next: nextBenchPolicyState.status === "open" ? nextBenchPolicyState.target : null,
      })

      return guardResult.status === "block"
    },
    enableBeforeUnload: false,
  })

  const openChatRoute = useCallback(async (): Promise<boolean> => {
    if (benchPolicyState.status === "open") {
      const guardResult = await guardBenchLeaveBeforeNavigation({
        directory: currentDirectory,
        intent: "close",
        origin: "user",
        current: benchPolicyState.target,
        next: null,
      })
      if (guardResult.status === "block") return false
    }

    await navigate({
      to: "/$directory/chat",
      params: {
        directory: encodedDirectory,
      },
      replace: true,
    })
    return true
  }, [benchPolicyState, currentDirectory, encodedDirectory, navigate])

  const setBenchMode = useCallback((input: { mode: BenchMode; origin: "user" | "agent" }) => {
    if (benchPolicyState.status !== "open") return
    setChatLayoutMode(input.mode)
    if (input.mode === BENCH_CHAT_LAYOUT_DOCKED) {
      setFloatingChatState("open")
    }
    if (input.origin === "user") {
      setBenchPresentationModePreference({
        target: benchPolicyState.target,
        mode: input.mode,
      })
    }
    void navigate({
      ...buildBenchNavigation({
        directory: currentDirectory,
        target: benchPolicyState.target,
        mode: input.mode,
      }),
      replace: true,
    })
  }, [benchPolicyState, currentDirectory, navigate])

  const setBenchChatLayoutMode = useCallback((mode: BenchChatLayoutMode) => {
    setBenchMode({ mode, origin: "user" })
  }, [setBenchMode])

  const setFloatingChatSubstate = useCallback((input: {
    state: BenchFloatingChatState
    origin: "user"
  }) => {
    if (input.origin !== "user") return
    setFloatingChatState(input.state)
  }, [])

  const benchRuntimeState = useMemo(() => {
    if (benchPolicyState.status !== "open") return undefined
    return {
      directory: currentDirectory,
      target: benchPolicyState.target,
      mode: chatLayoutMode,
      layoutProfile,
      dockedChatWidthPx,
      floatingRect,
      floatingChatState,
    }
  }, [
    benchPolicyState,
    chatLayoutMode,
    currentDirectory,
    dockedChatWidthPx,
    floatingChatState,
    floatingRect,
    layoutProfile,
  ])

  const setFloatingChatStateFromLayout = useCallback(
    (state: BenchFloatingChatState) => {
      setFloatingChatSubstate({ state, origin: "user" })
    },
    [setFloatingChatSubstate],
  )

  if (!benchRuntimeState) {
    return (
      <Navigate
        to="/$directory/chat"
        params={{
          directory: encodedDirectory,
        }}
        replace
      />
    )
  }

  return (
    <BenchRouteContextProvider
      state={benchRuntimeState}
      activeSessionID={activeSessionID}
      fallbackProvider={fallbackContextProvider}
      setMode={setBenchMode}
      setFloatingChatState={setFloatingChatSubstate}
    >
      <DirectoryChatBenchPageLayout
        chatLayoutMode={chatLayoutMode}
        layoutProfile={layoutProfile}
        dockedChatWidthPx={dockedChatWidthPx}
        floatingRect={floatingRect}
        floatingChatState={floatingChatState}
        onChatLayoutModeChange={setBenchChatLayoutMode}
        onDockedChatWidthChange={setDockedChatWidthPx}
        onFloatingRectChange={setFloatingRect}
        onFloatingChatStateChange={setFloatingChatStateFromLayout}
        bench={<Outlet />}
        conversation={(controls) => (
          <DirectoryChatBenchConversationPane
            {...controller.mainPaneProps}
            linkedSessionID={linkedReadingSessionID}
            onFloatChat={controls.onFloatChat}
            onNewSession={() => {
              void (async () => {
                if (isWhiteboardTarget) {
                  const didCloseBench = await openChatRoute()
                  if (!didCloseBench) return
                }
                await controller.leftSidebarProps.onNewSession(currentDirectory)
              })()
            }}
            onSelectSession={(nextSessionID) => {
              void (async () => {
                if (isWhiteboardTarget && nextSessionID) {
                  const didCloseBench = await openChatRoute()
                  if (!didCloseBench) return
                }
                await controller.leftSidebarProps.onSelectSession(currentDirectory, nextSessionID)
              })()
            }}
          />
        )}
      />
    </BenchRouteContextProvider>
  )
}
