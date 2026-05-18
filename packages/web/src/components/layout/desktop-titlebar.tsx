import type { MouseEvent } from "react"
import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useRouterState } from "@tanstack/react-router"
import { Badge, FolderOpenIcon, Button, MoveLeftIcon } from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useUiPreferences } from "@/state/ui-preferences"
import { isTitlebarInteractiveTarget } from "./desktop-titlebar-helpers"
import {
  LayoutLeftIcon,
  LayoutLeftPartialIcon,
  LayoutRightIcon,
  LayoutRightPartialIcon,
} from "./sidebar-icons"
import type { ChatRightSidebarTab } from "./chat-right-sidebar"
import {
  getRightSidebarDefaultWidth,
  getRightSidebarMinWidth,
} from "@/lib/directory-chat/right-sidebar-layout"

type DesktopTitlebarProps = {
  placement?: "root" | "chat"
  chatTitle?: string
  projectName?: string
  variant?: "chat" | "shell"
  leftSidebarOpen?: boolean
}

const ROOT_TITLEBAR_HEIGHT_CLASS = "h-10"
const CHAT_TITLEBAR_HEIGHT_CLASS = "h-[52px]"
const CHAT_TITLEBAR_HEIGHT_PX = 52
const MAC_WINDOW_CONTROL_INSET_CLASS = "w-[90px]"
const MAC_WINDOW_CONTROL_INSET_WIDTH = 90
// When sidebar is closed, reserve space for the fixed toggle (w-8 = 32px) + 8px gap
const CHAT_SIDEBAR_TOGGLE_RESERVED_PX = 40
// Fixed toggle left positions
const CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX = MAC_WINDOW_CONTROL_INSET_WIDTH
const CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX = 8
const CHAT_SIDEBAR_TOGGLE_HEIGHT_PX = 24 // h-6

