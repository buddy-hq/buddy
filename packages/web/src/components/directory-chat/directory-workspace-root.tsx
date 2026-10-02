import { useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
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
  BenchClosedContextPublisher,
  BenchRouteContextProvider,
  type BenchRuntimeState,
} from "@/components/bench/bench-route-context"
import { BenchSurfaceHost } from "@/components/bench/bench-surface-host"
import { BenchSurfaceRenderer } from "@/components/bench/bench-surface-renderer"
import { BenchTabs } from "@/components/bench/bench-tabs"
import { BenchQuickOpen } from "@/components/bench/bench-quick-open"
import { showWorkspaceDrawer } from "@/components/directory-chat/show-workspace-drawer"
import {
  TransientBenchSurfaceProvider,
  TransientBenchSurfaceStack,
  closeTransientBenchSurface,
  resolveTransientBenchSurfaceLayoutMode,
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
import { IN_APP_BROWSER_BLANK_URL } from "@buddy/browser-contract"
import { useRightWorkspaceOpen } from "@/components/directory-chat/right-workspace-open"
import { useInAppBrowserLinkRouting } from "@/components/directory-chat/use-in-app-browser-link-routing"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useCreateBoard } from "@/lib/use-create-board"
import { BENCH_EDITOR_SELECTOR } from "@/lib/shortcuts"
import { useBenchTabShortcuts, useShortcutCommand } from "@/lib/use-shortcut-command"
import { useClaimCloseTabShortcut } from "@/lib/close-tab-shortcut"
import { useWarmNotebookFileIndex } from "@/state/notebook-file-search"
import type { DirectoryChatPageControllerState } from "@/lib/directory-chat/use-directory-chat-page-controller"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_DOCK_FLOATING_CHAT_EVENT,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  BENCH_LAYOUT_PROFILE_VISUAL,
  BENCH_MODE_REQUEST_POLICY,
  benchTargetKey as exactBenchTargetKey,
  isBenchContentTarget,
  readBenchOpenPolicyStateFromLocation,
  resolveDockedBenchShellLayout,
  resolveDockedBenchResizeIntent,
  setBenchPresentationWorkspaceWidth,
  useBenchPresentationPreferences,
  type BenchChatLayoutMode,
  type BenchViewport,
  type BenchMode,
  type BenchTabTarget,
} from "@/lib/bench-navigation"
import { benchTabKey, createEmptyBenchTabID } from "@/lib/bench-tabs"
import { useBenchEmptyTabDrafts } from "@/state/bench-empty-tab-drafts"
import type { BenchFloatingChatState } from "@/components/bench/bench-route-context"
import {
  WORKSPACE_HYDRATION_PENDING,
  workspacePresentationSlotForChat,
} from "@/state/directory-workspace-store"
import { toast, type ResizeHandleIntent } from "@buddy/ui"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import {
  resolveWorkspacePresentation,
  workspaceCollectionForDrawer,
  workspaceCollectionForTarget,
} from "@/lib/directory-chat/workspace-presentation"
import { requestPromptComposerFocus } from "@/components/prompt/prompt-composer-focus"
import { readPromptComposerLiveDraft } from "@/components/prompt/prompt-composer-live-draft"
import { createTextPromptDraft } from "@/state/prompt-store"
import {
  readActiveChatLayoutMotionSuppressed,
  subscribeActiveChatLayoutMotion,
} from "@/lib/active-chat-transition-state"
import { openOwnedSubagentBench } from "@/lib/subagent-bench-target"
import { useOpenSubagentBench } from "@/lib/use-open-subagent-bench"
import { browserWindow, hasFunctionValue } from "@/state/parse-external"
import { createInAppBrowserBenchTarget, createNotesBenchTarget } from "@/lib/bench-targets"
import {
  useInAppBrowserSettingsStore,
  waitForInAppBrowserSettingsHydration,
} from "@/state/in-app-browser-settings-store"
import { createNoteAndUpdateCache } from "@/features/notes/create-note"
import { sessionNoteQueryOptions } from "@/features/notes/queries"

type ReadyDirectoryBenchController = Extract<DirectoryChatPageControllerState, { status: "ready" }>
type DirectoryWorkspaceBenchRuntimeState = Omit<BenchRuntimeState, "target"> & {
  target: BenchTabTarget
}

