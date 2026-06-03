import { AnimatePresence, motion, type Transition } from "motion/react"
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import {
  Button,
  ResizeHandle,
  ResizablePanel,
  ResizablePanelGroup,
  cn,
  useResizablePanelRef,
} from "@buddy/ui"
import { PanelRightOpenIcon } from "lucide-react"
import { readDesktopTitlebarBottomOffset } from "@/components/layout/desktop-titlebar-inset"
import { usePersistentResizablePanelLayout } from "@/components/layout/use-persistent-resizable-panel-layout"

type DirectoryChatWorkspacePageLayoutProps = {
  workspaceKey: string
  workspace: ReactNode
  conversation: (controls: DirectoryChatWorkspaceConversationControls) => ReactNode
}

export type DirectoryChatWorkspaceConversationControls = {
  onFloatChat?: () => void
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
const WORKSPACE_CHAT_DOCK_LABEL = "Dock chat"
const WORKSPACE_CHAT_DRAG_LABEL = "Drag floating chat"
const FLOATING_CHAT_MARGIN_PX = 24
const FLOATING_CHAT_MIN_WIDTH_PX = 440
const FLOATING_CHAT_MIN_HEIGHT_PX = 460
const FLOATING_CHAT_MIN_WIDTH_FALLBACK_PX = 320
const FLOATING_CHAT_MIN_HEIGHT_FALLBACK_PX = 360
const FLOATING_CHAT_WIDTH_RATIO = 0.42
const FLOATING_CHAT_HEIGHT_RATIO = 0.62
const FLOATING_CHAT_PREFERRED_MIN_WIDTH_PX = 560
const FLOATING_CHAT_PREFERRED_MAX_WIDTH_PX = 700
const FLOATING_CHAT_PREFERRED_MIN_HEIGHT_PX = 560
const FLOATING_CHAT_PREFERRED_MAX_HEIGHT_PX = 720
const FLOATING_CHAT_DEFAULT_X_RATIO = 0.52
const FLOATING_CHAT_DEFAULT_CONTAINER_WIDTH_PX = 1280
const FLOATING_CHAT_DEFAULT_CONTAINER_HEIGHT_PX = 800
const FLOATING_CHAT_WINDOW_TRANSITION = {
  type: "spring",
  duration: 0.26,
  bounce: 0.08,
} satisfies Transition

export type FloatingChatPosition = {
  x: number
  y: number
}

export type FloatingChatSize = {
  width: number
  height: number
}

export type FloatingChatContainerSize = {
  containerWidth: number
  containerHeight: number
  safeTop: number
}

export type FloatingChatBounds = {
  containerWidth: number
  containerHeight: number
  width: number
  height: number
  margin: number
  safeTop: number
}

export type FloatingChatRect = FloatingChatPosition & FloatingChatSize

type FloatingChatResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

type FloatingChatMinimumSize = {
  minWidth: number
  minHeight: number
}

type WorkspaceChatLayoutMode = "docked" | "floating"

function hasUsableDimension(value: number) {
  return Number.isFinite(value) && value > 0
}

function readFloatingChatSafeTop(layoutNode: HTMLElement | null) {
  if (typeof document === "undefined") {
    return FLOATING_CHAT_MARGIN_PX
  }

  const layoutTop = layoutNode?.getBoundingClientRect().top ?? 0
  const titlebarBottom = readDesktopTitlebarBottomOffset()
  return Math.max(FLOATING_CHAT_MARGIN_PX, titlebarBottom - layoutTop + FLOATING_CHAT_MARGIN_PX)
}

function resolveInitialFloatingChatContainerSize(): FloatingChatContainerSize {
  if (
    typeof window !== "undefined" &&
    hasUsableDimension(window.innerWidth) &&
    hasUsableDimension(window.innerHeight)
  ) {
    return {
      containerWidth: window.innerWidth,
      containerHeight: window.innerHeight,
      safeTop: FLOATING_CHAT_MARGIN_PX,
    }
  }

  return {
    containerWidth: FLOATING_CHAT_DEFAULT_CONTAINER_WIDTH_PX,
    containerHeight: FLOATING_CHAT_DEFAULT_CONTAINER_HEIGHT_PX,
    safeTop: FLOATING_CHAT_MARGIN_PX,
  }
}

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

function resolveFloatingChatPreferredDimension(input: {
  available: number
  ratio: number
  preferredMin: number
  preferredMax: number
}) {
  if (input.available <= 0) {
    return 0
  }

  const preferred = Math.min(
    input.preferredMax,
    Math.max(input.preferredMin, input.available * input.ratio),
  )
  return Math.min(preferred, input.available)
}

function resolveFloatingChatMinimumSize(
  containerSize: FloatingChatContainerSize,
): FloatingChatMinimumSize {
  const availableWidth = Math.max(0, containerSize.containerWidth - FLOATING_CHAT_MARGIN_PX * 2)
  const availableHeight = Math.max(
    0,
    containerSize.containerHeight - containerSize.safeTop - FLOATING_CHAT_MARGIN_PX,
  )

  return {
    minWidth:
      availableWidth >= FLOATING_CHAT_MIN_WIDTH_PX
        ? FLOATING_CHAT_MIN_WIDTH_PX
        : Math.min(FLOATING_CHAT_MIN_WIDTH_FALLBACK_PX, availableWidth),
    minHeight:
      availableHeight >= FLOATING_CHAT_MIN_HEIGHT_PX
        ? FLOATING_CHAT_MIN_HEIGHT_PX
        : Math.min(FLOATING_CHAT_MIN_HEIGHT_FALLBACK_PX, availableHeight),
  }
}

export function resolveFloatingChatSize(
  containerSize: FloatingChatContainerSize,
): FloatingChatSize {
  const availableWidth = Math.max(0, containerSize.containerWidth - FLOATING_CHAT_MARGIN_PX * 2)
  const availableHeight = Math.max(
    0,
    containerSize.containerHeight - containerSize.safeTop - FLOATING_CHAT_MARGIN_PX,
  )
  const minimumSize = resolveFloatingChatMinimumSize(containerSize)

  return {
    width: Math.max(
      minimumSize.minWidth,
      resolveFloatingChatPreferredDimension({
        ratio: FLOATING_CHAT_WIDTH_RATIO,
        preferredMin: FLOATING_CHAT_PREFERRED_MIN_WIDTH_PX,
        preferredMax: FLOATING_CHAT_PREFERRED_MAX_WIDTH_PX,
        available: availableWidth,
      }),
    ),
    height: Math.max(
      minimumSize.minHeight,
      resolveFloatingChatPreferredDimension({
        ratio: FLOATING_CHAT_HEIGHT_RATIO,
        preferredMin: FLOATING_CHAT_PREFERRED_MIN_HEIGHT_PX,
        preferredMax: FLOATING_CHAT_PREFERRED_MAX_HEIGHT_PX,
        available: availableHeight,
      }),
    ),
  }
}

function clampFloatingChatSize(
  size: FloatingChatSize,
  containerSize: FloatingChatContainerSize,
): FloatingChatSize {
  const availableWidth = Math.max(0, containerSize.containerWidth - FLOATING_CHAT_MARGIN_PX * 2)
  const availableHeight = Math.max(
    0,
    containerSize.containerHeight - containerSize.safeTop - FLOATING_CHAT_MARGIN_PX,
  )
  const minimumSize = resolveFloatingChatMinimumSize(containerSize)

  return {
    width: Math.min(availableWidth, Math.max(minimumSize.minWidth, size.width)),
    height: Math.min(availableHeight, Math.max(minimumSize.minHeight, size.height)),
  }
}

function resolveFloatingChatBounds(
  containerSize: FloatingChatContainerSize,
  size: FloatingChatSize,
): FloatingChatBounds {
  return {
    containerWidth: containerSize.containerWidth,
    containerHeight: containerSize.containerHeight,
    width: size.width,
    height: size.height,
    margin: FLOATING_CHAT_MARGIN_PX,
    safeTop: containerSize.safeTop,
  }
}

function resolveFloatingChatMaxCoordinate(input: {
  containerSize: number
  windowSize: number
  margin: number
}) {
  if (input.windowSize === 0 || input.windowSize + input.margin > input.containerSize) {
    return input.margin
  }

  return input.containerSize - input.windowSize - input.margin
}

export function clampFloatingChatPosition(
  position: FloatingChatPosition,
  bounds: FloatingChatBounds,
): FloatingChatPosition {
  const maxX = resolveFloatingChatMaxCoordinate({
    containerSize: bounds.containerWidth,
    windowSize: bounds.width,
    margin: bounds.margin,
  })
  const maxY = resolveFloatingChatMaxCoordinate({
    containerSize: bounds.containerHeight,
    windowSize: bounds.height,
    margin: bounds.margin,
  })
  const minY = bounds.safeTop

  return {
    x: Math.min(maxX, Math.max(bounds.margin, position.x)),
    y: maxY < minY ? minY : Math.min(maxY, Math.max(minY, position.y)),
  }
}

export function resolveDefaultFloatingChatPosition(
  bounds: FloatingChatBounds,
): FloatingChatPosition {
  return clampFloatingChatPosition(
    {
      x: bounds.containerWidth * FLOATING_CHAT_DEFAULT_X_RATIO,
      y: bounds.containerHeight - bounds.height - bounds.margin,
    },
    bounds,
  )
}

export function clampFloatingChatRect(
  rect: FloatingChatRect,
  containerSize: FloatingChatContainerSize,
): FloatingChatRect {
  const size = clampFloatingChatSize(rect, containerSize)
  const position = clampFloatingChatPosition(rect, resolveFloatingChatBounds(containerSize, size))

  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  }
}

