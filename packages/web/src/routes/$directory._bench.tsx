import {
  Navigate,
  Outlet,
  createFileRoute,
  useBlocker,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BenchRouteContextProvider } from "@/components/bench/bench-route-context"
import {
  benchContextRefsFromBenchTarget,
  benchContextTargetFromBenchTarget,
  routeString,
} from "@/components/bench/bench-context-utils"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { CreateTeachingFileDialog } from "@/components/teaching/create-teaching-file-dialog"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatBenchConversationPane } from "@/components/directory-chat/directory-chat-bench-conversation-pane"
import {
  DirectoryChatBenchPageLayout,
  readInitialChatPanelWidth,
  resolveDefaultFloatingChatRect,
  resolveInitialFloatingChatContainerSize,
} from "@/components/directory-chat/directory-chat-bench-page-layout"
import { DirectoryChatRightWorkspace } from "@/components/directory-chat/directory-chat-right-workspace"
import { DirectoryChatShell } from "@/components/directory-chat/directory-chat-shell"
import { useDirectoryNotebookRouteContext } from "@/components/directory-chat/directory-notebook-route-context"
import { language } from "@/context/language"
import { encodeDirectory } from "@/lib/directory-token"
import { guardBenchLeaveBeforeNavigation } from "@/lib/bench-leave-guard"
import type { DirectoryChatPageControllerState } from "@/lib/directory-chat/use-directory-chat-page-controller"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_CHAT_SEARCH_PARAM,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  buildBenchNavigation,
  isSameBenchTarget,
  readBenchChatLayoutMode,
  readBenchOpenPolicyStateFromLocation,
  resolveDockedBenchResizeIntent,
  resolveDockedBenchRightWorkspaceLayout,
  resolveDockedBenchShellLayout,
  setBenchPresentationModePreference,
  type BenchChatLayoutMode,
  type BenchLayoutProfileID,
  type BenchViewport,
  type BenchMode,
} from "@/lib/bench-navigation"
import type { BenchFloatingChatState } from "@/components/bench/bench-route-context"
import { resourceSessionKey, useChatStore } from "@/state/chat-store"
import { RIGHT_WORKSPACE_RAIL_WIDTH_PX } from "@/lib/directory-chat/right-sidebar-layout"
import type { ResizeHandleIntent } from "@buddy/ui"

type ReadyDirectoryBenchController = Extract<DirectoryChatPageControllerState, { status: "ready" }>

type BenchRouteSearch = {
  [BENCH_CHAT_SEARCH_PARAM]?: BenchChatLayoutMode
}

const DOCKED_BENCH_DEFAULT_VIEWPORT_WIDTH_PX = 1280
const DOCKED_BENCH_DEFAULT_VIEWPORT_HEIGHT_PX = 800

function hasUsableDimension(value: number) {
  return Number.isFinite(value) && value > 0
}

function readDockedBenchViewport(): BenchViewport {
  if (typeof window === "undefined") {
    return {
      widthPx: DOCKED_BENCH_DEFAULT_VIEWPORT_WIDTH_PX,
      heightPx: DOCKED_BENCH_DEFAULT_VIEWPORT_HEIGHT_PX,
      safeTopPx: 0,
    }
  }

  return {
    widthPx: hasUsableDimension(window.innerWidth)
      ? window.innerWidth
      : DOCKED_BENCH_DEFAULT_VIEWPORT_WIDTH_PX,
    heightPx: hasUsableDimension(window.innerHeight)
      ? window.innerHeight
      : DOCKED_BENCH_DEFAULT_VIEWPORT_HEIGHT_PX,
    safeTopPx: 0,
  }
}

function clampNumber(input: { value: number; min: number; max: number }) {
  if (input.max < input.min) return input.min
  return Math.min(input.max, Math.max(input.min, input.value))
}

