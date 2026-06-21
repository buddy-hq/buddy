import { Outlet, useLocation } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BenchRouteContextProvider } from "@/components/bench/bench-route-context"
import {
  benchRouteFallbackContextFromTarget,
  routeString,
} from "@/components/bench/bench-context-utils"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
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
import { useDirectoryWorkspace } from "@/components/directory-chat/directory-workspace-context"
import { language } from "@/context/language"
import type { DirectoryChatPageControllerState } from "@/lib/directory-chat/use-directory-chat-page-controller"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
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
import { RIGHT_WORKSPACE_RAIL_WIDTH_PX } from "@/lib/directory-chat/right-workspace-layout"
import {
  WORKSPACE_HYDRATION_PENDING,
  WORKSPACE_VISIBILITY_EXPANDED,
} from "@/state/directory-workspace-store"
import type { ResizeHandleIntent } from "@buddy/ui"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import { useStore } from "zustand"

type ReadyDirectoryBenchController = Extract<DirectoryChatPageControllerState, { status: "ready" }>

const DOCKED_BENCH_DEFAULT_VIEWPORT_WIDTH_PX = 1280
const DOCKED_BENCH_DEFAULT_VIEWPORT_HEIGHT_PX = 800
const CLOSED_BENCH_TARGET_KEY = "closed-bench-target"

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

export function DirectoryWorkspaceRoot() {
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

  return <ReadyDirectoryWorkspaceRoot controller={controller} />
}

