import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react"
import {
  Button,
  ResizeHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizablePanelRef,
} from "@buddy/ui"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { isTitlebarInteractiveTarget } from "@/components/layout/desktop-titlebar-helpers"
import { LayoutLeftPartialIcon } from "@/components/layout/sidebar-icons"
import { usePersistentResizablePanelLayout } from "@/components/layout/use-persistent-resizable-panel-layout"
import { language } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { RIGHT_SIDEBAR_COLLAPSE_THRESHOLD_PX } from "@/lib/directory-chat/right-sidebar-layout"

const DIRECTORY_CHAT_LAYOUT_ID = "directory-chat-layout"
const DIRECTORY_CHAT_MAIN_PANEL_ID = "directory-chat-main-pane"
const DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID = "directory-chat-right-sidebar"
const LEFT_SIDEBAR_COLLAPSED_WIDTH = 0
const CHAT_TITLEBAR_HEIGHT_PX = 52
const MAC_WINDOW_CONTROL_INSET_CLASS = "w-[90px]"

type DirectoryChatShellProps = {
  leftSidebar: ReactNode
  mainPane: ReactNode
  rightSidebar: ReactNode
  createTeachingFileDialog: ReactNode
  chatTitle?: string
  projectName?: string
  titlebarVariant?: "chat" | "shell"
  leftSidebarOpen: boolean
  leftSidebarDisplayWidth: number
  leftSidebarWidth: number
  leftSidebarMinWidth: number
  leftSidebarMaxWidth: number
  onLeftSidebarResize: (width: number) => void
  onLeftSidebarCollapse: () => void
  rightSidebarOpen: boolean
  rightSidebarDisplayWidth: number
  rightSidebarMinWidth: number
  rightSidebarMaxWidth: number
  onRightSidebarResize: (width: number) => void
  onRightSidebarCollapse: () => void
}