export function resolveDefaultFloatingChatRect(
  containerSize: FloatingChatContainerSize,
): FloatingChatRect {
  const size = resolveFloatingChatSize(containerSize)
  const position = resolveDefaultFloatingChatPosition(
    resolveFloatingChatBounds(containerSize, size),
  )

  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  }
}

function resizeFloatingChatRect(input: {
  rect: FloatingChatRect
  direction: FloatingChatResizeDirection
  deltaX: number
  deltaY: number
  containerSize: FloatingChatContainerSize
}): FloatingChatRect {
  const minimumSize = resolveFloatingChatMinimumSize(input.containerSize)
  const maxRight = input.containerSize.containerWidth - FLOATING_CHAT_MARGIN_PX
  const maxBottom = input.containerSize.containerHeight - FLOATING_CHAT_MARGIN_PX
  let left = input.rect.x
  let top = input.rect.y
  let right = input.rect.x + input.rect.width
  let bottom = input.rect.y + input.rect.height

  if (input.direction.includes("e")) {
    right = Math.min(maxRight, right + input.deltaX)
  }
  if (input.direction.includes("w")) {
    left = Math.max(FLOATING_CHAT_MARGIN_PX, left + input.deltaX)
  }
  if (input.direction.includes("s")) {
    bottom = Math.min(maxBottom, bottom + input.deltaY)
  }
  if (input.direction.includes("n")) {
    top = Math.max(input.containerSize.safeTop, top + input.deltaY)
  }

  if (right - left < minimumSize.minWidth) {
    if (input.direction.includes("w")) {
      left = right - minimumSize.minWidth
    } else {
      right = left + minimumSize.minWidth
    }
  }

  if (bottom - top < minimumSize.minHeight) {
    if (input.direction.includes("n")) {
      top = bottom - minimumSize.minHeight
    } else {
      bottom = top + minimumSize.minHeight
    }
  }

  return clampFloatingChatRect(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    },
    input.containerSize,
  )
}

