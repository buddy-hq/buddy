import { useRouterState } from "@tanstack/react-router"
import { Button } from "@buddy/ui"
import { usePlatform } from "@/context/platform"
import { useUiPreferences } from "@/state/ui-preferences"
import {
  LayoutLeftIcon,
  LayoutLeftPartialIcon,
  LayoutRightIcon,
  LayoutRightPartialIcon,
} from "./sidebar-icons"

const RIGHT_SIDEBAR_EDITOR_MIN_WIDTH = 360
const RIGHT_SIDEBAR_EDITOR_DEFAULT_WIDTH = 640

export function DesktopTitlebar() {
  const platform = usePlatform()
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

  if (platform.platform !== "desktop" || platform.os !== "macos") {
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

  return (
    <header
      data-tauri-drag-region
      className="h-10 shrink-0 border-b border-border/60 bg-[#0b0b0d] text-foreground"
    >
      <div className="flex h-full items-center">
        <div className="w-[72px] shrink-0" />
        {showSidebarToggles ? (
          <div className="tauri-no-drag ml-2 flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="h-6 w-8 p-0 box-border text-muted-foreground hover:bg-[#151821] hover:text-foreground"
              aria-label={leftSidebarOpen ? "Collapse left panel" : "Expand left panel"}
              aria-expanded={leftSidebarOpen}
              title={leftSidebarOpen ? "Collapse left panel" : "Expand left panel"}
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
        <div data-tauri-drag-region className="min-w-0 flex-1" />
        {showSidebarToggles ? (
          <div className="tauri-no-drag mr-2 flex shrink-0 items-center gap-1">
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
      </div>
    </header>
  )
}