function ReadyDirectoryWorkspaceRoot(props: { controller: ReadyDirectoryBenchController }) {
  const location = useLocation()
  const workspace = useDirectoryWorkspace()
  const hydrationStatus = useStore(workspace.store, (state) => state.hydration.status)
  const workspaceHydrated = hydrationStatus !== WORKSPACE_HYDRATION_PENDING
  const { controller } = props
  const currentDirectory = controller.mainPaneProps.directory
  const activeSessionID = controller.mainPaneProps.chatState.sessionID
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
  const chatLayoutMode = routeChatLayoutMode
  const workspaceLayoutMode = workspaceHydrated ? chatLayoutMode : BENCH_CHAT_LAYOUT_DOCKED
  const workspaceOpen =
    workspace.projection.dockedState.visibility === WORKSPACE_VISIBILITY_EXPANDED
  const workspaceHostOpen =
    workspaceHydrated &&
    (workspaceOpen ||
      (benchPolicyState.status === "open" && chatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING))
  const workspaceRenderedSurface = workspace.projection.renderedSurface
  const workspacePending = workspace.projection.pending
  const workspaceBenchVisibility = workspace.projection.bench.visibility
  const workspaceDrawer = workspace.projection.drawer
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

        return benchRouteFallbackContextFromTarget({
          target: benchPolicyState.target,
          directory: currentDirectory,
          route: routeString({
            pathname: location.pathname,
            searchStr: location.searchStr,
          }),
        })
      },
    }),
    [benchPolicyState, currentDirectory, location.pathname, location.searchStr],
  )
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
    logBenchToggleStep("directory-workspace-root-state", {
      currentDirectory,
      activeSessionID,
      benchPolicyState,
      routeChatLayoutMode,
      chatLayoutMode,
      workspaceOpen,
      workspaceRenderedSurface,
      workspaceBenchVisibility,
      workspaceDrawer,
      workspacePending,
      dockedWorkspaceWidthPx,
      dockedWorkspaceDisplayWidthPx,
      dockedWorkspaceMinWidthPx: dockedWorkspaceLayout.workspaceMinWidthPx,
      dockedWorkspaceMaxWidthPx: dockedWorkspaceLayout.workspaceMaxWidthPx,
      dockedLeftSidebarVisible,
      leftSidebarForcedSuppressed,
      leftSidebarOverlayOpen,
    })
  }, [
    activeSessionID,
    benchPolicyState,
    chatLayoutMode,
    currentDirectory,
    dockedLeftSidebarVisible,
    dockedWorkspaceDisplayWidthPx,
    dockedWorkspaceLayout.workspaceMaxWidthPx,
    dockedWorkspaceLayout.workspaceMinWidthPx,
    dockedWorkspaceWidthPx,
    leftSidebarForcedSuppressed,
    leftSidebarOverlayOpen,
    routeChatLayoutMode,
    workspaceBenchVisibility,
    workspaceDrawer,
    workspaceOpen,
    workspacePending,
    workspaceRenderedSurface,
  ])

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

  const openChatRoute = useCallback(async (): Promise<boolean> => {
    const result = await workspace.controller.execute({ type: "close" })
    return result.outcome === "committed"
  }, [workspace.controller])

  const setBenchMode = useCallback(
    (input: { mode: BenchMode; origin: "user" | "agent" }) => {
      if (benchPolicyState.status !== "open") return
      if (input.mode === BENCH_CHAT_LAYOUT_DOCKED) {
        setFloatingChatState("open")
      }
      if (input.origin === "user") {
        setBenchPresentationModePreference({
          target: benchPolicyState.target,
          mode: input.mode,
        })
      }
      void workspace.controller.execute(
        {
          type: "set-mode",
          mode: input.mode,
        },
        { origin: input.origin },
      )
    },
    [benchPolicyState, workspace.controller],
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
      route: routeString({
        pathname: location.pathname,
        searchStr: location.searchStr,
      }),
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
    location.pathname,
    location.searchStr,
  ])

  const setFloatingChatStateFromLayout = useCallback(
    (state: BenchFloatingChatState) => {
      setFloatingChatSubstate({ state, origin: "user" })
    },
    [setFloatingChatSubstate],
  )

  const handleRightWorkspaceToggle = useCallback(() => {
    const commandType = workspaceOpen ? "collapse" : "reveal"
    logBenchToggleStep("directory-workspace-root-right-toggle-callback-entry", {
      commandType,
      currentDirectory,
      activeSessionID,
      benchPolicyState,
      chatLayoutMode,
      workspaceOpen,
      workspaceRenderedSurface,
      workspaceBenchVisibility,
      workspacePending,
      dockedWorkspaceDisplayWidthPx,
    })
    void workspace.controller
      .execute({ type: commandType })
      .then((result) => {
        logBenchToggleStep("directory-workspace-root-right-toggle-controller-result", {
          commandType,
          result,
        })
      })
      .catch((error: unknown) => {
        logBenchToggleStep("directory-workspace-root-right-toggle-controller-error", {
          commandType,
          error,
        })
      })
  }, [
    activeSessionID,
    benchPolicyState,
    chatLayoutMode,
    currentDirectory,
    dockedWorkspaceDisplayWidthPx,
    workspace.controller,
    workspaceBenchVisibility,
    workspaceOpen,
    workspacePending,
    workspaceRenderedSurface,
  ])

  const handleRightWorkspaceCollapse = useCallback(() => {
    logBenchToggleStep("directory-workspace-root-right-collapse-callback-entry", {
      currentDirectory,
      activeSessionID,
      workspaceOpen,
      workspaceRenderedSurface,
      workspacePending,
    })
    void workspace.controller
      .execute({ type: "collapse" })
      .then((result) => {
        logBenchToggleStep("directory-workspace-root-right-collapse-controller-result", {
          result,
        })
      })
      .catch((error: unknown) => {
        logBenchToggleStep("directory-workspace-root-right-collapse-controller-error", {
          error,
        })
      })
  }, [
    activeSessionID,
    currentDirectory,
    workspace.controller,
    workspaceOpen,
    workspacePending,
    workspaceRenderedSurface,
  ])

  const handleNewSession = useCallback(async () => {
    if (isWhiteboardTarget) {
      const didCloseBench = await openChatRoute()
      if (!didCloseBench) return
    }
    await controller.leftSidebarProps.onNewSession(currentDirectory)
  }, [controller.leftSidebarProps, currentDirectory, isWhiteboardTarget, openChatRoute])

  const handleSelectSession = useCallback(
    async (nextSessionID: string) => {
      if (isWhiteboardTarget && nextSessionID) {
        const didCloseBench = await openChatRoute()
        if (!didCloseBench) return
      }
      await controller.leftSidebarProps.onSelectSession(currentDirectory, nextSessionID)
    },
    [controller.leftSidebarProps, currentDirectory, isWhiteboardTarget, openChatRoute],
  )

  const benchTargetKey = workspace.projection.bench.targetKey ?? CLOSED_BENCH_TARGET_KEY
  const benchOutlet = (
    <div
      key={benchTargetKey}
      data-component="directory-workspace-bench-target-boundary"
      data-target-key={benchTargetKey}
      className="h-full min-h-0 w-full min-w-0"
    >
      {benchRuntimeState ? (
        <BenchRouteContextProvider
          state={benchRuntimeState}
          visible={workspaceHydrated && workspace.projection.bench.visibility === "visible"}
          activeSessionID={activeSessionID}
          fallbackProvider={fallbackContextProvider}
          setMode={setBenchMode}
          setFloatingChatState={setFloatingChatSubstate}
        >
          <Outlet />
        </BenchRouteContextProvider>
      ) : null}
    </div>
  )
  const isDockedBenchRoute =
    benchPolicyState.status === "open" && chatLayoutMode === BENCH_CHAT_LAYOUT_DOCKED
  const shellLeftSidebarOpen = isDockedBenchRoute
    ? dockedLeftSidebarVisible
    : controller.shellProps.leftSidebarOpen
  const showThreadBrowser =
    benchPolicyState.status === "open" &&
    (workspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING || !dockedLeftSidebarVisible)

  return (
    <DirectoryChatShell
      leftSidebar={<ChatLeftSidebar {...controller.leftSidebarProps} />}
      mainPane={null}
      rightWorkspace={null}
      contentLayout={
        <DirectoryChatBenchPageLayout
          chatLayoutMode={workspaceLayoutMode}
          layoutProfile={layoutProfile}
          dockedChatWidthPx={dockedChatWidthPx}
          floatingRect={floatingRect}
          floatingChatState={floatingChatState}
          onChatLayoutModeChange={setBenchChatLayoutMode}
          onDockedChatWidthChange={setDockedChatWidthPx}
          onFloatingRectChange={setFloatingRect}
          onFloatingChatStateChange={setFloatingChatStateFromLayout}
          benchInteractive={workspaceHostOpen}
          dockedBenchLayout={{
            open: workspaceHydrated && workspaceOpen,
            widthPx: dockedWorkspaceDisplayWidthPx,
            minWidthPx: dockedWorkspaceLayout.workspaceMinWidthPx,
            maxWidthPx: dockedWorkspaceLayout.workspaceMaxWidthPx,
            onResize: setDockedWorkspaceWidthPx,
            onResizeIntent: handleDockedWorkspaceResizeIntent,
            onCollapse: handleRightWorkspaceCollapse,
          }}
          bench={
            <DirectoryChatRightWorkspace
              directory={currentDirectory}
              messages={controller.mainPaneProps.chatState.messages}
              sessionID={controller.mainPaneProps.chatState.sessionID}
              workspaceWidth={dockedWorkspaceDisplayWidthPx}
              onOpenResource={controller.mainPaneProps.onOpenResource}
              bench={benchOutlet}
              workspaceOpen={workspaceHostOpen}
              presentationMode={chatLayoutMode}
            />
          }
          conversation={(controls) => (
            <DirectoryChatBenchConversationPane
              {...controller.mainPaneProps}
              linkedSessionID={linkedReadingSessionID}
              onFloatChat={controls.onFloatChat}
              showThreadBrowser={showThreadBrowser}
              onNewSession={handleNewSession}
              onSelectSession={handleSelectSession}
            />
          )}
        />
      }
      {...controller.shellProps}
      immersive={workspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING}
      leftSidebarOpen={shellLeftSidebarOpen}
      leftSidebarOverlayEnabled={isDockedBenchRoute && !dockedLeftSidebarVisible}
      leftSidebarOverlayOpen={leftSidebarOverlayOpen}
      onLeftSidebarOverlayOpenChange={setLeftSidebarOverlayOpen}
      onLeftSidebarToggle={isDockedBenchRoute ? handleLeftSidebarToggle : undefined}
      mainPaneMinWidth={dockedWorkspaceLayout.chatMinWidthPx}
      rightWorkspaceDisplayWidth={dockedWorkspaceDisplayWidthPx}
      rightWorkspaceMinWidth={dockedWorkspaceLayout.workspaceMinWidthPx}
      rightWorkspaceMaxWidth={dockedWorkspaceLayout.workspaceMaxWidthPx}
      onRightWorkspaceResize={setDockedWorkspaceWidthPx}
      onRightWorkspaceResizeIntent={handleDockedWorkspaceResizeIntent}
      onRightWorkspaceToggle={handleRightWorkspaceToggle}
      chatTitle={controller.mainPaneProps.chatState.sessionTitle}
      titlebarVariant="chat"
      rightWorkspaceOpen={workspaceHostOpen}
      onRightWorkspaceCollapse={handleRightWorkspaceCollapse}
    />
  )
}