function WorkspaceContent(props: { entered: boolean; bordered: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "min-w-0 h-full bg-background-base transition-[opacity,transform] motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        props.bordered ? "border-r border-border-weaker-base" : "",
        WORKSPACE_LAYOUT_ENTER_DURATION_CLASS,
        WORKSPACE_LAYOUT_ENTER_EASING,
        props.entered ? "translate-x-0 opacity-100" : "-translate-x-3 opacity-0",
      )}
    >
      {props.children}
    </div>
  )
}

function DockedConversationContent(props: { entered: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative h-full w-full transition-[opacity,transform] motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        WORKSPACE_LAYOUT_ENTER_DURATION_CLASS,
        WORKSPACE_LAYOUT_ENTER_EASING,
        props.entered ? "translate-x-0 opacity-100" : "-translate-x-8 opacity-0",
      )}
    >
      {props.children}
    </div>
  )
}

function FloatingChatResizeHandle(props: {
  direction: FloatingChatResizeDirection
  className: string
  onResizeStart: (
    direction: FloatingChatResizeDirection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void
}) {
  return (
    <div
      data-component="directory-chat-floating-window-resize-handle"
      data-resize-direction={props.direction}
      aria-label={`Resize floating chat ${props.direction}`}
      className={cn(
        "absolute z-20 touch-none select-none rounded-full opacity-0 transition-opacity duration-150 ease-out hover:opacity-100 active:opacity-100 before:absolute before:inset-0 before:rounded-full before:bg-border-stronger-base/50",
        props.className,
      )}
      onPointerDown={(event) => {
        props.onResizeStart(props.direction, event)
      }}
    />
  )
}

function FloatingChatWindow(props: {
  rect: FloatingChatRect
  conversation: ReactNode
  onDock: () => void
  onDragStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onResizeStart: (
    direction: FloatingChatResizeDirection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void
}) {
  const floatingWindowStyle = {
    left: props.rect.x,
    top: props.rect.y,
    width: props.rect.width,
    height: props.rect.height,
    transformOrigin: "70% 100%",
  } satisfies CSSProperties

  return (
    <motion.div
      data-component="directory-chat-floating-window"
      style={floatingWindowStyle}
      initial={{ opacity: 0, scale: 0.95, y: 22 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 16 }}
      transition={FLOATING_CHAT_WINDOW_TRANSITION}
      className="absolute z-40 flex min-h-0 min-w-0 overflow-hidden rounded-2xl border border-border-base/70 bg-background-stronger shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
    >
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-weaker-base bg-surface-raised-base/95 px-3 backdrop-blur">
          <div
            data-component="directory-chat-floating-window-drag-handle"
            className="flex h-full min-w-0 flex-1 cursor-grab touch-none select-none items-center active:cursor-grabbing"
            onPointerDown={props.onDragStart}
          >
            <span className="h-1 w-10 rounded-full bg-border-stronger-base" aria-hidden="true" />
            <span className="sr-only">{WORKSPACE_CHAT_DRAG_LABEL}</span>
          </div>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            data-action="directory-chat-dock"
            aria-label={WORKSPACE_CHAT_DOCK_LABEL}
            title={WORKSPACE_CHAT_DOCK_LABEL}
            className="text-text-weaker hover:bg-surface-base-hover hover:text-text-base"
            onClick={props.onDock}
          >
            <PanelRightOpenIcon />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{props.conversation}</div>
      </div>
      <FloatingChatResizeHandle
        direction="n"
        className="inset-x-6 top-0 h-2 -translate-y-1/2 cursor-ns-resize before:h-[3px] before:top-1/2 before:-translate-y-1/2"
        onResizeStart={props.onResizeStart}
      />
      <FloatingChatResizeHandle
        direction="s"
        className="inset-x-6 bottom-0 h-2 translate-y-1/2 cursor-ns-resize before:h-[3px] before:top-1/2 before:-translate-y-1/2"
        onResizeStart={props.onResizeStart}
      />
      <FloatingChatResizeHandle
        direction="e"
        className="inset-y-6 right-0 w-2 translate-x-1/2 cursor-ew-resize before:left-1/2 before:w-[3px] before:-translate-x-1/2"
        onResizeStart={props.onResizeStart}
      />
      <FloatingChatResizeHandle
        direction="w"
        className="inset-y-6 left-0 w-2 -translate-x-1/2 cursor-ew-resize before:left-1/2 before:w-[3px] before:-translate-x-1/2"
        onResizeStart={props.onResizeStart}
      />
      <FloatingChatResizeHandle
        direction="ne"
        className="right-0 top-0 size-5 -translate-y-1/2 translate-x-1/2 cursor-nesw-resize"
        onResizeStart={props.onResizeStart}
      />
      <FloatingChatResizeHandle
        direction="nw"
        className="left-0 top-0 size-5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"
        onResizeStart={props.onResizeStart}
      />
      <FloatingChatResizeHandle
        direction="se"
        className="bottom-0 right-0 size-5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"
        onResizeStart={props.onResizeStart}
      />
      <FloatingChatResizeHandle
        direction="sw"
        className="bottom-0 left-0 size-5 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"
        onResizeStart={props.onResizeStart}
      />
    </motion.div>
  )
}

export function DirectoryChatWorkspacePageLayout(props: DirectoryChatWorkspacePageLayoutProps) {
  const [chatPanelWidth, setChatPanelWidth] = useState(readInitialChatPanelWidth)
  const [chatLayoutMode, setChatLayoutMode] = useState<WorkspaceChatLayoutMode>("docked")
  const [containerSize, setContainerSize] = useState<FloatingChatContainerSize>(
    resolveInitialFloatingChatContainerSize,
  )
  const [floatingRect, setFloatingRect] = useState<FloatingChatRect>(() =>
    resolveDefaultFloatingChatRect(resolveInitialFloatingChatContainerSize()),
  )
  const [layoutEntered, setLayoutEntered] = useState(false)
  const layoutRef = useRef<HTMLElement | null>(null)
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

  useEffect(() => {
    const observedNode = layoutRef.current
    if (!observedNode) return

    const syncContainerSize = () => {
      const rect = observedNode.getBoundingClientRect()
      if (!hasUsableDimension(rect.width) || !hasUsableDimension(rect.height)) return

      setContainerSize((current) => {
        const nextSafeTop = readFloatingChatSafeTop(observedNode)
        if (
          current.containerWidth === rect.width &&
          current.containerHeight === rect.height &&
          current.safeTop === nextSafeTop
        ) {
          return current
        }

        return {
          containerWidth: rect.width,
          containerHeight: rect.height,
          safeTop: nextSafeTop,
        }
      })
    }

    syncContainerSize()
    window.addEventListener("resize", syncContainerSize)

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", syncContainerSize)
      }
    }

    const resizeObserver = new ResizeObserver(syncContainerSize)
    resizeObserver.observe(observedNode)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", syncContainerSize)
    }
  }, [])

  useEffect(() => {
    if (chatLayoutMode !== "floating") return

    setFloatingRect((current) => clampFloatingChatRect(current, containerSize))
  }, [chatLayoutMode, containerSize])

  function readCurrentContainerSize() {
    const node = layoutRef.current
    if (!node) return containerSize

    const rect = node.getBoundingClientRect()
    if (!hasUsableDimension(rect.width) || !hasUsableDimension(rect.height)) {
      return containerSize
    }

    return {
      containerWidth: rect.width,
      containerHeight: rect.height,
      safeTop: readFloatingChatSafeTop(node),
    }
  }

  function floatChat() {
    const nextContainerSize = readCurrentContainerSize()
    setContainerSize(nextContainerSize)
    setFloatingRect(resolveDefaultFloatingChatRect(nextContainerSize))
    setChatLayoutMode("floating")
  }

  function dockChat() {
    setChatLayoutMode("docked")
  }

  function startFloatingChatDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.preventDefault()

    const handle = event.currentTarget
    const pointerID = event.pointerId
    const startClientX = event.clientX
    const startClientY = event.clientY
    const startRect = floatingRect
    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    let dragFinished = false

    document.body.style.userSelect = "none"
    document.body.style.cursor = "grabbing"
    handle.setPointerCapture(pointerID)

    function finishDrag(nextEvent?: PointerEvent) {
      if (nextEvent && nextEvent.pointerId !== pointerID) return
      if (dragFinished) return
      dragFinished = true

      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      handle.removeEventListener("pointermove", onPointerMove)
      handle.removeEventListener("pointerup", finishDrag)
      handle.removeEventListener("pointercancel", finishDrag)
      handle.removeEventListener("lostpointercapture", onLostPointerCapture)
      window.removeEventListener("blur", onWindowBlur)

      if (handle.hasPointerCapture(pointerID)) {
        handle.releasePointerCapture(pointerID)
      }
    }

    function onPointerMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerID) return

      const nextContainerSize = readCurrentContainerSize()
      const deltaX = moveEvent.clientX - startClientX
      const deltaY = moveEvent.clientY - startClientY
      setFloatingRect(
        clampFloatingChatRect(
          {
            ...startRect,
            x: startRect.x + deltaX,
            y: startRect.y + deltaY,
          },
          nextContainerSize,
        ),
      )
    }

    function onLostPointerCapture() {
      finishDrag()
    }

    function onWindowBlur() {
      finishDrag()
    }

    handle.addEventListener("pointermove", onPointerMove)
    handle.addEventListener("pointerup", finishDrag)
    handle.addEventListener("pointercancel", finishDrag)
    handle.addEventListener("lostpointercapture", onLostPointerCapture)
    window.addEventListener("blur", onWindowBlur)
  }

  function startFloatingChatResize(
    direction: FloatingChatResizeDirection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const handle = event.currentTarget
    const pointerID = event.pointerId
    const startClientX = event.clientX
    const startClientY = event.clientY
    const startRect = floatingRect
    const previousUserSelect = document.body.style.userSelect
    const previousOverflow = document.body.style.overflow
    let resizeFinished = false

    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"
    handle.setPointerCapture(pointerID)

    function finishResize(nextEvent?: PointerEvent) {
      if (nextEvent && nextEvent.pointerId !== pointerID) return
      if (resizeFinished) return
      resizeFinished = true

      document.body.style.userSelect = previousUserSelect
      document.body.style.overflow = previousOverflow
      handle.removeEventListener("pointermove", onPointerMove)
      handle.removeEventListener("pointerup", finishResize)
      handle.removeEventListener("pointercancel", finishResize)
      handle.removeEventListener("lostpointercapture", onLostPointerCapture)
      window.removeEventListener("blur", onWindowBlur)

      if (handle.hasPointerCapture(pointerID)) {
        handle.releasePointerCapture(pointerID)
      }
    }

    function onPointerMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerID) return

      setFloatingRect(
        resizeFloatingChatRect({
          rect: startRect,
          direction,
          deltaX: moveEvent.clientX - startClientX,
          deltaY: moveEvent.clientY - startClientY,
          containerSize: readCurrentContainerSize(),
        }),
      )
    }

    function onLostPointerCapture() {
      finishResize()
    }

    function onWindowBlur() {
      finishResize()
    }

    handle.addEventListener("pointermove", onPointerMove)
    handle.addEventListener("pointerup", finishResize)
    handle.addEventListener("pointercancel", finishResize)
    handle.addEventListener("lostpointercapture", onLostPointerCapture)
    window.addEventListener("blur", onWindowBlur)
  }

  return (
    <section
      ref={layoutRef}
      data-component="directory-chat-workspace-page-layout"
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-raised-base"
    >
      {chatLayoutMode === "floating" ? (
        <div className="min-h-0 flex-1 w-full overflow-hidden">
          <WorkspaceContent entered={layoutEntered} bordered={false}>
            {props.workspace}
          </WorkspaceContent>
        </div>
      ) : (
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
            <WorkspaceContent entered={layoutEntered} bordered>
              {props.workspace}
            </WorkspaceContent>
          </ResizablePanel>

          <ResizablePanel
            id={WORKSPACE_CONVERSATION_PANEL_ID}
            panelRef={conversationPanelRef}
            defaultSize={chatPanelWidth}
            minSize={WORKSPACE_CHAT_PANEL_MIN_WIDTH_PX}
            maxSize={getWorkspaceChatPanelMaxWidth()}
            className="relative flex min-h-0 min-w-0 overflow-hidden"
          >
            <DockedConversationContent entered={layoutEntered}>
              {props.conversation({ onFloatChat: floatChat })}
            </DockedConversationContent>
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
      )}
      <AnimatePresence initial={false}>
        {chatLayoutMode === "floating" ? (
          <FloatingChatWindow
            key="directory-chat-floating-window"
            rect={floatingRect}
            conversation={props.conversation({})}
            onDock={dockChat}
            onDragStart={startFloatingChatDrag}
            onResizeStart={startFloatingChatResize}
          />
        ) : null}
      </AnimatePresence>
    </section>
  )
}
