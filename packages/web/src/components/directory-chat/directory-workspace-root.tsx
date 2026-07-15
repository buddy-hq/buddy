import { Outlet, useLocation } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { BenchRouteContextProvider } from "@/components/bench/bench-route-context"
import {
  TransientBenchSurfaceProvider,
  closeTransientBenchSurface,
  type TransientBenchSurface,
} from "@/components/bench/transient-bench-surface"
import {
  benchRouteFallbackContextFromTarget,
  routeString,
} from "@/components/bench/bench-context-utils"
import { ChatLeftSidebar } from "@/components/layout/chat-left-sidebar"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { DirectoryChatBenchConversationPane } from "@/components/directory-chat/directory-chat-bench-conversation-pane"
import {
  DirectoryChatBenchPageLayout,
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
  BENCH_DOCK_FLOATING_CHAT_EVENT,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  BENCH_LAYOUT_PROFILE_VISUAL,
  readBenchOpenPolicyStateFromLocation,
  resolveDockedBenchShellLayout,
  resolveDockedBenchResizeIntent,
  finalizeBenchModeTransition,
  setBenchPresentationWorkspaceWidth,
  useBenchPresentationPreferences,
  type BenchChatLayoutMode,
  type BenchViewport,
  type BenchMode,
} from "@/lib/bench-navigation"
import type { BenchFloatingChatState } from "@/components/bench/bench-route-context"
import { resourceSessionKey, useChatStore } from "@/state/chat-store"
import { WORKSPACE_HYDRATION_PENDING } from "@/state/directory-workspace-store"
import type { ResizeHandleIntent } from "@buddy/ui"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import { useStore } from "zustand"
import { resolveWorkspacePresentation } from "@/lib/directory-chat/workspace-presentation"
import { requestPromptComposerFocus } from "@/components/prompt/prompt-composer-focus"
import { createTextPromptDraft, getPromptDraft, usePromptStore } from "@/state/prompt-store"

type ReadyDirectoryBenchController = Extract<DirectoryChatPageControllerState, { status: "ready" }>

const DOCKED_BENCH_DEFAULT_VIEWPORT_WIDTH_PX = 1280
const DOCKED_BENCH_DEFAULT_VIEWPORT_HEIGHT_PX = 800
const CLOSED_BENCH_TARGET_KEY = "closed-bench-target"
const CREATE_BOARD_PROMPT =
  "Create a whiteboard for this notebook chat that helps me organize and develop the current ideas."