export function DesktopTitlebar(props: DesktopTitlebarProps) {
  const placement = props.placement ?? "root"
  const titlebarHeightClass =
    placement === "chat" ? CHAT_TITLEBAR_HEIGHT_CLASS : ROOT_TITLEBAR_HEIGHT_CLASS
  const navigate = useNavigate()
  const location = useLocation()
  const platform = usePlatform()
  const isDesktop = platform.platform === "desktop"
  const isMac = isDesktop && platform.os === "macos"
  const isWindows = isDesktop && platform.os === "windows"
  const pathname = location.pathname
  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarWidth = useUiPreferences((state) => state.rightSidebarWidth)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const setRightSidebarTab = useUiPreferences((state) => state.setRightSidebarTab)
  const setRightSidebarWidth = useUiPreferences((state) => state.setRightSidebarWidth)
  const routerState = useRouterState()
  const isReadingPage = routerState.matches.some((m) => m.routeId === "/$directory/read")
  const directoryToken = routerState.matches.find((m) => m.routeId === "/$directory/read")?.params
    .directory as string | undefined
  const [isFullscreen, setIsFullscreen] = useState(false)
  const lastWorkspaceSidebarTabRef = useRef<Exclude<ChatRightSidebarTab, "files">>("resources")

  useEffect(() => {
    if (!isMac) return
    void platform.getIsFullscreen?.().then((v) => { if (typeof v === "boolean") setIsFullscreen(v) })
    const handler = (e: Event) => {
      if (e instanceof CustomEvent && typeof e.detail?.isFullscreen === "boolean") {
        setIsFullscreen(e.detail.isFullscreen as boolean)
      }
    }
    window.addEventListener("buddy:fullscreen-changed", handler)
    return () => window.removeEventListener("buddy:fullscreen-changed", handler)
  }, [isMac, platform])

  useEffect(() => {
    if (rightSidebarTab === "files") return
    lastWorkspaceSidebarTabRef.current = rightSidebarTab
  }, [rightSidebarTab])

  if (!isMac && !isWindows) {
    return null
  }

  const resolvedLeftSidebarOpen = props.leftSidebarOpen ?? leftSidebarOpen
  const showSidebarToggles =
    placement === "chat" || (pathname !== "/chat" && pathname.endsWith("/chat"))
  // In chat placement the toggle is a fixed element inside the header — not in the flow
  const showLeftSidebarToggle = placement === "chat" ? false : showSidebarToggles
  const shouldReserveMacWindowControls = placement === "chat" ? false : isMac && !isFullscreen
  // Animated spacer clears the fixed toggle from the title in ALL desktop variants:
  //   Mac non-fullscreen closed: 90px (traffic lights) + 40px (toggle + gap) = 130px
  //   Mac fullscreen / Windows closed: 8px (toggle left) + 40px (toggle + gap) = 48px
  //   Sidebar open (Col 2 at x≥280): 0px — toggle is inside the sidebar area
  const chatToggleLeft = isMac && !isFullscreen ? CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX : CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX
  const chatLeftSpacerWidth =
    placement === "chat" && isDesktop
      ? resolvedLeftSidebarOpen
        ? 0
        : chatToggleLeft + CHAT_SIDEBAR_TOGGLE_RESERVED_PX
      : 0

  function onToggleRightSidebar() {
    if (rightSidebarOpen) {
      setRightSidebarOpen(false)
      return
    }

    const nextTab =
      rightSidebarTab === "files" ? lastWorkspaceSidebarTabRef.current : rightSidebarTab
    if (nextTab !== rightSidebarTab) {
      setRightSidebarTab(nextTab)
    }

    const nextMinWidth = getRightSidebarMinWidth(nextTab)
    if (rightSidebarWidth < nextMinWidth) {
      setRightSidebarWidth(
        nextTab === "editor" ? getRightSidebarDefaultWidth("editor") : nextMinWidth,
      )
    }

    setRightSidebarOpen(true)
  }

  function onToggleFilesPanel() {
    if (rightSidebarOpen && rightSidebarTab === "files") {
      setRightSidebarOpen(false)
      setRightSidebarTab(lastWorkspaceSidebarTabRef.current)
      return
    }

    if (rightSidebarTab !== "files") {
      lastWorkspaceSidebarTabRef.current = rightSidebarTab
    }

    if (rightSidebarWidth < getRightSidebarMinWidth("files")) {
      setRightSidebarWidth(getRightSidebarDefaultWidth("files"))
    }

    setRightSidebarTab("files")
    setRightSidebarOpen(true)
  }

  function onMouseDown(event: MouseEvent<HTMLElement>) {
    if (!platform.startWindowDragging) return
    if (event.buttons !== 1) return
    if (isTitlebarInteractiveTarget(event.target)) return

    event.preventDefault()
    void platform.startWindowDragging().catch(() => undefined)
  }

  function onDoubleClick(event: MouseEvent<HTMLElement>) {
    if (!platform.toggleWindowMaximize) return
    if (isTitlebarInteractiveTarget(event.target)) return

    event.preventDefault()
    void platform.toggleWindowMaximize().catch(() => undefined)
  }

  const rightSidebarToggle = showSidebarToggles ? (
    <div className="mr-2 flex shrink-0 items-center gap-1">
      <Button
        type="button"
        data-action="titlebar-toggle-files-panel"
        variant="ghost"
        className={`h-6 w-8 p-0 box-border [-webkit-app-region:no-drag] ${
          rightSidebarOpen && rightSidebarTab === "files"
            ? "bg-surface-base-hover text-text-strong"
            : "text-text-weak hover:bg-surface-base-hover hover:text-text-strong"
        }`}
        aria-label={
          rightSidebarOpen && rightSidebarTab === "files"
            ? language.t("desktopTitlebar.closeFiles")
            : language.t("desktopTitlebar.openFiles")
        }
        aria-expanded={rightSidebarOpen && rightSidebarTab === "files"}
        title={
          rightSidebarOpen && rightSidebarTab === "files"
            ? language.t("desktopTitlebar.closeFiles")
            : language.t("desktopTitlebar.openFiles")
        }
        onClick={onToggleFilesPanel}
      >
        <FolderOpenIcon className="size-4" />
      </Button>
      <Button
        type="button"
        data-action="titlebar-toggle-right-sidebar"
        variant="ghost"
        className="h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong [-webkit-app-region:no-drag]"
        aria-label={
          rightSidebarOpen
            ? language.t("desktopTitlebar.collapseRightPanel")
            : language.t("desktopTitlebar.expandRightPanel")
        }
        aria-expanded={rightSidebarOpen}
        title={
          rightSidebarOpen
            ? language.t("desktopTitlebar.collapseRightPanel")
            : language.t("desktopTitlebar.expandRightPanel")
        }
        onClick={onToggleRightSidebar}
      >
        {rightSidebarOpen ? (
          <LayoutRightPartialIcon className="size-4" />
        ) : (
          <LayoutRightIcon className="size-4" />
        )}
      </Button>
    </div>
  ) : null

  const isShellVariant = props.variant === "shell"
  const borderClass = isShellVariant ? "" : "border-b border-border-weaker-base"
  const leftSidebarToggleButton = (
    <Button
      type="button"
      data-action="titlebar-toggle-left-sidebar"
      variant="ghost"
      className="h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong [-webkit-app-region:no-drag]"
      aria-label={
        resolvedLeftSidebarOpen
          ? language.t("desktopTitlebar.collapseLeftPanel")
          : language.t("desktopTitlebar.expandLeftPanel")
      }
      aria-expanded={resolvedLeftSidebarOpen}
      title={
        resolvedLeftSidebarOpen
          ? language.t("desktopTitlebar.collapseLeftPanel")
          : language.t("desktopTitlebar.expandLeftPanel")
      }
      onClick={() => setLeftSidebarOpen(!resolvedLeftSidebarOpen)}
    >
      {resolvedLeftSidebarOpen ? (
        <LayoutLeftPartialIcon className="size-4" />
      ) : (
        <LayoutLeftIcon className="size-4" />
      )}
    </Button>
  )

  return (
    <header
      data-component="desktop-titlebar"
      data-variant={props.variant ?? "chat"}
      className={`shrink-0 ${borderClass} bg-background-base text-text-base select-none [-webkit-app-region:drag] ${titlebarHeightClass}`}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {/* Chat-placement fixed sidebar toggle — rendered inside this drag header so Electron's
          webkit-app-region exclusion recognises it as a no-drag child of the drag region. */}
      {placement === "chat" && isDesktop ? (
        <div
          style={{
            position: "fixed",
            top: (CHAT_TITLEBAR_HEIGHT_PX - CHAT_SIDEBAR_TOGGLE_HEIGHT_PX) / 2,
            left: isMac && !isFullscreen ? CHAT_SIDEBAR_TOGGLE_LEFT_MAC_PX : CHAT_SIDEBAR_TOGGLE_LEFT_DEFAULT_PX,
            zIndex: 50,
            transition: "left 200ms ease-out",
          }}
          className="motion-reduce:transition-none [-webkit-app-region:no-drag]"
        >
          <Button
            type="button"
            data-action="chat-toggle-left-sidebar"
            variant="ghost"
            className="box-border h-6 w-8 p-0 text-text-weak hover:bg-surface-base-hover hover:text-text-strong [-webkit-app-region:no-drag]"
            aria-label={
              resolvedLeftSidebarOpen
                ? language.t("desktopTitlebar.collapseLeftPanel")
                : language.t("desktopTitlebar.expandLeftPanel")
            }
            aria-expanded={resolvedLeftSidebarOpen}
            title={
              resolvedLeftSidebarOpen
                ? language.t("desktopTitlebar.collapseLeftPanel")
                : language.t("desktopTitlebar.expandLeftPanel")
            }
            onClick={() => setLeftSidebarOpen(!resolvedLeftSidebarOpen)}
          >
            {resolvedLeftSidebarOpen ? (
              <LayoutLeftPartialIcon className="size-4" />
            ) : (
              <LayoutLeftIcon className="size-4" />
            )}
          </Button>
        </div>
      ) : null}
      <div className="flex h-full items-center">
        {shouldReserveMacWindowControls ? (
          <div className={`${MAC_WINDOW_CONTROL_INSET_CLASS} shrink-0`} />
        ) : null}
        {placement === "chat" && isDesktop ? (
          <div
            className="shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: chatLeftSpacerWidth }}
          />
        ) : null}
        {showLeftSidebarToggle ? (
          <div className="ml-2 flex h-6 w-8 shrink-0 items-center">
            {leftSidebarToggleButton}
          </div>
        ) : null}
        {!isShellVariant && (
          placement === "chat" ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
              <h1 className="min-w-0 truncate text-sm font-medium text-text-strong">
                {props.chatTitle}
              </h1>
              {props.projectName ? (
                <Badge variant="outline" className="min-w-0 shrink overflow-hidden">
                  <span className="min-w-0 truncate">{props.projectName}</span>
                </Badge>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              {isReadingPage ? (
                <div className="flex items-center gap-2 px-3 animate-in fade-in slide-in-from-left-2 duration-300 cubic-bezier(0.23, 1, 0.32, 1)">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={language.t("sidebar.resourcesBackToChat")}
                    title={language.t("sidebar.resourcesBackToChat")}
                    className="transition-transform active:scale-90 [-webkit-app-region:no-drag]"
                    onClick={() => {
                      void navigate({
                        to: "/$directory/chat",
                        params: {
                          directory: directoryToken!,
                        },
                      })
                    }}
                  >
                    <MoveLeftIcon className="size-5" />
                  </Button>
                </div>
              ) : null}
            </div>
          )
        )}
        <div className="flex shrink-0 items-center gap-1 mr-2 ml-auto">
          {!isShellVariant && rightSidebarToggle}

          {isWindows ? (
            <>
              <div className="w-[140px] shrink-0" />
              <div
                data-component="titlebar-system-controls-mount"
                data-titlebar-no-drag
                className={`flex shrink-0 flex-row [-webkit-app-region:no-drag] ${titlebarHeightClass}`}
              />
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
