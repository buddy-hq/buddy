import { useMemo, type ReactNode } from "react"
import { ResizeHandle, ResizablePanel, ResizablePanelGroup, useResizablePanelRef } from "@buddy/ui"
import { usePersistentResizablePanelLayout } from "@/components/layout/use-persistent-resizable-panel-layout"
import { RIGHT_SIDEBAR_COLLAPSE_THRESHOLD_PX } from "@/lib/directory-chat/right-sidebar-layout"

const DIRECTORY_CHAT_LAYOUT_ID = "directory-chat-layout"
const DIRECTORY_CHAT_LEFT_SIDEBAR_PANEL_ID = "directory-chat-left-sidebar"
const DIRECTORY_CHAT_MAIN_PANEL_ID = "directory-chat-main-pane"
const DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID = "directory-chat-right-sidebar"

type DirectoryChatShellProps = {
  leftSidebar: ReactNode
  mainPane: ReactNode
  rightSidebar: ReactNode
  createTeachingFileDialog: ReactNode
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

  const leftSidebarPanelRef = useResizablePanelRef()
  const rightSidebarPanelRef = useResizablePanelRef()
  const layoutPanelIds = useMemo(() => {
    const panelIds: string[] = []
    if (leftSidebarOpen) {
      panelIds.push(DIRECTORY_CHAT_LEFT_SIDEBAR_PANEL_ID)
    }
    panelIds.push(DIRECTORY_CHAT_MAIN_PANEL_ID)
    if (rightSidebarOpen) {
      panelIds.push(DIRECTORY_CHAT_RIGHT_SIDEBAR_PANEL_ID)
    }
    return panelIds
  }, [leftSidebarOpen, rightSidebarOpen])
  const { defaultLayout, onLayoutChanged } = usePersistentResizablePanelLayout({
    id: DIRECTORY_CHAT_LAYOUT_ID,
    panelIds: layoutPanelIds,
  })

  return (
    <div
      data-component="directory-chat-shell"
      className="h-full w-full overflow-hidden bg-surface-raised-base"
    >
      <ResizablePanelGroup
        id={DIRECTORY_CHAT_LAYOUT_ID}
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="h-full w-full min-w-0"
      >
        {leftSidebarOpen ? (
          <ResizablePanel
            id={DIRECTORY_CHAT_LEFT_SIDEBAR_PANEL_ID}
            panelRef={leftSidebarPanelRef}
            defaultSize={leftSidebarDisplayWidth}
            minSize={leftSidebarMinWidth}
            maxSize={leftSidebarMaxWidth}
            className="relative flex min-h-0 min-w-0 overflow-hidden"
          >
            <div
              data-component="directory-chat-left-sidebar-shell"
              data-open="true"
              className="h-full w-full opacity-100 transition-opacity duration-200 ease-out"
            >
              {leftSidebar}
            </div>
            <ResizeHandle
              direction="horizontal"
              size={leftSidebarWidth}
              min={leftSidebarMinWidth}
              max={leftSidebarMaxWidth}
              collapseThreshold={leftSidebarMinWidth}
              onResize={(width) => {
                leftSidebarPanelRef.current?.resize(width)
                onLeftSidebarResize(width)
              }}
              onCollapse={onLeftSidebarCollapse}
            />
          </ResizablePanel>
        ) : null}

        <ResizablePanel id={DIRECTORY_CHAT_MAIN_PANEL_ID} className="flex min-h-0 min-w-0">
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
      {createTeachingFileDialog}
    </div>
  )
}
