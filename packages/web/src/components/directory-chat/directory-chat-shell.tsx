import type { ReactNode } from "react"
import { ResizeHandle } from "@/components/layout/resize-handle"

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

  return (
    <div
      data-component="directory-chat-shell"
      className="h-full w-full overflow-hidden bg-surface-raised-base"
    >
      <div className="h-full w-full flex min-w-0">
        <div
          data-component="directory-chat-left-sidebar-shell"
          data-open={leftSidebarOpen ? "true" : "false"}
          className={`relative shrink-0 min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${
            leftSidebarOpen ? "" : "pointer-events-none"
          }`}
          style={{
            width: `${leftSidebarOpen ? leftSidebarDisplayWidth : 0}px`,
          }}
        >
          <div
            className={`h-full transition-opacity duration-200 ease-out ${
              leftSidebarOpen ? "opacity-100" : "opacity-0"
            }`}
            style={{ width: `${leftSidebarDisplayWidth}px` }}
          >
            {leftSidebar}
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

        {mainPane}

        <div
          data-component="directory-chat-right-sidebar-shell"
          data-open={rightSidebarOpen ? "true" : "false"}
          className={`relative shrink-0 min-h-0 overflow-hidden transition-[width] duration-200 ease-out ${
            rightSidebarOpen ? "" : "pointer-events-none"
          }`}
          style={{
            width: `${rightSidebarOpen ? rightSidebarDisplayWidth : 0}px`,
          }}
        >
          <div
            className={`h-full transition-opacity duration-200 ease-out ${
              rightSidebarOpen ? "opacity-100" : "opacity-0"
            }`}
            style={{ width: `${rightSidebarDisplayWidth}px` }}
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
              collapseThreshold={160}
              onResize={onRightSidebarResize}
              onCollapse={onRightSidebarCollapse}
            />
          ) : null}
        </div>
      </div>
      {createTeachingFileDialog}
    </div>
  )
}
