import { useMemo, type ReactNode } from "react"
import {
  ResizeHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useResizablePanelRef,
} from "@buddy/ui"
import { DesktopTitlebar } from "@/components/layout/desktop-titlebar"
import { usePersistentResizablePanelLayout } from "@/components/layout/use-persistent-resizable-panel-layout"
import { RIGHT_SIDEBAR_COLLAPSE_THRESHOLD_PX } from "@/lib/directory-chat/right-sidebar-layout"

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

  const rightSidebarPanelRef = useResizablePanelRef()

  const leftSidebarResolvedWidth = leftSidebarOpen ? leftSidebarDisplayWidth : 0

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
          variant={titlebarVariant}
          leftSidebarOpen={leftSidebarOpen}
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