export function DirectoryChatShell(props: DirectoryChatShellProps) {
  const {
    leftSidebar,
    mainPane,
    rightSidebar,
    createTeachingFileDialog,
    chatTitle,
    projectName,
    titlebarVariant,
    leftSidebarOpen,
    leftSidebarDisplayWidth,
    leftSidebarWidth,
    leftSidebarMinWidth,
    leftSidebarMaxWidth,
    onLeftSidebarResize,
    onLeftSidebarCollapse,
    rightSidebarOpen,
    rightSidebarDisplayWidth,
    rightSidebarMinWidth,
    rightSidebarMaxWidth,
    onRightSidebarResize,
    onRightSidebarCollapse,
  } = props

  const platform = usePlatform()
  const isMac = platform.platform === "desktop" && platform.os === "macos"
  const [isFullscreen, setIsFullscreen] = useState(false)
  const rightSidebarPanelRef = useResizablePanelRef()
  const layoutPanelIds = useMemo(() => {
    const panelIds: string[] = []
    panelIds.push(DIRECTORY_CHAT_MAIN_PANEL_ID)
    if (rightSidebarOpen) {
      panelIds.push(DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID)
    }
    return panelIds
  }, [rightSidebarOpen])
  const { defaultLayout, onLayoutChanged } = usePersistentResizablePanelLayout({
    id: DIRECTORY_CHAT_LAYOUT_ID,
    panelIds: layoutPanelIds,
  })
  const leftSidebarResolvedWidth = leftSidebarOpen
    ? leftSidebarDisplayWidth
    : LEFT_SIDEBAR_COLLAPSED_WIDTH
  useEffect(() => {
    if (!isMac) return
    const media = window.matchMedia("(display-mode: fullscreen)")
    const handler = (event: MediaQueryListEvent | MediaQueryList) => setIsFullscreen(event.matches)
    handler(media)
    media.addEventListener("change", handler)
    return () => media.removeEventListener("change", handler)
  }, [isMac])

  function onTitlebarMouseDown(event: MouseEvent<HTMLElement>) {
    if (!platform.startWindowDragging) return
    if (event.buttons !== 1) return
    if (isTitlebarInteractiveTarget(event.target)) return

    event.preventDefault()
    void platform.startWindowDragging().catch(() => undefined)
  }

  function onTitlebarDoubleClick(event: MouseEvent<HTMLElement>) {
    if (!platform.toggleWindowMaximize) return
    if (isTitlebarInteractiveTarget(event.target)) return

    event.preventDefault()
    void platform.toggleWindowMaximize().catch(() => undefined)
  }

  return (
    <div
      data-component="directory-chat-shell"
      className="relative grid h-full w-full overflow-hidden bg-surface-raised-base transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none"
      style={{
        gridTemplateColumns: `${leftSidebarResolvedWidth}px minmax(0, 1fr)`,
        gridTemplateRows: `${CHAT_TITLEBAR_HEIGHT_PX}px minmax(0, 1fr)`,
      }}
    >
      <div
        className="relative col-start-1 row-start-1 flex h-full items-center overflow-hidden bg-surface-raised-base px-2 text-text-base select-none [-webkit-app-region:drag]"
        onMouseDown={onTitlebarMouseDown}
        onDoubleClick={onTitlebarDoubleClick}
      >
        {isMac && !isFullscreen ? (
          <div className={`${MAC_WINDOW_CONTROL_INSET_CLASS} shrink-0`} />
        ) : null}
        {leftSidebarOpen ? (
          <Button
            type="button"
            data-action="titlebar-toggle-left-sidebar"
            variant="ghost"
            className="ml-1 h-6 w-8 p-0 box-border text-text-weak hover:bg-surface-base-hover hover:text-text-strong [-webkit-app-region:no-drag]"
            aria-label={language.t("desktopTitlebar.collapseLeftPanel")}
            aria-expanded={leftSidebarOpen}
            title={language.t("desktopTitlebar.collapseLeftPanel")}
            onClick={() => onLeftSidebarCollapse()}
          >
            <LayoutLeftPartialIcon className="size-4" />
          </Button>
        ) : null}
        {leftSidebarOpen ? (
          <div className="absolute inset-y-0 right-0 w-px bg-border-weaker-base" />
        ) : null}
      </div>

      <div className="col-start-2 row-start-1 min-w-0">
        <DesktopTitlebar
          placement="chat"
          chatTitle={chatTitle}
          projectName={projectName}
          variant={titlebarVariant}
          leftSidebarOpen={leftSidebarOpen}
          reserveLeftSidebarToggleSlot
        />
      </div>

      <div className="col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden">
        <div
          data-component="directory-chat-left-sidebar-shell"
          data-open={leftSidebarOpen ? "true" : "false"}
          aria-hidden={!leftSidebarOpen}
          className={`relative flex h-full min-h-0 overflow-hidden ${
            leftSidebarOpen ? "" : "pointer-events-none"
          }`}
        >
          <div className="h-full w-full min-w-0">{leftSidebar}</div>
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
        <ResizablePanelGroup
          key={layoutPanelIds.join(",")}
          id={DIRECTORY_CHAT_LAYOUT_ID}
          orientation="horizontal"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
          className="h-full min-w-0 flex-1"
        >
          <ResizablePanel
            id={DIRECTORY_CHAT_MAIN_PANEL_ID}
            className="flex min-h-0 min-w-0 overflow-hidden"
          >
            {mainPane}
          </ResizablePanel>

          {rightSidebarOpen ? (
            <ResizablePanel
              id={DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID}
              panelRef={rightSidebarPanelRef}
              defaultSize={rightSidebarDisplayWidth}
              minSize={rightSidebarMinWidth}
              maxSize={rightSidebarMaxWidth}
              className="relative flex min-h-0 min-w-0 overflow-hidden"
            >
              <div
                data-component="directory-chat-right-sidebar-shell"
                data-open="true"
                className="h-full w-full opacity-100 transition-opacity duration-200 ease-out"
              >
                {rightSidebar}
              </div>
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
                onCollapse={onRightSidebarCollapse}
              />
            </ResizablePanel>
          ) : null}
        </ResizablePanelGroup>
      </div>
      {createTeachingFileDialog}
    </div>
  )
}