const DOCKED_BENCH_DEFAULT_VIEWPORT_WIDTH_PX = 1280
const DOCKED_BENCH_DEFAULT_VIEWPORT_HEIGHT_PX = 800
const CLOSED_BENCH_TARGET_KEY = "closed-bench-target"
const NO_EMPTY_TAB_IDS: readonly string[] = []
const CREATE_CREATION_PROMPT =
  "Create a visual or interactive learning artifact for this notebook chat based on the current context."

function hasUsableDimension(value: number) {
  return Number.isFinite(value) && value > 0
}

function readDockedBenchViewport(): BenchViewport {
  if (!browserWindow()) {
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
      if (hasFunctionValue(globalThis.cancelAnimationFrame)) {
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
    if (!hasFunctionValue(globalThis.requestAnimationFrame)) {
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
  const location = useLocation()
  const workspace = useDirectoryWorkspace()
  const activeChatLayoutMotionSuppressed = useSyncExternalStore(
    subscribeActiveChatLayoutMotion,
    readActiveChatLayoutMotionSuppressed,
    readActiveChatLayoutMotionSuppressed,
  )
  const hydrationStatus = useStore(workspace.store, (state) => state.hydration.status)
  const activeTabs = useStore(
    workspace.store,
    (state) => workspacePresentationSlotForChat(state.slots, state.activeChatKey).tabs,
  )
  const emptyTabIDs = useStore(
    workspace.store,
    (state) =>
      workspacePresentationSlotForChat(state.slots, state.activeChatKey).emptyTabIDs ??
      NO_EMPTY_TAB_IDS,
  )
  const activeEmptyTabID = useStore(
    workspace.store,
    (state) =>
      workspacePresentationSlotForChat(state.slots, state.activeChatKey).activeEmptyTabID ?? null,
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
  const sessionNoteQuery = useQuery({
    ...sessionNoteQueryOptions(activeSessionID ?? ""),
    enabled: Boolean(activeSessionID),
  })
  const currentChatNote = activeSessionID ? sessionNoteQuery.data?.note : undefined
  const openSubagentBench = useOpenSubagentBench()
  const [transientBenchSurface, setTransientBenchSurface] = useState<TransientBenchSurface | null>(
    null,
  )
  const [transientBenchHost, setTransientBenchHost] = useState<HTMLDivElement | null>(null)
  const [shellTitlebarContentTarget, setShellTitlebarContentTarget] =
    useState<HTMLDivElement | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const openTransientBenchSurface = useCallback((surface: TransientBenchSurface) => {
    setTransientBenchSurface(surface)
  }, [])
  const closeActiveTransientBenchSurface = useCallback((surface: TransientBenchSurface) => {
    closeTransientBenchSurface(setTransientBenchSurface, surface)
  }, [])
  const transientBenchActive = transientBenchSurface !== null
  const transientBenchLayoutMode = resolveTransientBenchSurfaceLayoutMode(transientBenchSurface)
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
  const chatLayoutMode = transientBenchLayoutMode ?? routeChatLayoutMode
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
        if (benchPolicyState.status !== "open" || !isBenchContentTarget(benchPolicyState.target)) {
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
  const requestedBenchWidthPx = useBenchPresentationPreferences((state) => state.benchWidthPx)
  const presentation = useMemo(
    () =>
      resolveWorkspacePresentation({
        projection: workspace.projection,
        hydrated: workspaceHydrated,
        layoutProfile,
        viewport: dockedBenchViewport,
        requestedWorkspaceWidthPx,
        requestedBenchWidthPx,
        leftSidebarPreferredOpen: chatState.leftSidebarOpen,
        leftSidebarWidthPx: chatState.leftSidebarDisplayWidth,
      }),
    [
      chatState.leftSidebarDisplayWidth,
      chatState.leftSidebarOpen,
      dockedBenchViewport,
      layoutProfile,
      requestedBenchWidthPx,
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
        requestedWorkspaceWidthPx: requestedBenchWidthPx,
        leftSidebarPreferredOpen: chatState.leftSidebarOpen,
        leftSidebarWidthPx: chatState.leftSidebarDisplayWidth,
      }),
    [
      chatState.leftSidebarDisplayWidth,
      chatState.leftSidebarOpen,
      dockedBenchViewport,
      requestedBenchWidthPx,
    ],
  )
  const transientWorkspaceBounds = transientDockedShellLayout.rightWorkspace
  const transientWorkspaceWidthPx = transientDockedShellLayout.workspaceWidthPx
  const workspaceLayoutMode = presentation.mode
  const effectiveWorkspaceLayoutMode = transientBenchLayoutMode ?? workspaceLayoutMode
  const workspaceOpen = presentation.workspaceOpen
  // The empty page is on screen only when no tab and no collection drawer is shown.
  const emptyTabSelected = workspaceOpen && activeTabKey === null
  const emptyBenchPageVisible = emptyTabSelected && workspaceDrawer === null
  const shownEmptyTabID = emptyBenchPageVisible ? activeEmptyTabID : null
  const selectedEmptyTabID = emptyTabSelected ? activeEmptyTabID : null
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
    if (dockedLeftSidebarVisible || !presentation.leftSidebar.managedByWorkspace) {
      setLeftSidebarOverlayOpen(false)
    }
  }, [dockedLeftSidebarVisible, presentation.leftSidebar.managedByWorkspace])

  const setBenchMode = useCallback(
    (input: { mode: BenchMode; origin: "user" | "agent" }) => {
      if (benchPolicyState.status !== "open" && !(emptyBenchPageVisible && !transientBenchActive))
        return
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
    [benchPolicyState, emptyBenchPageVisible, transientBenchActive, workspace.controller],
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
        setBenchPresentationWorkspaceWidth(intent.rawSize, "bench")
        return
      }
      const widthOwner =
        presentation.dockedBenchVisible ||
        workspaceCollectionForDrawer(presentation.selector) ||
        (presentation.kind === "selector" && presentation.selector === null)
          ? "bench"
          : "drawer"
      const decision = resolveDockedBenchResizeIntent({
        rawWorkspaceWidthPx: intent.rawSize,
        maxWorkspaceWidthPx: dockedWorkspaceMaxWidthPx,
        hasVisibleBenchTarget: presentation.dockedBenchVisible,
        leftSidebarVisible: presentation.leftSidebar.visible,
      })
      if (decision === "clamp") {
        setBenchPresentationWorkspaceWidth(intent.rawSize, widthOwner)
        return
      }

      if (decision === "suppress-left-sidebar") {
        setLeftSidebarOverlayOpen(false)
        setBenchPresentationWorkspaceWidth(intent.rawSize, widthOwner)
        return
      }

      setBenchPresentationWorkspaceWidth(intent.rawSize, widthOwner)
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
      .catch((error) => {
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
      .catch((error) => {
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
  /** Shows a New tab — `emptyTabID`, else the last one shown — and focuses its search field. */
  const openEmptyBenchTab = useCallback(
    async (emptyTabID?: string) => {
      const result = await workspace.controller.execute(
        Object.assign({ type: "open-empty" as const }, emptyTabID ? { emptyTabID } : undefined),
      )
      if (result.outcome !== "committed") return
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLInputElement>(
            '[data-component="bench-empty-state"] input[type="search"]',
          )
          ?.focus()
      })
    },
    [workspace.controller],
  )
  const handleOpenSearch = useCallback(() => openEmptyBenchTab(), [openEmptyBenchTab])
  const handleNewTab = useCallback(
    () => openEmptyBenchTab(createEmptyBenchTabID()),
    [openEmptyBenchTab],
  )
  useShortcutCommand("search.open", handleOpenSearch)
  useShortcutCommand("file.quickOpen", () => {
    const picker = document.querySelector<HTMLInputElement>(
      '[data-component="bench-quick-open"] input',
    )
    if (picker) {
      picker.focus()
      return
    }
    if (
      document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      )
    )
      return
    // A New tab on screen already is this search, so the key moves into its field.
    if (shownEmptyTabID && !transientBenchActive) {
      void openEmptyBenchTab(shownEmptyTabID)
      return
    }
    setQuickOpen(true)
  })
  // Same as the titlebar button: a transient Bench closes instead of toggling the Bench behind it.
  const handleBenchToggle = useCallback(() => {
    if (transientBenchSurface) {
      closeActiveTransientBenchSurface(transientBenchSurface)
      return
    }
    handleRightWorkspaceToggle()
  }, [closeActiveTransientBenchSurface, handleRightWorkspaceToggle, transientBenchSurface])
  useShortcutCommand("bench.toggle", handleBenchToggle)
  // Same as the titlebar button: with a docked Bench or a collection, the toggle decides between
  // pinning and overlay. A floating Bench hides the sidebar and shows no toggle, so the key does
  // nothing there either.
  const handleSidebarShortcut = useCallback(() => {
    if (presentation.mode === BENCH_CHAT_LAYOUT_FLOATING) return
    if (presentation.leftSidebar.managedByWorkspace) {
      handleLeftSidebarToggle()
      return
    }
    chatState.setLeftSidebarOpen(!dockedLeftSidebarVisible)
  }, [
    chatState,
    dockedLeftSidebarVisible,
    handleLeftSidebarToggle,
    presentation.leftSidebar.managedByWorkspace,
    presentation.mode,
  ])
  useShortcutCommand("sidebar.toggle", handleSidebarShortcut, {
    ignoreWithin: BENCH_EDITOR_SELECTOR,
  })
  const handleFocusComposer = useCallback(() => {
    requestPromptComposerFocus(currentDirectory)
  }, [currentDirectory])
  const browserAddressShortcutActive =
    presentation.benchVisible &&
    !transientBenchActive &&
    presentation.benchTarget?.type === "browser"
  useShortcutCommand("composer.focus", handleFocusComposer, {
    enabled: !browserAddressShortcutActive,
  })
  // The Bench's own "New tab" request, so an immersive Bench stays immersive.
  const runtimePlatform = usePlatform()
  const browserAvailable = runtimePlatform.inAppBrowser !== undefined
  const platformKind = runtimePlatform.platform
  const openBenchTab = useRightWorkspaceOpen({ mode: BENCH_MODE_REQUEST_POLICY })
  const handleNewBrowserTab = useCallback(() => {
    void waitForInAppBrowserSettingsHydration().then((hydrated) => {
      if (!hydrated) return
      return openBenchTab({
        type: "object",
        directory: currentDirectory,
        target: createInAppBrowserBenchTarget(
          IN_APP_BROWSER_BLANK_URL,
          useInAppBrowserSettingsStore.getState().defaultProfileID,
        ),
      })
    })
  }, [currentDirectory, openBenchTab])
  useInAppBrowserLinkRouting(currentDirectory)
  useWarmNotebookFileIndex(currentDirectory)
  // Mod+T opens the same empty Bench tab as the tab strip's "+" button. Without the in-app
  // browser (the web build), it is left to the browser itself.
  useShortcutCommand("browser.newTab", handleNewTab, { enabled: browserAvailable })

  // A chat is always open here, so a new board needs no chat of its own: it is
  // created in this one and opened on its Bench, expanding the workspace if the
  // Bench was collapsed.
  const openWorkspaceTarget = useRightWorkspaceOpen({
    mode: presentation.benchVisible ? BENCH_CHAT_LAYOUT_DOCKED : presentation.mode,
  })
  const { createBoard } = useCreateBoard({
    directory: currentDirectory,
    open: openWorkspaceTarget,
  })
  const handleNewBoard = useCallback(async () => {
    await createBoard()
  }, [createBoard])
  const creatingNoteRef = useRef(false)
  const handleNewNote = useCallback(async () => {
    if (creatingNoteRef.current) return
    creatingNoteRef.current = true
    await createNoteAndUpdateCache(currentDirectory)
      .then(async (note) => {
        await openWorkspaceTarget({
          type: "object",
          directory: currentDirectory,
          target: createNotesBenchTarget(note),
        })
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Note could not be created.")
      })
      .finally(() => {
        creatingNoteRef.current = false
      })
  }, [currentDirectory, openWorkspaceTarget])
  const handleOpenChatNote = useCallback(() => {
    if (!currentChatNote) return
    void openWorkspaceTarget({
      type: "object",
      directory: currentDirectory,
      target: createNotesBenchTarget(currentChatNote),
    })
  }, [currentChatNote, currentDirectory, openWorkspaceTarget])

  const selectWorkspaceSession = useCallback(
    async (nextSessionID: string): Promise<boolean> => {
      const subagentOpened = await openOwnedSubagentBench({
        directory: currentDirectory,
        sessionID: nextSessionID,
        sessions: chatState.sessions,
        activeDirectory: currentDirectory,
        activeSessionID,
        selectSession: controller.leftSidebarProps.onSelectSession,
        openSubagentBench,
      })
      if (subagentOpened !== undefined) return subagentOpened
      return controller.leftSidebarProps.onSelectSession(currentDirectory, nextSessionID)
    },
    [
      activeSessionID,
      chatState.sessions,
      controller.leftSidebarProps,
      currentDirectory,
      openSubagentBench,
    ],
  )
  const handleSelectSession = useCallback(
    async (nextSessionID: string): Promise<void> => {
      await selectWorkspaceSession(nextSessionID)
    },
    [selectWorkspaceSession],
  )
  const handleOpenSubagentSession = useCallback(
    (nextSessionID: string) => {
      void selectWorkspaceSession(nextSessionID)
    },
    [selectWorkspaceSession],
  )
  const handleSidebarSelectSession = useCallback(
    async (directory: string, nextSessionID?: string): Promise<boolean> => {
      if (nextSessionID) {
        const sessions = controller.leftSidebarProps.sessionsByDirectory[directory] ?? []
        const subagentOpened = await openOwnedSubagentBench({
          directory,
          sessionID: nextSessionID,
          sessions,
          activeDirectory: currentDirectory,
          activeSessionID,
          selectSession: controller.leftSidebarProps.onSelectSession,
          openSubagentBench,
        })
        if (subagentOpened !== undefined) return subagentOpened
      }
      return controller.leftSidebarProps.onSelectSession(directory, nextSessionID)
    },
    [activeSessionID, controller.leftSidebarProps, currentDirectory, openSubagentBench],
  )

  const handleFloatChat = useCallback(() => {
    setBenchChatLayoutMode(BENCH_CHAT_LAYOUT_FLOATING)
  }, [setBenchChatLayoutMode])

  const stageWorkspacePrompt = useCallback(
    (prompt: string) => {
      const promptKey = controller.mainPaneProps.chatState.promptKey
      const currentDraft = readPromptComposerLiveDraft(promptKey)
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
  const closeEmptyBenchTab = useCallback(
    (emptyTabID: string) => {
      const closingIndex = emptyTabIDs.indexOf(emptyTabID)
      workspace.store.getState().removeEmptyTab(emptyTabID)
      useBenchEmptyTabDrafts.getState().removeDraft(emptyTabID)
      // Behind another tab or a collection drawer, closing it only removes it from the strip.
      if (emptyTabID !== shownEmptyTabID) return
      // Like any tab: the one to its right takes over, else the one to its left.
      const remaining = emptyTabIDs.filter((id) => id !== emptyTabID)
      const neighbour = remaining[closingIndex] ?? remaining[closingIndex - 1]
      if (neighbour) {
        void openEmptyBenchTab(neighbour)
        return
      }
      const previousTab = activeTabs.at(-1)
      if (previousTab) {
        void workspace.controller.execute({ type: "focus-tab", tabKey: previousTab.key })
        return
      }
      void workspace.controller.execute({ type: "collapse" })
    },
    [
      activeTabs,
      emptyTabIDs,
      openEmptyBenchTab,
      shownEmptyTabID,
      workspace.controller,
      workspace.store,
    ],
  )

  const activeBenchTargetKey = workspace.projection.bench.targetKey ?? CLOSED_BENCH_TARGET_KEY
  const activeBenchTarget = benchRuntimeState?.target ?? null
  // A transient preview covers the Bench but must not replace its selected target. The host parks
  // that selection separately so route-commit retention and mounted surface identity survive.
  const persistentBenchVisible = presentation.benchVisible && !transientBenchActive
  const closeActiveBenchTab = useCallback(() => {
    // A transient preview covers the tabs, so Mod+W closes the preview rather than the window.
    if (transientBenchSurface) closeActiveTransientBenchSurface(transientBenchSurface)
    else if (activeTabKey !== null) closeBenchTab(activeTabKey)
    else if (shownEmptyTabID) closeEmptyBenchTab(shownEmptyTabID)
  }, [
    activeTabKey,
    closeActiveTransientBenchSurface,
    closeBenchTab,
    closeEmptyBenchTab,
    shownEmptyTabID,
    transientBenchSurface,
  ])
  // The web build leaves Mod+W to the browser, which closes its own tab. With nothing here to
  // close, the root layout's handler closes the window on macOS.
  const closeTabShortcutEnabled =
    (persistentBenchVisible || emptyBenchPageVisible || transientBenchActive) &&
    platformKind === "desktop"
  useShortcutCommand("bench.closeTab", closeActiveBenchTab, { enabled: closeTabShortcutEnabled })
  useClaimCloseTabShortcut(closeTabShortcutEnabled)
  // Positions follow the strip: item tabs, then New tabs. A collapsed Bench opens on the tab; a
  // transient Bench hides the strip, so the keys wait until it closes.
  const openBenchTabAt = useCallback(
    (position: number) => {
      const tab = activeTabs[position]
      if (tab) {
        activateBenchTab(tab.key)
        return
      }
      const emptyTabID = emptyTabIDs[position - activeTabs.length]
      if (emptyTabID) void openEmptyBenchTab(emptyTabID)
    },
    [activateBenchTab, activeTabs, emptyTabIDs, openEmptyBenchTab],
  )
  useBenchTabShortcuts(openBenchTabAt, {
    count: activeTabs.length + emptyTabIDs.length,
    enabled: !transientBenchActive,
  })
  const renderBenchSurface = useCallback(
    (target: BenchTabTarget) => (
      <BenchSurfaceRenderer
        directory={currentDirectory}
        target={target}
        onOpenSession={handleOpenSubagentSession}
      />
    ),
    [currentDirectory, handleOpenSubagentSession],
  )
  const renderBenchContext = useCallback(
    (input: {
      active: boolean
      state: DirectoryWorkspaceBenchRuntimeState
      children: ReactNode
    }) => {
      const target = input.state.target
      if (!isBenchContentTarget(target)) {
        return (
          <>
            {input.active ? (
              <BenchClosedContextPublisher activeSessionID={activeSessionID} />
            ) : null}
            {input.children}
          </>
        )
      }

      const contentState: BenchRuntimeState = { ...input.state, target }
      return (
        <BenchRouteContextProvider
          state={contentState}
          active={input.active}
          visible={persistentBenchVisible}
          activeSessionID={activeSessionID}
          fallbackProvider={fallbackContextProvider}
          setMode={setBenchMode}
          setFloatingChatState={setFloatingChatSubstate}
        >
          {input.children}
        </BenchRouteContextProvider>
      )
    },
    [
      activeSessionID,
      fallbackContextProvider,
      persistentBenchVisible,
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
        covered={
          transientBenchActive ||
          (workspaceCollectionForDrawer(workspaceDrawer) !== null &&
            workspaceCollectionForDrawer(workspaceDrawer) !==
              workspaceCollectionForTarget(activeBenchTarget))
        }
        coveredContextSuspended={transientBenchActive}
        retainedTargetKeys={retainedBenchTargetKeys}
        benchVisible={persistentBenchVisible}
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
  // The shell's immersive titlebar holds the tabs on the empty page and on every item alike, so
  // switching between them keeps one tab row mounted.
  const titlebarContentTarget =
    effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING && !transientBenchActive
      ? shellTitlebarContentTarget
      : null
  const showImmersiveTabsInDesktopTitlebar = titlebarContentTarget !== null
  // Only the docked Bench can expand — in floating mode this same strip is the
  // immersive chrome, so the control would offer the state it is already in.
  const enterImmersiveFromTabs =
    (presentation.controls.showFloatChat || emptyBenchPageVisible) &&
    effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_DOCKED
      ? handleFloatChat
      : undefined
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
      onNewTab={() => void handleNewTab()}
      emptyTabIDs={emptyTabIDs}
      activeEmptyTabID={selectedEmptyTabID}
      onActivateEmptyTab={(emptyTabID) => void openEmptyBenchTab(emptyTabID)}
      onCloseEmptyTab={closeEmptyBenchTab}
      onEnterImmersive={enterImmersiveFromTabs}
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
      <BenchQuickOpen
        directory={currentDirectory}
        sessions={chatState.sessions}
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onOpen={openBenchTab}
        onOpenThread={selectWorkspaceSession}
        onNewBoard={() => void handleNewBoard()}
        onNewNote={() => void handleNewNote()}
        onOpenDrawer={(drawer) => showWorkspaceDrawer(workspace.controller, drawer)}
      />
      {showImmersiveTabsInDesktopTitlebar
        ? createPortal(titlebarBenchTabs, titlebarContentTarget)
        : null}
      <DirectoryChatShell
        leftSidebar={
          <ChatLeftSidebar
            {...controller.leftSidebarProps}
            onSelectSession={handleSidebarSelectSession}
            onNewNote={handleNewNote}
            onNewBoard={handleNewBoard}
            onNewBrowserTab={browserAvailable ? handleNewBrowserTab : undefined}
          />
        }
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
              <TransientBenchSurfaceStack
                active={transientBenchActive}
                hostRef={setTransientBenchHost}
              >
                <DirectoryChatRightWorkspace
                  directory={currentDirectory}
                  sessionID={controller.mainPaneProps.chatState.sessionID}
                  sessions={controller.mainPaneProps.chatState.sessions}
                  workspaceWidth={dockedWorkspaceDisplayWidthPx}
                  suppressDrawerMotion={suppressLayoutMotion}
                  onCreateCreation={handleCreateCreation}
                  onNewBoard={handleNewBoard}
                  onNewNote={handleNewNote}
                  onOpenThread={selectWorkspaceSession}
                  onOpenResource={controller.mainPaneProps.onOpenResource}
                  tabs={activeTabs}
                  activeTabKey={activeTabKey}
                  onActivateTab={activateBenchTab}
                  onCloseTab={closeBenchTab}
                  onCloseOtherTabs={closeOtherBenchTabs}
                  onCloseTabsToRight={closeBenchTabsToRight}
                  onCloseAllTabs={closeAllBenchTabs}
                  onNewTab={() => void handleNewTab()}
                  emptyTabIDs={emptyTabIDs}
                  activeEmptyTabID={shownEmptyTabID}
                  selectedEmptyTabID={selectedEmptyTabID}
                  onActivateEmptyTab={(emptyTabID) => void openEmptyBenchTab(emptyTabID)}
                  onCloseEmptyTab={closeEmptyBenchTab}
                  showTabsInWorkspace={
                    effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING &&
                    titlebarContentTarget === null
                  }
                  tabShortcutHints={!transientBenchActive}
                  bench={benchOutlet}
                  presentation={presentation}
                />
              </TransientBenchSurfaceStack>
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
                    onOpenNote: currentChatNote ? handleOpenChatNote : undefined,
                    onSelectSession: handleSelectSession,
                  }
                : undefined
            }
            conversation={
              <DirectoryChatBenchConversationPane
                {...controller.mainPaneProps}
                onOpenSession={handleOpenSubagentSession}
                compactPromptComposer={effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING}
                showThreadBrowser={false}
                onNewSession={handleNewSession}
                onSelectSession={handleSelectSession}
              />
            }
          />
        }
        {...controller.shellProps}
        immersive={effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING}
        showImmersiveDockButton={workspaceLayoutMode === BENCH_CHAT_LAYOUT_FLOATING}
        immersiveTitlebarContentRef={setShellTitlebarContentTarget}
        leftSidebarOpen={shellLeftSidebarOpen}
        leftSidebarOverlayEnabled={presentation.leftSidebar.overlayEnabled}
        leftSidebarOverlayOpen={leftSidebarOverlayOpen}
        onLeftSidebarOverlayOpenChange={setLeftSidebarOverlayOpen}
        onLeftSidebarToggle={
          presentation.leftSidebar.managedByWorkspace ? handleLeftSidebarToggle : undefined
        }
        onRightWorkspaceToggle={handleBenchToggle}
        chatTitle={controller.mainPaneProps.chatState.sessionTitle}
        titlebarVariant="chat"
        rightWorkspaceOpen={effectiveWorkspaceHostOpen}
        rightWorkspaceDisplayWidth={dockedWorkspaceDisplayWidthPx}
        rightWorkspaceTitlebar={
          effectiveWorkspaceLayoutMode === BENCH_CHAT_LAYOUT_DOCKED &&
          effectiveWorkspaceHostOpen ? (
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
        onOpenNote={currentChatNote ? handleOpenChatNote : undefined}
        onSelectSession={handleSelectSession}
      />
    </TransientBenchSurfaceProvider>
  )
}