const CREATE_CREATION_PROMPT =
  "Create a visual or interactive learning artifact for this notebook chat based on the current context."

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
  const [transientBenchSurface, setTransientBenchSurface] = useState<TransientBenchSurface | null>(
    null,
  )
  const [transientBenchHost, setTransientBenchHost] = useState<HTMLDivElement | null>(null)
  const openTransientBenchSurface = useCallback((surface: TransientBenchSurface) => {
    setTransientBenchSurface(surface)
  }, [])
  const closeActiveTransientBenchSurface = useCallback((surface: TransientBenchSurface) => {
    closeTransientBenchSurface(setTransientBenchSurface, surface)
  }, [])
  const transientBenchActive = transientBenchSurface !== null
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
  const chatLayoutMode = transientBenchActive ? BENCH_CHAT_LAYOUT_DOCKED : routeChatLayoutMode
  const workspaceRenderedSurface = workspace.projection.renderedSurface
  const workspacePending = workspace.projection.pending
  const workspaceBenchVisibility = workspace.projection.bench.visibility
  const workspaceDrawer = workspace.projection.drawer
  const layoutProfile = transientBenchActive
    ? BENCH_LAYOUT_PROFILE_VISUAL
    : benchPolicyState.status === "open"
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
  const [dockedBenchViewport, setDockedBenchViewport] = useState(readDockedBenchViewport)
  const [leftSidebarOverlayOpen, setLeftSidebarOverlayOpen] = useState(false)
  const [floatingRect, setFloatingRect] = useState(() =>
    resolveDefaultFloatingChatRect(resolveInitialFloatingChatContainerSize(), layoutProfile),
  )
  const [floatingChatState, setFloatingChatState] = useState<BenchFloatingChatState>("open")
  const chatState = controller.mainPaneProps.chatState
  const requestedWorkspaceWidthPx = useBenchPresentationPreferences(
    (state) => state.workspaceWidthPx,
  )
  const presentation = useMemo(
    () =>
      resolveWorkspacePresentation({
        projection: workspace.projection,
        hydrated: workspaceHydrated,
        layoutProfile,
        viewport: dockedBenchViewport,
        requestedWorkspaceWidthPx,
        leftSidebarPreferredOpen: chatState.leftSidebarOpen,
        leftSidebarWidthPx: chatState.leftSidebarDisplayWidth,
      }),
    [
      chatState.leftSidebarDisplayWidth,
      chatState.leftSidebarOpen,
      dockedBenchViewport,
      layoutProfile,
      requestedWorkspaceWidthPx,
      workspace.projection,
      workspaceHydrated,
    ],
  )
  const transientDockedShellLayout = useMemo(
    () =>
      resolveDockedBenchShellLayout({
        profile: BENCH_LAYOUT_PROFILE_VISUAL,
        viewport: dockedBenchViewport,
        workspaceChromeWidthPx: 0,
        requestedWorkspaceWidthPx,
        leftSidebarPreferredOpen: chatState.leftSidebarOpen,
        leftSidebarWidthPx: chatState.leftSidebarDisplayWidth,
      }),
    [
      chatState.leftSidebarDisplayWidth,
      chatState.leftSidebarOpen,
      dockedBenchViewport,
      requestedWorkspaceWidthPx,
    ],
  )
  const transientWorkspaceBounds = transientDockedShellLayout.rightWorkspace
  const transientWorkspaceWidthPx = Math.min(
    transientWorkspaceBounds.workspaceMaxWidthPx,
    Math.max(transientWorkspaceBounds.workspaceMinWidthPx, requestedWorkspaceWidthPx),
  )
  const workspaceLayoutMode = presentation.mode
  const effectiveWorkspaceLayoutMode = transientBenchActive
    ? BENCH_CHAT_LAYOUT_DOCKED
    : workspaceLayoutMode
  const workspaceOpen = presentation.workspaceOpen
  const effectiveWorkspaceOpen = transientBenchActive || workspaceOpen
  const workspaceHostOpen = presentation.workspaceOpen
  const effectiveWorkspaceHostOpen = transientBenchActive || workspaceHostOpen
  const dockedWorkspaceDisplayWidthPx = transientBenchActive
    ? transientWorkspaceWidthPx
    : presentation.workspace.widthPx
  const dockedWorkspaceMinWidthPx = transientBenchActive
    ? transientWorkspaceBounds.workspaceMinWidthPx
    : presentation.workspace.minWidthPx
  const dockedWorkspaceMaxWidthPx = transientBenchActive
    ? transientWorkspaceBounds.workspaceMaxWidthPx
    : presentation.workspace.maxWidthPx
  const dockedWorkspaceChatMinWidthPx = transientBenchActive
    ? transientWorkspaceBounds.chatMinWidthPx
    : presentation.workspace.chatMinWidthPx
  const dockedLeftSidebarVisible = transientBenchActive
    ? transientDockedShellLayout.leftSidebarVisible
    : presentation.leftSidebar.visible
  const canPinLeftSidebarWithoutResizing =
    dockedBenchViewport.widthPx >=
    chatState.leftSidebarDisplayWidth +
      dockedWorkspaceDisplayWidthPx +
      dockedWorkspaceChatMinWidthPx

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
      dockedWorkspaceDisplayWidthPx,
      dockedWorkspaceMinWidthPx,
      dockedWorkspaceMaxWidthPx,
      dockedLeftSidebarVisible,
      leftSidebarOverlayOpen,
      presentationKind: presentation.kind,
    })
  }, [
    activeSessionID,
    benchPolicyState,
    chatLayoutMode,
    currentDirectory,
    dockedLeftSidebarVisible,
    dockedWorkspaceDisplayWidthPx,
    leftSidebarOverlayOpen,
    presentation.kind,
    dockedWorkspaceMaxWidthPx,
    dockedWorkspaceMinWidthPx,
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
    if (dockedLeftSidebarVisible || !presentation.dockedBenchVisible) {
      setLeftSidebarOverlayOpen(false)
    }
  }, [dockedLeftSidebarVisible, presentation.dockedBenchVisible])

  const openChatRoute = useCallback(async (): Promise<boolean> => {
    const result = await workspace.controller.execute({ type: "close" })
    return result.outcome === "committed"
  }, [workspace.controller])

  const setBenchMode = useCallback(
    (input: { mode: BenchMode; origin: "user" | "agent" }) => {
      if (benchPolicyState.status !== "open") return
      const target = benchPolicyState.target
      void workspace.controller
        .execute(
          {
            type: "set-mode",
            mode: input.mode,
          },
          { origin: input.origin },
        )
        .then((result) => {
          const transitionCommitted = finalizeBenchModeTransition({
            target,
            mode: input.mode,
            persistPreference: input.origin === "user",
            result,
          })
          if (!transitionCommitted) return
          if (input.mode === BENCH_CHAT_LAYOUT_DOCKED) {
            setFloatingChatState("open")
          }
        })
    },
    [benchPolicyState, workspace.controller],
  )

  const setBenchChatLayoutMode = useCallback(
    (mode: BenchChatLayoutMode) => {
      setBenchMode({ mode, origin: "user" })
    },
    [setBenchMode],
  )

  useEffect(() => {
    function onDockFloatingChat() {
      setBenchChatLayoutMode(BENCH_CHAT_LAYOUT_DOCKED)
    }

    window.addEventListener(BENCH_DOCK_FLOATING_CHAT_EVENT, onDockFloatingChat)
    return () => window.removeEventListener(BENCH_DOCK_FLOATING_CHAT_EVENT, onDockFloatingChat)
  }, [setBenchChatLayoutMode])

  const handleLeftSidebarToggle = useCallback(() => {
    if (dockedLeftSidebarVisible) {
      setLeftSidebarOverlayOpen(false)
      chatState.setLeftSidebarOpen(false)
      return
    }

    if (leftSidebarOverlayOpen) {
      setLeftSidebarOverlayOpen(false)
      return
    }

    if (canPinLeftSidebarWithoutResizing) {
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
      if (transientBenchActive) {
        setBenchPresentationWorkspaceWidth(intent.rawSize)
        return
      }
      const decision = resolveDockedBenchResizeIntent({
        rawWorkspaceWidthPx: intent.rawSize,
        maxWorkspaceWidthPx: dockedWorkspaceMaxWidthPx,
        hasVisibleBenchTarget: presentation.dockedBenchVisible,
        leftSidebarVisible: presentation.leftSidebar.visible,
      })
      if (decision === "clamp") {
        setBenchPresentationWorkspaceWidth(intent.rawSize)
        return
      }

      if (decision === "suppress-left-sidebar") {
        setLeftSidebarOverlayOpen(false)
        setBenchPresentationWorkspaceWidth(intent.rawSize)
        return
      }

      setBenchPresentationWorkspaceWidth(intent.rawSize)
      setBenchMode({
        mode: BENCH_CHAT_LAYOUT_FLOATING,
        origin: "user",
      })
    },
    [dockedWorkspaceMaxWidthPx, presentation, setBenchMode, transientBenchActive],
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
      floatingRect,
      floatingChatState,
    }
  }, [
    benchPolicyState,
    chatLayoutMode,
    currentDirectory,
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

  const selectWorkspaceSession = useCallback(
    async (nextSessionID: string): Promise<boolean> => {
      if (isWhiteboardTarget && nextSessionID) {
        const didCloseBench = await openChatRoute()
        if (!didCloseBench) return false
      }
      await controller.leftSidebarProps.onSelectSession(currentDirectory, nextSessionID)
      return true
    },
    [controller.leftSidebarProps, currentDirectory, isWhiteboardTarget, openChatRoute],
  )
  const handleSelectSession = useCallback(
    async (nextSessionID: string): Promise<void> => {
      await selectWorkspaceSession(nextSessionID)
    },
    [selectWorkspaceSession],
  )

  const handleFloatChat = useCallback(() => {
    setBenchChatLayoutMode(BENCH_CHAT_LAYOUT_FLOATING)
  }, [setBenchChatLayoutMode])

  const stageWorkspacePrompt = useCallback(
    (prompt: string) => {
      const promptKey = controller.mainPaneProps.chatState.promptKey
      const currentDraft = getPromptDraft(usePromptStore.getState(), promptKey)
      const nextValue = currentDraft.value.trim()
        ? `${currentDraft.value.trimEnd()}\n\n${prompt}`
        : prompt
      const nextDraft = createTextPromptDraft(nextValue)
      controller.mainPaneProps.chatState.setPromptDraft(promptKey, {
        ...nextDraft,
        attachments: currentDraft.attachments,
      })
      requestPromptComposerFocus(currentDirectory)
    },
    [controller.mainPaneProps.chatState, currentDirectory],
  )
  const handleCreateBoard = useCallback(
    () => stageWorkspacePrompt(CREATE_BOARD_PROMPT),
    [stageWorkspacePrompt],
  )
  const handleCreateCreation = useCallback(
    () => stageWorkspacePrompt(CREATE_CREATION_PROMPT),
    [stageWorkspacePrompt],
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
          visible={presentation.benchVisible}
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
  const shellLeftSidebarOpen = dockedLeftSidebarVisible
  const transientBenchContext = useMemo(
    () => ({
      activeSurface: transientBenchSurface,
      host: transientBenchHost,
      open: openTransientBenchSurface,
      close: closeActiveTransientBenchSurface,
    }),
    [
      closeActiveTransientBenchSurface,
      openTransientBenchSurface,
      transientBenchHost,
      transientBenchSurface,
    ],
  )

  return (
    <TransientBenchSurfaceProvider value={transientBenchContext}>
      <DirectoryChatShell
        leftSidebar={<ChatLeftSidebar {...controller.leftSidebarProps} />}
        contentLayout={
          <DirectoryChatBenchPageLayout
            chatLayoutMode={effectiveWorkspaceLayoutMode}
            layoutProfile={layoutProfile}
            floatingRect={floatingRect}
            floatingChatState={floatingChatState}
            onChatLayoutModeChange={setBenchChatLayoutMode}
            onFloatingRectChange={setFloatingRect}
            onFloatingChatStateChange={setFloatingChatStateFromLayout}
            benchInteractive={effectiveWorkspaceHostOpen}
            dockedBenchLayout={{
              open: workspaceHydrated && effectiveWorkspaceOpen,
              widthPx: dockedWorkspaceDisplayWidthPx,
              minWidthPx: dockedWorkspaceMinWidthPx,
              maxWidthPx: dockedWorkspaceMaxWidthPx,
              onResizeIntent: handleDockedWorkspaceResizeIntent,
              onCollapse: transientBenchActive
                ? () => {
                    if (transientBenchSurface) {
                      closeActiveTransientBenchSurface(transientBenchSurface)
                    }
                  }
                : handleRightWorkspaceCollapse,
            }}
            bench={
              transientBenchActive ? (
                <div
                  ref={setTransientBenchHost}
                  data-component="transient-bench-surface-host"
                  className="h-full min-h-0 w-full min-w-0 bg-background-base"
                />
              ) : (
                <DirectoryChatRightWorkspace
                  directory={currentDirectory}
                  sessionID={controller.mainPaneProps.chatState.sessionID}
                  sessions={controller.mainPaneProps.chatState.sessions}
                  workspaceWidth={dockedWorkspaceDisplayWidthPx}
                  onCreateBoard={handleCreateBoard}
                  onCreateCreation={handleCreateCreation}
                  onOpenThread={selectWorkspaceSession}
                  onOpenResource={controller.mainPaneProps.onOpenResource}
                  bench={benchOutlet}
                  presentation={presentation}
                />
              )
            }
            threadBrowserProps={
              presentation.controls.showThreadBrowserInPane
                ? {
                    sessionTitle: chatState.sessionTitle,
                    notebookName: controller.shellProps.projectName,
                    sessions: chatState.sessions,
                    activeSessionID: chatState.sessionID,
                    linkedSessionID: linkedReadingSessionID,
                    parentSession: chatState.parentSession,
                    isTurnActive: chatState.isTurnActive,
                    onNewSession: handleNewSession,
                    onSelectSession: handleSelectSession,
                  }
                : undefined
            }
            conversation={() => (
              <DirectoryChatBenchConversationPane
                {...controller.mainPaneProps}
                compactPromptComposer={
                  effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING
                }
                linkedSessionID={linkedReadingSessionID}
                showThreadBrowser={false}
                onNewSession={handleNewSession}
                onSelectSession={handleSelectSession}
              />
            )}
          />
        }
        {...controller.shellProps}
        immersive={
          effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING && !transientBenchActive
        }
        leftSidebarOpen={shellLeftSidebarOpen}
        leftSidebarOverlayEnabled={presentation.leftSidebar.overlayEnabled}
        leftSidebarOverlayOpen={leftSidebarOverlayOpen}
        onLeftSidebarOverlayOpenChange={setLeftSidebarOverlayOpen}
        onLeftSidebarToggle={
          presentation.dockedBenchVisible ? handleLeftSidebarToggle : undefined
        }
        onRightWorkspaceToggle={
          transientBenchActive
            ? () => {
                if (transientBenchSurface) {
                  closeActiveTransientBenchSurface(transientBenchSurface)
                }
              }
            : handleRightWorkspaceToggle
        }
        chatTitle={controller.mainPaneProps.chatState.sessionTitle}
        titlebarVariant="chat"
        rightWorkspaceOpen={effectiveWorkspaceHostOpen}
        showThreadBrowser={presentation.controls.showThreadBrowserInTitlebar}
        showSidebarThreadControls={presentation.controls.showSidebarThreadControls}
        sessions={chatState.sessions}
        activeSessionID={chatState.sessionID}
        linkedSessionID={linkedReadingSessionID}
        parentSession={chatState.parentSession}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onFloatChat={presentation.controls.showFloatChat ? handleFloatChat : undefined}
      />
    </TransientBenchSurfaceProvider>
  )
}
