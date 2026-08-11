import { useEffect, useRef, type ReactNode } from "react"
import { ResizeHandle } from "@buddy/ui"
import {
  DesktopTitlebar,
  WINDOWS_CHAT_TITLEBAR_RIGHT_CONTROLS_INSET_PX,
} from "@/components/layout/desktop-titlebar"
import { DESKTOP_TITLEBAR_HEIGHT_PX } from "@/components/layout/desktop-titlebar-inset"
import type { SessionInfo } from "@/state/chat-types"
import { RIGHT_WORKSPACE_RAIL_WIDTH_PX } from "@/lib/directory-chat/right-workspace-layout"
import { usePlatform } from "@/context/platform"

type DirectoryChatShellProps = {
  leftSidebar: ReactNode
  contentLayout: ReactNode
  immersive?: boolean
  showImmersiveTitlebar?: boolean
  chatTitle?: string
  projectName?: string
  isTurnActive?: boolean
  titlebarVariant?: "chat" | "shell"
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
  rightWorkspaceOpen: boolean
  rightWorkspaceTitlebar?: ReactNode
  rightWorkspaceDisplayWidth?: number
  onRightWorkspaceToggle: () => void
  showThreadBrowser?: boolean
  showSidebarThreadControls?: boolean
  sessions?: SessionInfo[]
  activeSessionID?: string
  linkedSessionID?: string
  parentSession?: SessionInfo
  onNewSession?: () => void | Promise<void>
  onSelectSession?: (sessionID: string) => void | Promise<void>
}

export function DirectoryChatShell(props: DirectoryChatShellProps) {
  const platform = usePlatform()
  const {
    leftSidebar,
    contentLayout,
    immersive = false,
    showImmersiveTitlebar = false,
    chatTitle,
    projectName,
    isTurnActive,
    titlebarVariant,
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
    rightWorkspaceOpen,
    rightWorkspaceTitlebar,
    rightWorkspaceDisplayWidth = 0,
    onRightWorkspaceToggle,
    showThreadBrowser,
    showSidebarThreadControls,
    sessions,
    activeSessionID,
    linkedSessionID,
    parentSession,
    onNewSession,
    onSelectSession,
  } = props

  const leftSidebarOverlayRef = useRef<HTMLDivElement>(null)

  const leftSidebarResolvedWidth = !immersive && leftSidebarOpen ? leftSidebarDisplayWidth : 0
  const titlebarVisible = !immersive || showImmersiveTitlebar
  const titlebarHeight = titlebarVisible ? DESKTOP_TITLEBAR_HEIGHT_PX : 0
  const rightWorkspaceTitlebarWidth =
    !immersive && rightWorkspaceOpen && rightWorkspaceTitlebar
      ? rightWorkspaceDisplayWidth
      : 0
  const rightWorkspaceTitlebarInset =
    platform.platform === "desktop" && platform.os === "windows"
      ? WINDOWS_CHAT_TITLEBAR_RIGHT_CONTROLS_INSET_PX
      : RIGHT_WORKSPACE_RAIL_WIDTH_PX

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
    onRightWorkspaceToggle()
  }

  return (
    <div
      data-component="directory-chat-shell"
      data-right-workspace-open={rightWorkspaceOpen ? "true" : "false"}
      data-layout-motion="instant"
      className="relative grid h-full w-full overflow-hidden bg-surface-raised-base transition-none"
      style={{
        gridTemplateColumns: `${leftSidebarResolvedWidth}px minmax(0, 1fr) ${rightWorkspaceTitlebarWidth}px`,
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
            height: DESKTOP_TITLEBAR_HEIGHT_PX,
          }}
          className="[-webkit-app-region:no-drag]"
        />
      </div>

      {/* Row 1, Col 2: Main titlebar.
          No `overflow-hidden` here — it would clip the titlebar's downward shadow. Horizontal
          overflow is already bounded by `min-w-0` plus the truncation inside DesktopTitlebar. */}
      <div
        hidden={!titlebarVisible}
        aria-hidden={!titlebarVisible}
        className="col-start-2 row-start-1 min-w-0"
      >
        {immersive ? (
          <DesktopTitlebar placement="root" showSidebarToggles={false} />
        ) : (
          <DesktopTitlebar
            placement="chat"
            chatTitle={chatTitle}
            projectName={projectName}
            isTurnActive={isTurnActive}
            variant={titlebarVariant}
            leftSidebarOpen={leftSidebarOpen}
            rightWorkspaceOpen={rightWorkspaceOpen}
            onLeftSidebarToggle={onLeftSidebarToggle}
            onRightWorkspaceToggle={handleRightWorkspaceToggle}
            showThreadBrowser={showThreadBrowser}
            showSidebarThreadControls={showSidebarThreadControls}
            sessions={sessions}
            activeSessionID={activeSessionID}
            linkedSessionID={linkedSessionID}
            parentSession={parentSession}
            onNewSession={onNewSession}
            onSelectSession={onSelectSession}
          />
        )}
      </div>

      <div
        hidden={immersive || rightWorkspaceTitlebarWidth === 0}
        aria-hidden={immersive || rightWorkspaceTitlebarWidth === 0}
        data-component="directory-chat-right-workspace-titlebar"
        className="col-start-3 row-start-1 min-w-0 overflow-hidden border-b border-l border-border-weaker-base bg-background-base"
        style={{ paddingRight: rightWorkspaceTitlebarInset }}
      >
        {rightWorkspaceTitlebar}
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

      <div className="col-start-2 col-span-2 row-start-2 min-h-0 min-w-0 overflow-hidden">
        <div data-component="directory-chat-shell-content-layout" className="h-full min-h-0 w-full">
          {contentLayout}
        </div>
      </div>
      {!immersive && leftSidebarOverlayEnabled && !leftSidebarOpen ? (
        <div
          data-component="directory-chat-left-sidebar-edge-trigger"
          className="absolute bottom-0 left-0 z-30 w-2 [-webkit-app-region:no-drag]"
          style={{ top: DESKTOP_TITLEBAR_HEIGHT_PX }}
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
            top: DESKTOP_TITLEBAR_HEIGHT_PX,
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
