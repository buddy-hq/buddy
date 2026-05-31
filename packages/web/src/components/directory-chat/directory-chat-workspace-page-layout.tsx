import { useEffect, useState, type ReactNode } from "react"
import {
  ResizeHandle,
  ResizablePanel,
  ResizablePanelGroup,
  cn,
  useResizablePanelRef,
} from "@buddy/ui"
import { usePersistentResizablePanelLayout } from "@/components/layout/use-persistent-resizable-panel-layout"

type DirectoryChatWorkspacePageLayoutProps = {
  workspaceKey: string
  workspace: ReactNode
  conversation: ReactNode
}

// Preserve the existing reading layout keys so reader widths survive the shared extraction.
const WORKSPACE_CHAT_PANEL_WIDTH_STORAGE_KEY = "directory-chat-reading-chat-panel-width"
const WORKSPACE_CHAT_PANEL_DEFAULT_WIDTH_PX = 480
const WORKSPACE_CHAT_PANEL_MIN_WIDTH_PX = 320
const WORKSPACE_CHAT_PANEL_MAX_VIEWPORT_RATIO = 0.55
const WORKSPACE_PANEL_MIN_WIDTH_PX = 320
const WORKSPACE_LAYOUT_ID = "directory-chat-reading-layout"
const WORKSPACE_PANEL_ID = "directory-chat-reading-reader"
const WORKSPACE_CONVERSATION_PANEL_ID = "directory-chat-reading-conversation"
const WORKSPACE_LAYOUT_PANEL_IDS = [WORKSPACE_PANEL_ID, WORKSPACE_CONVERSATION_PANEL_ID]
const WORKSPACE_LAYOUT_ENTER_EASING = "ease-[cubic-bezier(0.23,1,0.32,1)]"
const WORKSPACE_LAYOUT_ENTER_DURATION_CLASS = "duration-220"

function getWorkspaceChatPanelMaxWidth() {
  return typeof window === "undefined"
    ? WORKSPACE_CHAT_PANEL_DEFAULT_WIDTH_PX
    : window.innerWidth * WORKSPACE_CHAT_PANEL_MAX_VIEWPORT_RATIO
}

function readInitialChatPanelWidth() {
  if (typeof window === "undefined") {
    return WORKSPACE_CHAT_PANEL_DEFAULT_WIDTH_PX
  }

  const saved = window.localStorage.getItem(WORKSPACE_CHAT_PANEL_WIDTH_STORAGE_KEY)
  const parsed = saved ? Number.parseInt(saved, 10) : Number.NaN
  if (!Number.isFinite(parsed)) {
    return WORKSPACE_CHAT_PANEL_DEFAULT_WIDTH_PX
  }

  return Math.min(
    Math.max(parsed, WORKSPACE_CHAT_PANEL_MIN_WIDTH_PX),
    getWorkspaceChatPanelMaxWidth(),
  )
}

export function DirectoryChatWorkspacePageLayout(props: DirectoryChatWorkspacePageLayoutProps) {
  const [chatPanelWidth, setChatPanelWidth] = useState(readInitialChatPanelWidth)
  const [layoutEntered, setLayoutEntered] = useState(false)
  const conversationPanelRef = useResizablePanelRef()
  const { defaultLayout, onLayoutChanged } = usePersistentResizablePanelLayout({
    id: WORKSPACE_LAYOUT_ID,
    panelIds: WORKSPACE_LAYOUT_PANEL_IDS,
  })

  useEffect(() => {
    setLayoutEntered(false)
    const frame = window.requestAnimationFrame(() => {
      setLayoutEntered(true)
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [props.workspaceKey])

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_CHAT_PANEL_WIDTH_STORAGE_KEY, chatPanelWidth.toString())
  }, [chatPanelWidth])

  return (
    <section
      data-component="directory-chat-workspace-page-layout"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-raised-base"
    >
      <ResizablePanelGroup
        id={WORKSPACE_LAYOUT_ID}
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="min-h-0 flex-1 w-full"
      >
        <ResizablePanel
          id={WORKSPACE_PANEL_ID}
          minSize={WORKSPACE_PANEL_MIN_WIDTH_PX}
          className="min-h-0 min-w-0 overflow-hidden"
        >
          <div
            className={cn(
              "min-w-0 h-full border-r border-border-weaker-base bg-background-base transition-[opacity,transform] motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none",
              WORKSPACE_LAYOUT_ENTER_DURATION_CLASS,
              WORKSPACE_LAYOUT_ENTER_EASING,
              layoutEntered ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0",
            )}
          >
            {props.workspace}
          </div>
        </ResizablePanel>

        <ResizablePanel
          id={WORKSPACE_CONVERSATION_PANEL_ID}
          panelRef={conversationPanelRef}
          defaultSize={chatPanelWidth}
          minSize={WORKSPACE_CHAT_PANEL_MIN_WIDTH_PX}
          maxSize={getWorkspaceChatPanelMaxWidth()}
          className="relative flex min-h-0 min-w-0 overflow-hidden"
        >
          <div
            className={cn(
              "h-full w-full transition-[opacity,transform] motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none",
              WORKSPACE_LAYOUT_ENTER_DURATION_CLASS,
              WORKSPACE_LAYOUT_ENTER_EASING,
              layoutEntered ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0",
            )}
          >
            {props.conversation}
          </div>
          <ResizeHandle
            direction="horizontal"
            edge="start"
            size={chatPanelWidth}
            min={WORKSPACE_CHAT_PANEL_MIN_WIDTH_PX}
            max={getWorkspaceChatPanelMaxWidth()}
            onResize={(width) => {
              conversationPanelRef.current?.resize(width)
              setChatPanelWidth(width)
            }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </section>
  )
}
