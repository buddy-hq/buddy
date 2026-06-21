import { useEffect, useMemo, useRef, type ReactNode } from "react"
import {
  ResizeHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizablePanelRef,
  type ResizeHandleIntent,
} from "@buddy/ui"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { usePersistentResizablePanelLayout } from "@/components/layout/use-persistent-resizable-panel-layout"
import { RIGHT_SIDEBAR_COLLAPSE_THRESHOLD_PX } from "@/lib/directory-chat/right-sidebar-layout"
import { logBenchToggleStep } from "@/lib/bench-toggle-diagnostics"

const DIRECTORY_CHAT_LAYOUT_ID = "directory-chat-layout"
const DIRECTORY_CHAT_MAIN_PANEL_ID = "directory-chat-main-pane"
const DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID = "directory-chat-right-sidebar"
const BENCH_RIGHT_WORKSPACE_PANEL_COMPONENT = "bench-right-workspace-panel"
const CHAT_TITLEBAR_HEIGHT_PX = 52
const DIRECTORY_CHAT_MAIN_PANE_MIN_WIDTH_PX = 320

type DirectoryChatShellProps = {
  leftSidebar: ReactNode
  mainPane: ReactNode
  rightSidebar: ReactNode
  contentLayout?: ReactNode
  immersive?: boolean
  chatTitle?: string
  projectName?: string
  isTurnActive?: boolean
  titlebarVariant?: "chat" | "shell"
  mainPaneMinWidth?: number
  leftSidebarOpen: boolean
  leftSidebarDisplayWidth: number
  leftSidebarWidth: number
  leftSidebarMinWidth: number
  leftSidebarMaxWidth: number
  onLeftSidebarResize: (width: number) => void
  onLeftSidebarCollapse: () => void
  leftSidebarOverlayEnabled?: boolean
  leftSidebarOverlayOpen?: boolean
  onLeftSidebarOverlayOpenChange?: (open: boolean) => void
  onLeftSidebarToggle?: () => void
  rightSidebarOpen: boolean
  rightSidebarDisplayWidth: number
  rightSidebarMinWidth: number
  rightSidebarMaxWidth: number
  onRightSidebarResize: (width: number) => void
  onRightSidebarResizeIntent?: (intent: ResizeHandleIntent) => void
  onRightWorkspaceToggle: () => void
  onRightSidebarCollapse: () => void
}

