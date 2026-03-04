import type { MouseEvent } from "react"
import { useRouterState } from "@tanstack/react-router"
import { Button } from "@buddy/ui"
import { usePlatform } from "@/context/platform"
import { useUiPreferences } from "@/state/ui-preferences"
import { isTitlebarInteractiveTarget, isTitlebarSystemControlTarget } from "./desktop-titlebar-helpers"
import { LayoutLeftIcon, LayoutLeftPartialIcon, LayoutRightIcon, LayoutRightPartialIcon } from "./sidebar-icons"

const RIGHT_SIDEBAR_EDITOR_MIN_WIDTH = 360
const RIGHT_SIDEBAR_EDITOR_DEFAULT_WIDTH = 640

export function DesktopTitlebar() {
  const platform = usePlatform()
  const isDesktop = platform.platform === "desktop"
  const isMac = isDesktop && platform.os === "macos"
  const isWindows = isDesktop && platform.os === "windows"
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const leftSidebarOpen = useUiPreferences((state) => state.leftSidebarOpen)
  const setLeftSidebarOpen = useUiPreferences((state) => state.setLeftSidebarOpen)
  const rightSidebarOpen = useUiPreferences((state) => state.rightSidebarOpen)
  const rightSidebarWidth = useUiPreferences((state) => state.rightSidebarWidth)
  const rightSidebarTab = useUiPreferences((state) => state.rightSidebarTab)
  const setRightSidebarOpen = useUiPreferences((state) => state.setRightSidebarOpen)
  const setRightSidebarWidth = useUiPreferences((state) => state.setRightSidebarWidth)

  if (!isMac && !isWindows) {
    return null
  }

  const showSidebarToggles = pathname !== "/chat" && pathname.endsWith("/chat")

  function onToggleRightSidebar() {
    if (rightSidebarOpen) {
      setRightSidebarOpen(false)
      return
    }

    if (rightSidebarTab === "editor" && rightSidebarWidth < RIGHT_SIDEBAR_EDITOR_MIN_WIDTH) {
      setRightSidebarWidth(RIGHT_SIDEBAR_EDITOR_DEFAULT_WIDTH)
    }

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

  return (
    <header
      className="h-10 shrink-0 border-b border-border/60 bg-[#0b0b0d] text-foreground"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex h-full items-center">
        {isMac ? <div className="w-[72px] shrink-0" /> : null}
        {showSidebarToggles ? (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="h-6 w-8 p-0 box-border text-muted-foreground hover:bg-[#151821] hover:text-foreground"
              aria-label={leftSidebarOpen ? "Collapse left panel" : "Expand left panel"}
              aria-expanded={leftSidebarOpen}
              title={leftSidebarOpen ? "Collapse left panel" : "Expand left panel"}
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            >
              {leftSidebarOpen ? <LayoutLeftPartialIcon className="size-4" /> : <LayoutLeftIcon className="size-4" />}
            </Button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center">
          {showSidebarToggles ? (
            <div className={isWindows ? "flex shrink-0 items-center gap-1" : "mr-2 flex shrink-0 items-center gap-1"}>
              <Button
                type="button"
                variant="ghost"
                className="h-6 w-8 p-0 box-border text-muted-foreground hover:bg-[#151821] hover:text-foreground"
                aria-label={rightSidebarOpen ? "Collapse right panel" : "Expand right panel"}
                aria-expanded={rightSidebarOpen}
                title={rightSidebarOpen ? "Collapse right panel" : "Expand right panel"}
                onClick={onToggleRightSidebar}
              >
                {rightSidebarOpen ? (
                  <LayoutRightPartialIcon className="size-4" />
                ) : (
                  <LayoutRightIcon className="size-4" />
                )}
              </Button>
            </div>
          ) : null}
          {isWindows ? (
            <>
              <div className="w-6 shrink-0" />
              <div data-tauri-decorum-tb className="flex h-10 shrink-0 flex-row" />
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}
