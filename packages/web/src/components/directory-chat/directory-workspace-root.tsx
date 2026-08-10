import { useLocation } from "@tanstack/react-router"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import {
  BenchRouteContextProvider,
  type BenchRuntimeState,
} from "@/components/bench/bench-route-context"
import { BenchSurfaceHost } from "@/components/bench/bench-surface-host"
import { BenchSurfaceRenderer } from "@/components/bench/bench-surface-renderer"
import { BenchTabs } from "@/components/bench/bench-tabs"
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
import { useDesktopTitlebarContentTarget } from "@/components/layout/desktop-titlebar-content"
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
  benchTargetKey as exactBenchTargetKey,
  readBenchOpenPolicyStateFromLocation,
  resolveDockedBenchShellLayout,
  resolveDockedBenchResizeIntent,
  setBenchPresentationWorkspaceWidth,
  useBenchPresentationPreferences,
  type BenchChatLayoutMode,
  type BenchViewport,
  type BenchMode,
  type BenchTarget,
} from "@/lib/bench-navigation"
import { benchTabKey } from "@/lib/bench-tabs"
import type { BenchFloatingChatState } from "@/components/bench/bench-route-context"
import {
  WORKSPACE_HYDRATION_PENDING,
  workspacePresentationSlotForChat,
} from "@/state/directory-workspace-store"
import type { ResizeHandleIntent } from "@buddy/ui"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { resolveWorkspacePresentation } from "@/lib/directory-chat/workspace-presentation"
import { requestPromptComposerFocus } from "@/components/prompt/prompt-composer-focus"
import { createTextPromptDraft, getPromptDraft, usePromptStore } from "@/state/prompt-store"
import {
  readActiveChatLayoutMotionSuppressed,
  subscribeActiveChatLayoutMotion,
} from "@/lib/active-chat-transition-state"

type ReadyDirectoryBenchController = Extract<DirectoryChatPageControllerState, { status: "ready" }>

const DOCKED_BENCH_DEFAULT_VIEWPORT_WIDTH_PX = 1280
const DOCKED_BENCH_DEFAULT_VIEWPORT_HEIGHT_PX = 800
const CLOSED_BENCH_TARGET_KEY = "closed-bench-target"
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

