import { useEffect, useMemo, type ReactNode } from "react"
import { ResizeHandle, ResizablePanel, ResizablePanelGroup, useResizablePanelRef } from "@buddy/ui"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { usePersistentResizablePanelLayout } from "@/components/layout/use-persistent-resizable-panel-layout"
import { RIGHT_SIDEBAR_COLLAPSE_THRESHOLD_PX } from "@/lib/directory-chat/right-sidebar-layout"
import type { NotebookMainPaneTab } from "@/state/ui-preferences"

const DIRECTORY_CHAT_LAYOUT_ID = "directory-chat-layout"
const DIRECTORY_CHAT_MAIN_PANEL_ID = "directory-chat-main-pane"
const DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID = "directory-chat-right-sidebar"
const CHAT_TITLEBAR_HEIGHT_PX = 52

type DirectoryChatShellProps = {
  leftSidebar: ReactNode
  mainPane: ReactNode
  rightSidebar: ReactNode
  createTeachingFileDialog: ReactNode
  chatTitle?: string
  projectName?: string
  isTurnActive?: boolean
  titlebarVariant?: "chat" | "shell"
  mainPaneTab?: NotebookMainPaneTab
  onMainPaneTabChange?: (tab: NotebookMainPaneTab) => void
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
    isTurnActive,
    titlebarVariant,
    mainPaneTab,
    onMainPaneTabChange,
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

  const rightSidebarPanelRef = useResizablePanelRef()

  const leftSidebarResolvedWidth = leftSidebarOpen ? leftSidebarDisplayWidth : 0

  const layoutPanelIds = useMemo(() => {
    return [DIRECTORY_CHAT_MAIN_PANEL_ID, DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID]
  }, [])
  const { defaultLayout, onLayoutChanged } = usePersistentResizablePanelLayout({
    id: DIRECTORY_CHAT_LAYOUT_ID,
    panelIds: layoutPanelIds,
  })

  useEffect(() => {
    rightSidebarPanelRef.current?.resize(rightSidebarOpen ? rightSidebarDisplayWidth : 0)
  }, [rightSidebarDisplayWidth, rightSidebarOpen, rightSidebarPanelRef])

  return (
    <div
      data-component="directory-chat-shell"
      className="relative grid h-full w-full overflow-hidden bg-surface-raised-base transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none"
      style={{
        gridTemplateColumns: `${leftSidebarResolvedWidth}px minmax(0, 1fr)`,
        gridTemplateRows: `${CHAT_TITLEBAR_HEIGHT_PX}px minmax(0, 1fr)`,
      }}
    >
      {/* Row 1, Col 1: Sidebar header area — provides background continuity with the sidebar below.
          The no-drag placeholder covers the toggle button area (x=0..130) so Electron's
          webkit-app-region exclusion prevents Col 1's drag region from intercepting toggle clicks
          when the sidebar is open. The actual button lives inside DesktopTitlebar's header. */}
      <div
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
      <div className="col-start-2 row-start-1 min-w-0">
        <DesktopTitlebar
          placement="chat"
          chatTitle={chatTitle}
          projectName={projectName}
          isTurnActive={isTurnActive}
          variant={titlebarVariant}
          leftSidebarOpen={leftSidebarOpen}
          mainPaneTab={mainPaneTab}
          onMainPaneTabChange={onMainPaneTabChange}
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

          <ResizablePanel
            id={DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID}
            panelRef={rightSidebarPanelRef}
            defaultSize={rightSidebarOpen ? rightSidebarDisplayWidth : 0}
            minSize={rightSidebarOpen ? rightSidebarMinWidth : 0}
            maxSize={rightSidebarOpen ? rightSidebarMaxWidth : 0}
            className="relative flex min-h-0 min-w-0 overflow-hidden transition-[flex-basis,width] duration-200 ease-out motion-reduce:transition-none"
          >
            <div
              data-component="directory-chat-right-sidebar-shell"
              data-open={rightSidebarOpen ? "true" : "false"}
              aria-hidden={!rightSidebarOpen}
              className={`h-full w-full transition-opacity duration-200 ease-out motion-reduce:transition-none ${
                rightSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
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
                onCollapse={onRightSidebarCollapse}
              />
            ) : null}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      {createTeachingFileDialog}
    </div>
  )
}
