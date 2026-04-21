import type { MouseEvent } from "react"
import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useRouterState } from "@tanstack/react-router"
import { FolderOpenIcon, Button, MoveLeftIcon } from "@buddy/ui"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useUiPreferences } from "@/state/ui-preferences"
import {
  isTitlebarInteractiveTarget,
  isTitlebarSystemControlTarget,
} from "./desktop-titlebar-helpers"
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

export function DesktopTitlebar() {
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
    const media = window.matchMedia("(display-mode: fullscreen)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsFullscreen(e.matches)
    handler(media)
    media.addEventListener("change", handler)
    return () => media.removeEventListener("change", handler)
  }, [isMac])

  useEffect(() => {
    if (rightSidebarTab === "files") return
    lastWorkspaceSidebarTabRef.current = rightSidebarTab
  }, [rightSidebarTab])

  if (!isMac && !isWindows) {
    return null
  }

  const showSidebarToggles = pathname !== "/chat" && pathname.endsWith("/chat")

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
    if (isTitlebarSystemControlTarget(event.target)) return

    event.preventDefault()
    void platform.toggleWindowMaximize().catch(() => undefined)
  }

  const rightSidebarToggle = showSidebarToggles ? (
    <div className="mr-2 flex shrink-0 items-center gap-1">
      <Button
        type="button"
        data-action="titlebar-toggle-files-panel"
        variant="ghost"
        className={`h-6 w-8 p-0 box-border ${
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
        className="h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong"
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

  return (
    <header
      data-component="desktop-titlebar"
      className="h-10 shrink-0 border-b border-border-weaker-base bg-background-base text-text-base"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex h-full items-center">
        {isMac && !isFullscreen ? <div className="w-[72px] shrink-0" /> : null}
        {showSidebarToggles ? (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            <Button
              type="button"
              data-action="titlebar-toggle-left-sidebar"
              variant="ghost"
              className="h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong"
              aria-label={
                leftSidebarOpen
                  ? language.t("desktopTitlebar.collapseLeftPanel")
                  : language.t("desktopTitlebar.expandLeftPanel")
              }
              aria-expanded={leftSidebarOpen}
              title={
                leftSidebarOpen
                  ? language.t("desktopTitlebar.collapseLeftPanel")
                  : language.t("desktopTitlebar.expandLeftPanel")
              }
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            >
              {leftSidebarOpen ? (
                <LayoutLeftPartialIcon className="size-4" />
              ) : (
                <LayoutLeftIcon className="size-4" />
              )}
            </Button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {isReadingPage && (
            <div className="flex items-center gap-2 px-3 animate-in fade-in slide-in-from-left-2 duration-300 cubic-bezier(0.23, 1, 0.32, 1)">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={language.t("sidebar.resourcesBackToChat")}
                title={language.t("sidebar.resourcesBackToChat")}
                className="transition-transform active:scale-90"
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
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 mr-2 ml-auto">
          {rightSidebarToggle}

          {isWindows ? (
            <>
              <div className="w-[140px] shrink-0" />
              <div
                data-component="titlebar-system-controls-mount"
                data-tauri-decorum-tb
                className="flex h-10 shrink-0 flex-row"
              />
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