function resolveInitialDockedWorkspaceWidth(profile: BenchLayoutProfileID) {
  return resolveDockedBenchRightWorkspaceLayout({
    profile,
    viewport: readDockedBenchViewport(),
    workspaceChromeWidthPx: RIGHT_WORKSPACE_RAIL_WIDTH_PX,
  }).workspaceWidthPx
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

function ReadyDirectoryBenchRouteLayout(props: { controller: ReadyDirectoryBenchController }) {
  const location = useLocation()
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
        search: location.search,
      }),
    [currentDirectory, location.pathname, location.search],
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
      : BENCH_LAYOUT_PROFILE_DOCUMENT
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
  const [chatLayoutMode, setChatLayoutMode] = useState<BenchChatLayoutMode>(routeChatLayoutMode)
  const [dockedChatWidthPx, setDockedChatWidthPx] = useState(() =>
    readInitialChatPanelWidth(layoutProfile),
  )
  const [dockedBenchViewport, setDockedBenchViewport] = useState(readDockedBenchViewport)
  const [dockedWorkspaceWidthPx, setDockedWorkspaceWidthPx] = useState(() =>
    resolveInitialDockedWorkspaceWidth(layoutProfile),
  )
  const [leftSidebarForcedSuppressed, setLeftSidebarForcedSuppressed] = useState(false)
  const [leftSidebarOverlayOpen, setLeftSidebarOverlayOpen] = useState(false)
  const [floatingRect, setFloatingRect] = useState(() =>
    resolveDefaultFloatingChatRect(resolveInitialFloatingChatContainerSize(), layoutProfile),
  )
  const [floatingChatState, setFloatingChatState] = useState<BenchFloatingChatState>("open")
  const didInitializeDockedWorkspaceRef = useRef(false)
  const leftSidebarVisibleRef = useRef(false)
  const dockedWorkspaceMinWidthRef = useRef(0)
  const dockedWorkspaceMaxWidthRef = useRef(0)
  const suppressedWorkspaceMinWidthRef = useRef(0)
  const suppressedWorkspaceMaxWidthRef = useRef(0)
  const previousViewportWidthRef = useRef(dockedBenchViewport.widthPx)
  const chatState = controller.mainPaneProps.chatState
  const fitBasedDockedShellLayout = useMemo(
    () =>
      resolveDockedBenchShellLayout({
        profile: layoutProfile,
        viewport: dockedBenchViewport,
        workspaceChromeWidthPx: RIGHT_WORKSPACE_RAIL_WIDTH_PX,
        leftSidebarPreferredOpen: chatState.leftSidebarOpen,
        leftSidebarWidthPx: chatState.leftSidebarDisplayWidth,
      }),
    [
      chatState.leftSidebarDisplayWidth,
      chatState.leftSidebarOpen,
      dockedBenchViewport,
      layoutProfile,
    ],
  )
  const suppressedDockedShellLayout = useMemo(
    () =>
      resolveDockedBenchShellLayout({
        profile: layoutProfile,
        viewport: dockedBenchViewport,
        workspaceChromeWidthPx: RIGHT_WORKSPACE_RAIL_WIDTH_PX,
        leftSidebarPreferredOpen: false,
        leftSidebarWidthPx: chatState.leftSidebarDisplayWidth,
      }),
    [chatState.leftSidebarDisplayWidth, dockedBenchViewport, layoutProfile],
  )
  const dockedShellLayout = leftSidebarForcedSuppressed
    ? suppressedDockedShellLayout
    : fitBasedDockedShellLayout
  const dockedWorkspaceLayout = dockedShellLayout.rightWorkspace
  const dockedWorkspaceDisplayWidthPx = clampNumber({
    value: dockedWorkspaceWidthPx,
    min: dockedWorkspaceLayout.workspaceMinWidthPx,
    max: dockedWorkspaceLayout.workspaceMaxWidthPx,
  })
  const dockedLeftSidebarVisible = dockedShellLayout.leftSidebarVisible
  const canPinLeftSidebarWithoutResizing =
    dockedBenchViewport.widthPx >=
    chatState.leftSidebarDisplayWidth +
      dockedWorkspaceDisplayWidthPx +
      dockedWorkspaceLayout.chatMinWidthPx

  leftSidebarVisibleRef.current = dockedLeftSidebarVisible
  dockedWorkspaceMinWidthRef.current = dockedWorkspaceLayout.workspaceMinWidthPx
  dockedWorkspaceMaxWidthRef.current = dockedWorkspaceLayout.workspaceMaxWidthPx
  suppressedWorkspaceMinWidthRef.current =
    suppressedDockedShellLayout.rightWorkspace.workspaceMinWidthPx
  suppressedWorkspaceMaxWidthRef.current =
    suppressedDockedShellLayout.rightWorkspace.workspaceMaxWidthPx

  useEffect(() => {
    setChatLayoutMode(routeChatLayoutMode)
    if (routeChatLayoutMode === BENCH_CHAT_LAYOUT_DOCKED) {
      setFloatingChatState("open")
    }
  }, [routeChatLayoutMode])

  useEffect(() => {
    function syncDockedBenchViewport() {
      setDockedBenchViewport(readDockedBenchViewport())
    }

    syncDockedBenchViewport()
    window.addEventListener("resize", syncDockedBenchViewport)
    return () => {
      window.removeEventListener("resize", syncDockedBenchViewport)
    }
  }, [])

  useEffect(() => {
    const nextWidth = clampNumber({
      value: dockedWorkspaceWidthPx,
      min: dockedWorkspaceLayout.workspaceMinWidthPx,
      max: dockedWorkspaceLayout.workspaceMaxWidthPx,
    })
    if (nextWidth !== dockedWorkspaceWidthPx) {
      setDockedWorkspaceWidthPx(nextWidth)
    }
  }, [
    dockedWorkspaceLayout.workspaceMaxWidthPx,
    dockedWorkspaceLayout.workspaceMinWidthPx,
    dockedWorkspaceWidthPx,
  ])

  useEffect(() => {
    if (routeChatLayoutMode !== BENCH_CHAT_LAYOUT_DOCKED) return
    if (didInitializeDockedWorkspaceRef.current) return
    didInitializeDockedWorkspaceRef.current = true

    if (!chatState.rightSidebarOpen) {
      chatState.setRightSidebarOpen(true)
    }
  }, [chatState, routeChatLayoutMode])

  useEffect(() => {
    if (dockedLeftSidebarVisible || routeChatLayoutMode !== BENCH_CHAT_LAYOUT_DOCKED) {
      setLeftSidebarOverlayOpen(false)
    }
  }, [dockedLeftSidebarVisible, routeChatLayoutMode])

  useEffect(() => {
    const viewportWidthChanged = previousViewportWidthRef.current !== dockedBenchViewport.widthPx
    previousViewportWidthRef.current = dockedBenchViewport.widthPx
    if (!viewportWidthChanged) return
    if (!leftSidebarForcedSuppressed) return
    if (!chatState.leftSidebarOpen || !canPinLeftSidebarWithoutResizing) return

    setLeftSidebarForcedSuppressed(false)
  }, [
    canPinLeftSidebarWithoutResizing,
    chatState.leftSidebarOpen,
    dockedBenchViewport.widthPx,
    leftSidebarForcedSuppressed,
  ])

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

  const setBenchMode = useCallback(
    (input: { mode: BenchMode; origin: "user" | "agent" }) => {
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
    },
    [benchPolicyState, currentDirectory, navigate],
  )

  const setBenchChatLayoutMode = useCallback(
    (mode: BenchChatLayoutMode) => {
      setBenchMode({ mode, origin: "user" })
    },
    [setBenchMode],
  )

  const handleLeftSidebarToggle = useCallback(() => {
    if (dockedLeftSidebarVisible) {
      setLeftSidebarForcedSuppressed(false)
      setLeftSidebarOverlayOpen(false)
      chatState.setLeftSidebarOpen(false)
      return
    }

    if (leftSidebarOverlayOpen) {
      setLeftSidebarOverlayOpen(false)
      return
    }

    if (canPinLeftSidebarWithoutResizing) {
      setLeftSidebarForcedSuppressed(false)
      setLeftSidebarOverlayOpen(false)
      chatState.setLeftSidebarOpen(true)
      return
    }

    setLeftSidebarOverlayOpen(true)
  }, [
    canPinLeftSidebarWithoutResizing,
    chatState,
    dockedLeftSidebarVisible,
    leftSidebarOverlayOpen,
  ])

  const handleDockedWorkspaceResizeIntent = useCallback(
    (intent: ResizeHandleIntent) => {
      const minWorkspaceWidthPx = leftSidebarVisibleRef.current
        ? dockedWorkspaceMinWidthRef.current
        : suppressedWorkspaceMinWidthRef.current
      const maxWorkspaceWidthPx = leftSidebarVisibleRef.current
        ? dockedWorkspaceMaxWidthRef.current
        : suppressedWorkspaceMaxWidthRef.current
      const decision = resolveDockedBenchResizeIntent({
        rawWorkspaceWidthPx: intent.rawSize,
        maxWorkspaceWidthPx,
        hasVisibleBenchTarget: benchPolicyState.status === "open",
        leftSidebarVisible: leftSidebarVisibleRef.current,
      })
      if (decision === "clamp") {
        if (intent.min !== minWorkspaceWidthPx || intent.max !== maxWorkspaceWidthPx) {
          setDockedWorkspaceWidthPx(
            clampNumber({
              value: intent.rawSize,
              min: minWorkspaceWidthPx,
              max: maxWorkspaceWidthPx,
            }),
          )
        }
        return
      }

      if (decision === "suppress-left-sidebar") {
        leftSidebarVisibleRef.current = false
        dockedWorkspaceMinWidthRef.current = suppressedWorkspaceMinWidthRef.current
        dockedWorkspaceMaxWidthRef.current = suppressedWorkspaceMaxWidthRef.current
        setLeftSidebarOverlayOpen(false)
        setLeftSidebarForcedSuppressed(true)
        setDockedWorkspaceWidthPx(
          clampNumber({
            value: intent.rawSize,
            min: suppressedWorkspaceMinWidthRef.current,
            max: suppressedWorkspaceMaxWidthRef.current,
          }),
        )
        return
      }

      setBenchMode({
        mode: BENCH_CHAT_LAYOUT_FLOATING,
        origin: "user",
      })
    },
    [benchPolicyState.status, setBenchMode],
  )

  const setFloatingChatSubstate = useCallback(
    (input: { state: BenchFloatingChatState; origin: "user" }) => {
      if (input.origin !== "user") return
      setFloatingChatState(input.state)
    },
    [],
  )

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
      visible={
        chatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING ||
        controller.mainPaneProps.chatState.rightSidebarOpen
      }
      activeSessionID={activeSessionID}
      fallbackProvider={fallbackContextProvider}
      setMode={setBenchMode}
      setFloatingChatState={setFloatingChatSubstate}
    >
      {chatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING ? (
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
      ) : (
        <DirectoryChatShell
          leftSidebar={<ChatLeftSidebar {...controller.leftSidebarProps} />}
          mainPane={
            <DirectoryChatBenchConversationPane
              {...controller.mainPaneProps}
              linkedSessionID={linkedReadingSessionID}
              onFloatChat={() => setBenchMode({ mode: BENCH_CHAT_LAYOUT_FLOATING, origin: "user" })}
              showThreadBrowser={!dockedLeftSidebarVisible}
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
          }
          rightSidebar={
            <DirectoryChatRightWorkspace
              directory={currentDirectory}
              messages={controller.mainPaneProps.chatState.messages}
              sessionID={controller.mainPaneProps.chatState.sessionID}
              workspaceWidth={dockedWorkspaceDisplayWidthPx}
              lastSelector={
                controller.mainPaneProps.chatState.rightWorkspaceLastSelectorByDirectory[
                  currentDirectory
                ]
              }
              onLastSelectorChange={(selector) => {
                controller.mainPaneProps.chatState.setRightWorkspaceLastSelector(
                  currentDirectory,
                  selector,
                )
              }}
              onOpenResource={controller.mainPaneProps.onOpenResource}
              bench={<Outlet />}
              workspaceOpen={controller.mainPaneProps.chatState.rightSidebarOpen}
            />
          }
          createTeachingFileDialog={<CreateTeachingFileDialog {...controller.dialogProps} />}
          {...controller.shellProps}
          leftSidebarOpen={dockedLeftSidebarVisible}
          leftSidebarOverlayEnabled={!dockedLeftSidebarVisible}
          leftSidebarOverlayOpen={leftSidebarOverlayOpen}
          onLeftSidebarOverlayOpenChange={setLeftSidebarOverlayOpen}
          onLeftSidebarToggle={handleLeftSidebarToggle}
          mainPaneMinWidth={dockedWorkspaceLayout.chatMinWidthPx}
          rightSidebarDisplayWidth={dockedWorkspaceDisplayWidthPx}
          rightSidebarMinWidth={dockedWorkspaceLayout.workspaceMinWidthPx}
          rightSidebarMaxWidth={dockedWorkspaceLayout.workspaceMaxWidthPx}
          onRightSidebarResize={setDockedWorkspaceWidthPx}
          onRightSidebarResizeIntent={handleDockedWorkspaceResizeIntent}
          onRightWorkspaceToggle={() =>
            controller.mainPaneProps.chatState.setRightSidebarOpen(
              !controller.mainPaneProps.chatState.rightSidebarOpen,
            )
          }
          chatTitle={controller.mainPaneProps.chatState.sessionTitle}
          titlebarVariant="chat"
          onRightSidebarCollapse={() =>
            controller.mainPaneProps.chatState.setRightSidebarOpen(false)
          }
        />
      )}
    </BenchRouteContextProvider>
  )
}