export function DirectoryChatShell(props: DirectoryChatShellProps) {
  const {
    leftSidebar,
    mainPane,
    rightSidebar,
    contentLayout,
    immersive = false,
    chatTitle,
    projectName,
    isTurnActive,
    titlebarVariant,
    mainPaneMinWidth = DIRECTORY_CHAT_MAIN_PANE_MIN_WIDTH_PX,
    leftSidebarOpen,
    leftSidebarDisplayWidth,
    leftSidebarWidth,
    leftSidebarMinWidth,
    leftSidebarMaxWidth,
    onLeftSidebarResize,
    onLeftSidebarCollapse,
    leftSidebarOverlayEnabled = false,
    leftSidebarOverlayOpen = false,
    onLeftSidebarOverlayOpenChange,
    onLeftSidebarToggle,
    rightSidebarOpen,
    rightSidebarDisplayWidth,
    rightSidebarMinWidth,
    rightSidebarMaxWidth,
    onRightSidebarResize,
    onRightSidebarResizeIntent,
    onRightWorkspaceToggle,
    onRightSidebarCollapse,
  } = props

  const rightSidebarPanelRef = useResizablePanelRef()
  const leftSidebarOverlayRef = useRef<HTMLDivElement>(null)

  const leftSidebarResolvedWidth = !immersive && leftSidebarOpen ? leftSidebarDisplayWidth : 0
  const titlebarHeight = immersive ? 0 : CHAT_TITLEBAR_HEIGHT_PX
  const hasContentLayout = contentLayout !== undefined

  const layoutPanelIds = useMemo(() => {
    return [DIRECTORY_CHAT_MAIN_PANEL_ID, DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID]
  }, [])
  const { defaultLayout, onLayoutChanged } = usePersistentResizablePanelLayout({
    id: DIRECTORY_CHAT_LAYOUT_ID,
    panelIds: layoutPanelIds,
  })

  useEffect(() => {
    const nextSize = rightSidebarOpen ? rightSidebarDisplayWidth : 0
    logBenchToggleStep("directory-chat-shell-resize-effect-before", {
      rightSidebarOpen,
      rightSidebarDisplayWidth,
      nextSize,
      hasPanelRef: rightSidebarPanelRef.current !== null,
    })
    rightSidebarPanelRef.current?.resize(nextSize)
    logBenchToggleStep("directory-chat-shell-resize-effect-after", {
      rightSidebarOpen,
      rightSidebarDisplayWidth,
      nextSize,
      hasPanelRef: rightSidebarPanelRef.current !== null,
    })
  }, [rightSidebarDisplayWidth, rightSidebarOpen, rightSidebarPanelRef])

  useEffect(() => {
    logBenchToggleStep("directory-chat-shell-state", {
      leftSidebarOpen,
      leftSidebarDisplayWidth,
      leftSidebarResolvedWidth,
      rightSidebarOpen,
      rightSidebarDisplayWidth,
      rightSidebarMinWidth,
      rightSidebarMaxWidth,
      titlebarVariant,
      mainPaneMinWidth,
      immersive,
      hasContentLayout,
    })
  }, [
    leftSidebarDisplayWidth,
    leftSidebarOpen,
    leftSidebarResolvedWidth,
    hasContentLayout,
    immersive,
    mainPaneMinWidth,
    rightSidebarDisplayWidth,
    rightSidebarMaxWidth,
    rightSidebarMinWidth,
    rightSidebarOpen,
    titlebarVariant,
  ])

  useEffect(() => {
    if (!leftSidebarOverlayOpen) return

    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return
      if (leftSidebarOverlayRef.current?.contains(event.target)) return
      onLeftSidebarOverlayOpenChange?.(false)
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      onLeftSidebarOverlayOpenChange?.(false)
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [leftSidebarOverlayOpen, onLeftSidebarOverlayOpenChange])

  function closeLeftSidebarOverlayAfterSelection(target: EventTarget | null) {
    if (!(target instanceof Element)) return
    if (
      !target.closest(
        [
          '[data-action="left-sidebar-thread-select"]',
          '[data-action="left-sidebar-directory-new-thread"]',
          '[data-action="left-sidebar-directory-empty-new-thread"]',
        ].join(","),
      )
    ) {
      return
    }

    onLeftSidebarOverlayOpenChange?.(false)
  }

  function handleRightWorkspaceToggle() {
    logBenchToggleStep("directory-chat-shell-right-toggle-callback-entry", {
      rightSidebarOpen,
      rightSidebarDisplayWidth,
      rightSidebarMinWidth,
      rightSidebarMaxWidth,
    })
    onRightWorkspaceToggle()
    logBenchToggleStep("directory-chat-shell-right-toggle-callback-returned", {
      rightSidebarOpen,
      rightSidebarDisplayWidth,
    })
  }

  function handleRightSidebarCollapse() {
    logBenchToggleStep("directory-chat-shell-right-collapse-callback-entry", {
      rightSidebarOpen,
      rightSidebarDisplayWidth,
    })
    onRightSidebarCollapse()
    logBenchToggleStep("directory-chat-shell-right-collapse-callback-returned", {
      rightSidebarOpen,
      rightSidebarDisplayWidth,
    })
  }

  return (
    <div
      data-component="directory-chat-shell"
      data-right-workspace-open={rightSidebarOpen ? "true" : "false"}
      className="relative grid h-full w-full overflow-hidden bg-surface-raised-base transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none"
      style={{
        gridTemplateColumns: `${leftSidebarResolvedWidth}px minmax(0, 1fr)`,
        gridTemplateRows: `${titlebarHeight}px minmax(0, 1fr)`,
      }}
    >
      {/* Row 1, Col 1: Sidebar header area — provides background continuity with the sidebar below.
          The no-drag placeholder covers the toggle button area (x=0..130) so Electron's
          webkit-app-region exclusion prevents Col 1's drag region from intercepting toggle clicks
          when the sidebar is open. The actual button lives inside DesktopTitlebar's header. */}
      <div
        hidden={immersive}
        aria-hidden={immersive}
        className={`relative col-start-1 row-start-1 select-none [-webkit-app-region:drag] ${leftSidebarOpen ? "border-r border-border-weaker-base" : ""}`}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 130,
            height: CHAT_TITLEBAR_HEIGHT_PX,
          }}
          className="[-webkit-app-region:no-drag]"
        />
      </div>

      {/* Row 1, Col 2: Main titlebar */}
      <div
        hidden={immersive}
        aria-hidden={immersive}
        className="col-start-2 row-start-1 min-w-0 overflow-hidden"
      >
        <DesktopTitlebar
          placement="chat"
          chatTitle={chatTitle}
          projectName={projectName}
          isTurnActive={isTurnActive}
          variant={titlebarVariant}
          leftSidebarOpen={leftSidebarOpen}
          rightSidebarOpen={rightSidebarOpen}
          onLeftSidebarToggle={onLeftSidebarToggle}
          onRightSidebarToggle={handleRightWorkspaceToggle}
        />
      </div>

      <div
        hidden={immersive}
        aria-hidden={immersive}
        className="col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden"
      >
        <div
          data-component="directory-chat-left-sidebar-shell"
          data-open={leftSidebarOpen ? "true" : "false"}
          aria-hidden={!leftSidebarOpen}
          className={`relative flex h-full min-h-0 overflow-hidden ${
            leftSidebarOpen ? "" : "pointer-events-none"
          }`}
        >
          <div className="h-full w-full min-w-0">
            {leftSidebarOverlayOpen && !leftSidebarOpen ? null : leftSidebar}
          </div>
          {leftSidebarOpen ? (
            <ResizeHandle
              direction="horizontal"
              size={leftSidebarWidth}
              min={leftSidebarMinWidth}
              max={leftSidebarMaxWidth}
              collapseThreshold={leftSidebarMinWidth}
              onResize={onLeftSidebarResize}
              onCollapse={onLeftSidebarCollapse}
            />
          ) : null}
        </div>
      </div>

      <div className="col-start-2 row-start-2 min-h-0 min-w-0 overflow-hidden">
        {contentLayout !== undefined ? (
          <div data-component="directory-chat-shell-content-layout" className="h-full min-h-0 w-full">
            {contentLayout}
          </div>
        ) : (
          <ResizablePanelGroup
          id={DIRECTORY_CHAT_LAYOUT_ID}
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="h-full min-w-0 flex-1 [&>[data-panel]]:transition-[flex-grow] [&>[data-panel]]:duration-200 [&>[data-panel]]:[transition-timing-function:cubic-bezier(0.77,0,0.175,1)] motion-reduce:[&>[data-panel]]:transition-none"
        >
          <ResizablePanel
            id={DIRECTORY_CHAT_MAIN_PANEL_ID}
            minSize={mainPaneMinWidth}
            className="flex min-h-0 min-w-0 overflow-hidden"
          >
            {mainPane}
          </ResizablePanel>

          <ResizablePanel
            id={DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID}
            data-component={BENCH_RIGHT_WORKSPACE_PANEL_COMPONENT}
            panelRef={rightSidebarPanelRef}
            defaultSize={rightSidebarOpen ? rightSidebarDisplayWidth : 0}
            minSize={rightSidebarOpen ? rightSidebarMinWidth : 0}
            maxSize={rightSidebarOpen ? rightSidebarMaxWidth : 0}
            className="relative flex min-h-0 min-w-0 overflow-hidden"
          >
            <div
              data-component="directory-chat-right-sidebar-shell"
              data-open={rightSidebarOpen ? "true" : "false"}
              aria-hidden={!rightSidebarOpen}
              className={`h-full w-full ${rightSidebarOpen ? "" : "pointer-events-none"}`}
            >
              {rightSidebar}
            </div>
            {rightSidebarOpen ? (
              <ResizeHandle
                direction="horizontal"
                edge="start"
                size={rightSidebarDisplayWidth}
                min={rightSidebarMinWidth}
                max={rightSidebarMaxWidth}
                collapseThreshold={RIGHT_SIDEBAR_COLLAPSE_THRESHOLD_PX}
                onResize={(width) => {
                  rightSidebarPanelRef.current?.resize(width)
                  onRightSidebarResize(width)
                }}
                onResizeIntent={onRightSidebarResizeIntent}
                onCollapse={handleRightSidebarCollapse}
              />
            ) : null}
          </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
      {!immersive && leftSidebarOverlayEnabled && !leftSidebarOpen ? (
        <div
          data-component="directory-chat-left-sidebar-edge-trigger"
          className="absolute bottom-0 left-0 z-30 w-2 [-webkit-app-region:no-drag]"
          style={{ top: CHAT_TITLEBAR_HEIGHT_PX }}
          onMouseEnter={() => onLeftSidebarOverlayOpenChange?.(true)}
          onPointerDown={() => onLeftSidebarOverlayOpenChange?.(true)}
        />
      ) : null}
      {!immersive && leftSidebarOverlayOpen && !leftSidebarOpen ? (
        <div
          ref={leftSidebarOverlayRef}
          data-component="directory-chat-left-sidebar-overlay"
          className="absolute bottom-0 left-0 z-40 overflow-hidden border-r border-border-weaker-base bg-background-base shadow-xl animate-in fade-in slide-in-from-left-2 duration-150"
          style={{
            top: CHAT_TITLEBAR_HEIGHT_PX,
            width: leftSidebarDisplayWidth,
          }}
          onMouseLeave={() => onLeftSidebarOverlayOpenChange?.(false)}
          onClick={(event) => closeLeftSidebarOverlayAfterSelection(event.target)}
        >
          <div className="h-full min-h-0 w-full min-w-0">{leftSidebar}</div>
        </div>
      ) : null}
    </div>
  )
}