function useRetainedChatLayoutMotionSuppression(input: {
  suppressed: boolean
  destinationReady: boolean
}): boolean {
  const [retained, setRetained] = useState(input.suppressed)
  const releaseFrameRef = useRef<number | undefined>(undefined)
  const releasePaintFrameRef = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    function cancelRelease(): void {
      if (typeof globalThis.cancelAnimationFrame === "function") {
        if (releaseFrameRef.current !== undefined) {
          globalThis.cancelAnimationFrame(releaseFrameRef.current)
        }
        if (releasePaintFrameRef.current !== undefined) {
          globalThis.cancelAnimationFrame(releasePaintFrameRef.current)
        }
      }
      releaseFrameRef.current = undefined
      releasePaintFrameRef.current = undefined
    }

    if (input.suppressed) {
      cancelRelease()
      setRetained(true)
      return cancelRelease
    }
    if (!retained || !input.destinationReady) {
      return cancelRelease
    }
    if (typeof globalThis.requestAnimationFrame !== "function") {
      setRetained(false)
      return cancelRelease
    }

    releaseFrameRef.current = globalThis.requestAnimationFrame(() => {
      releasePaintFrameRef.current = globalThis.requestAnimationFrame(() => {
        releaseFrameRef.current = undefined
        releasePaintFrameRef.current = undefined
        setRetained(false)
      })
    })
    return cancelRelease
  }, [input.destinationReady, input.suppressed, retained])

  return input.suppressed || retained
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
  const desktopTitlebarContentTarget = useDesktopTitlebarContentTarget()
  const location = useLocation()
  const workspace = useDirectoryWorkspace()
  const activeChatLayoutMotionSuppressed = useSyncExternalStore(
    subscribeActiveChatLayoutMotion,
    readActiveChatLayoutMotionSuppressed,
    readActiveChatLayoutMotionSuppressed,
  )
  const hydrationStatus = useStore(workspace.store, (state) => state.hydration.status)
  const activeTabs = useStore(workspace.store, (state) =>
    workspacePresentationSlotForChat(state.slots, state.activeChatKey).tabs,
  )
  const retainedBenchTargetKeys = useStore(
    workspace.store,
    useShallow((state) => {
      const keys = new Set<string>()
      for (const slot of Object.values(state.slots)) {
        for (const tab of slot?.tabs ?? []) keys.add(exactBenchTargetKey(tab.target))
      }
      return [...keys]
    }),
  )
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
  const activeTabKey =
    benchPolicyState.status === "open" ? benchTabKey(benchPolicyState.target) : null
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
  const workspaceTransitioning = presentation.transitioning
  const suppressLayoutMotion = useRetainedChatLayoutMotionSuppression({
    suppressed: activeChatLayoutMotionSuppressed || workspaceTransitioning,
    destinationReady: workspaceHydrated,
  })
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

  const setBenchMode = useCallback(
    (input: { mode: BenchMode; origin: "user" | "agent" }) => {
      if (benchPolicyState.status !== "open") return
      void workspace.controller
        .execute(
          {
            type: "set-mode",
            mode: input.mode,
          },
          { origin: input.origin },
        )
        .then((result) => {
          if (
            result.outcome === "committed" &&
            result.projection.route.status === "open" &&
            result.projection.route.mode === BENCH_CHAT_LAYOUT_DOCKED &&
            input.mode === BENCH_CHAT_LAYOUT_DOCKED
          ) {
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
    await controller.leftSidebarProps.onNewSession(currentDirectory)
  }, [controller.leftSidebarProps, currentDirectory])

  const selectWorkspaceSession = useCallback(
    async (nextSessionID: string): Promise<boolean> =>
      controller.leftSidebarProps.onSelectSession(currentDirectory, nextSessionID),
    [controller.leftSidebarProps, currentDirectory],
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
  const handleCreateCreation = useCallback(
    () => stageWorkspacePrompt(CREATE_CREATION_PROMPT),
    [stageWorkspacePrompt],
  )
  const activateBenchTab = useCallback(
    (tabKey: string) => {
      void workspace.controller.execute({ type: "focus-tab", tabKey })
    },
    [workspace.controller],
  )
  const closeBenchTab = useCallback(
    (tabKey: string) => {
      void workspace.controller.execute({ type: "close-tab", tabKey })
    },
    [workspace.controller],
  )
  const closeOtherBenchTabs = useCallback(
    (tabKey: string) => {
      void workspace.controller.execute({ type: "close-other-tabs", tabKey })
    },
    [workspace.controller],
  )
  const closeBenchTabsToRight = useCallback(
    (tabKey: string) => {
      void workspace.controller.execute({ type: "close-tabs-to-right", tabKey })
    },
    [workspace.controller],
  )
  const closeAllBenchTabs = useCallback(() => {
    void workspace.controller.execute({ type: "close-all-tabs" })
  }, [workspace.controller])

  const activeBenchTargetKey = workspace.projection.bench.targetKey ?? CLOSED_BENCH_TARGET_KEY
  const activeBenchTarget = benchRuntimeState?.target ?? null
  const renderBenchSurface = useCallback(
    (target: BenchTarget) => <BenchSurfaceRenderer directory={currentDirectory} target={target} />,
    [currentDirectory],
  )
  const renderBenchContext = useCallback(
    (input: { active: boolean; state: BenchRuntimeState; children: ReactNode }) => (
      <BenchRouteContextProvider
        state={input.state}
        active={input.active}
        visible={presentation.benchVisible}
        activeSessionID={activeSessionID}
        fallbackProvider={fallbackContextProvider}
        setMode={setBenchMode}
        setFloatingChatState={setFloatingChatSubstate}
      >
        {input.children}
      </BenchRouteContextProvider>
    ),
    [
      activeSessionID,
      fallbackContextProvider,
      presentation.benchVisible,
      setBenchMode,
      setFloatingChatSubstate,
    ],
  )
  const benchOutlet = (
    <div
      data-component="directory-workspace-bench-target-boundary"
      data-target-key={activeBenchTargetKey}
      className="h-full min-h-0 w-full min-w-0"
    >
      <BenchSurfaceHost
        directory={currentDirectory}
        activeTarget={activeBenchTarget}
        retainedTargetKeys={retainedBenchTargetKeys}
        benchVisible={presentation.benchVisible}
        activeRuntimeState={benchRuntimeState}
        renderContext={renderBenchContext}
        renderSurface={renderBenchSurface}
      />
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
  const showImmersiveTabsInDesktopTitlebar =
    effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING &&
    !transientBenchActive &&
    desktopTitlebarContentTarget !== null
  const titlebarBenchTabs = !transientBenchActive ? (
    <BenchTabs
      placement="titlebar"
      directory={currentDirectory}
      tabs={activeTabs}
      activeTabKey={activeTabKey}
      onActivate={activateBenchTab}
      onClose={closeBenchTab}
      onCloseOthers={closeOtherBenchTabs}
      onCloseToRight={closeBenchTabsToRight}
      onCloseAll={closeAllBenchTabs}
    />
  ) : null

  // Do not mount a full-width transcript and then replace it with the persisted workspace
  // geometry. Hydration is the one point where waiting is correct: no transcript instance exists
  // yet, so mounting once after the durable layout is known preserves its normal cache and anchor
  // lifecycle while avoiding a wrong first paint.
  if (!workspaceHydrated) {
    return (
      <div
        data-component="directory-workspace-hydrating"
        className="h-full min-h-0 w-full min-w-0 bg-surface-raised-base"
      />
    )
  }

  return (
    <TransientBenchSurfaceProvider value={transientBenchContext}>
      {showImmersiveTabsInDesktopTitlebar
        ? createPortal(titlebarBenchTabs, desktopTitlebarContentTarget)
        : null}
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
            suppressLayoutMotion={suppressLayoutMotion}
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
                // The chat transition no longer swaps in a blank frame. Unmounting the workspace
                // here destroyed every kept-alive surface on every switch, which is exactly the
                // rebuild this host exists to prevent. During a transition the projection has no
                // active target, so BenchSurfaceHost shows nothing while parked surfaces survive.
                <DirectoryChatRightWorkspace
                  directory={currentDirectory}
                  sessionID={controller.mainPaneProps.chatState.sessionID}
                  sessions={controller.mainPaneProps.chatState.sessions}
                  workspaceWidth={dockedWorkspaceDisplayWidthPx}
                  suppressDrawerMotion={suppressLayoutMotion}
                  onCreateCreation={handleCreateCreation}
                  onOpenThread={selectWorkspaceSession}
                  onOpenResource={controller.mainPaneProps.onOpenResource}
                  tabs={activeTabs}
                  activeTabKey={activeTabKey}
                  onActivateTab={activateBenchTab}
                  onCloseTab={closeBenchTab}
                  onCloseOtherTabs={closeOtherBenchTabs}
                  onCloseTabsToRight={closeBenchTabsToRight}
                  onCloseAllTabs={closeAllBenchTabs}
                  showTabsInWorkspace={
                    effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING &&
                    desktopTitlebarContentTarget === null
                  }
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
                compactPromptComposer={effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING}
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
        onLeftSidebarToggle={presentation.dockedBenchVisible ? handleLeftSidebarToggle : undefined}
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
        rightWorkspaceDisplayWidth={dockedWorkspaceDisplayWidthPx}
        rightWorkspaceTitlebar={
          effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_DOCKED && effectiveWorkspaceHostOpen ? (
            transientBenchActive ? (
              <div className="h-full bg-background-base" />
            ) : (
              titlebarBenchTabs
            )
          ) : undefined
        }
        showThreadBrowser={presentation.controls.showThreadBrowserInTitlebar}
        showSidebarThreadControls={presentation.controls.showSidebarThreadControls}
        sessions={chatState.sessions}
        activeSessionID={chatState.sessionID}
        parentSession={chatState.parentSession}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onFloatChat={presentation.controls.showFloatChat ? handleFloatChat : undefined}
      />
    </TransientBenchSurfaceProvider>
  )
}
