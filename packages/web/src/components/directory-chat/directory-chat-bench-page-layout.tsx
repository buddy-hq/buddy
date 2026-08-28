import { motion, type Transition } from "motion/react"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { Button, ResizeHandle, cn, type ResizeHandleIntent } from "@buddy/ui"
import { MessageSquareIcon } from "@/icons/app-icons"
import { readDesktopTitlebarBottomOffset } from "@/components/layout/desktop-titlebar-inset"
import { browserDocument, browserWindow } from "@/state/parse-external"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  resolveBenchLayoutDefaults,
  type BenchChatLayoutMode,
  type BenchLayoutProfileID,
} from "@/lib/bench-navigation"
import type { BenchFloatingChatState } from "@/components/bench/bench-route-context"
import type { SessionInfo } from "@/state/chat-types"
import {
  ThreadActionPill,
  ThreadParentReturnButton,
} from "@/components/directory-chat/thread-titlebar-controls"
import { TextShimmer } from "@/components/chat/tools/text-shimmer"
import { RIGHT_WORKSPACE_COLLAPSE_THRESHOLD_PX } from "@/lib/directory-chat/right-workspace-layout"

type DirectoryChatBenchPageLayoutProps = {
  chatLayoutMode: BenchChatLayoutMode
  layoutProfile: BenchLayoutProfileID
  floatingRect: FloatingChatRect
  floatingChatState: BenchFloatingChatState
  bench: ReactNode
  conversation: ReactNode
  onChatLayoutModeChange: (mode: BenchChatLayoutMode) => void
  onFloatingRectChange: (rect: FloatingChatRect) => void
  onFloatingChatStateChange: (state: BenchFloatingChatState) => void
  dockedBenchLayout: DirectoryChatDockedBenchLayout
  benchInteractive?: boolean
  suppressLayoutMotion?: boolean
  threadBrowserProps?: {
    sessionTitle: string
    notebookName?: string
    sessions: SessionInfo[]
    activeSessionID?: string
    linkedSessionID?: string
    parentSession?: SessionInfo
    isTurnActive?: boolean
    onNewSession: () => void | Promise<void>
    onSelectSession: (sessionID: string) => void | Promise<void>
  }
}

type DirectoryChatDockedBenchLayout = {
  open: boolean
  widthPx: number
  minWidthPx: number
  maxWidthPx: number
  onResizeIntent: (intent: ResizeHandleIntent) => void
  onCollapse: () => void
}

const BENCH_CHAT_RESTORE_LABEL = "Restore chat"
const FLOATING_CHAT_DEFAULT_CONTAINER_WIDTH_PX = 1280
const FLOATING_CHAT_DEFAULT_CONTAINER_HEIGHT_PX = 800
const FLOATING_CHAT_DEFAULT_SAFE_TOP_PX = 24
const INSTANT_LAYOUT_TRANSITION = {
  duration: 0,
} satisfies Transition
const FLOATING_CHAT_WINDOW_TRANSITION_DURATION_SECONDS = 0.26
const FLOATING_CHAT_WINDOW_TRANSITION = {
  type: "spring",
  duration: FLOATING_CHAT_WINDOW_TRANSITION_DURATION_SECONDS,
  bounce: 0.08,
} satisfies Transition
const ignoreClampedDockedBenchResize = () => undefined

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

function areFloatingChatRectsEqual(left: FloatingChatRect, right: FloatingChatRect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function hasUsableDimension(value: number) {
  return Number.isFinite(value) && value > 0
}

function benchViewportFromContainerSize(containerSize: FloatingChatContainerSize) {
  return {
    widthPx: containerSize.containerWidth,
    heightPx: containerSize.containerHeight,
    safeTopPx: containerSize.safeTop,
  }
}

function readFloatingChatSafeTop(layoutNode: HTMLElement | null) {
  if (!browserDocument()) {
    return FLOATING_CHAT_DEFAULT_SAFE_TOP_PX
  }

  const layoutTop = layoutNode?.getBoundingClientRect().top ?? 0
  const titlebarBottom = readDesktopTitlebarBottomOffset()
  return Math.max(
    FLOATING_CHAT_DEFAULT_SAFE_TOP_PX,
    titlebarBottom - layoutTop + FLOATING_CHAT_DEFAULT_SAFE_TOP_PX,
  )
}

export function resolveInitialFloatingChatContainerSize(): FloatingChatContainerSize {
  if (
    browserWindow() &&
    hasUsableDimension(window.innerWidth) &&
    hasUsableDimension(window.innerHeight)
  ) {
    return {
      containerWidth: window.innerWidth,
      containerHeight: window.innerHeight,
      safeTop: FLOATING_CHAT_DEFAULT_SAFE_TOP_PX,
    }
  }

  return {
    containerWidth: FLOATING_CHAT_DEFAULT_CONTAINER_WIDTH_PX,
    containerHeight: FLOATING_CHAT_DEFAULT_CONTAINER_HEIGHT_PX,
    safeTop: FLOATING_CHAT_DEFAULT_SAFE_TOP_PX,
  }
}

function readFloatingChatContainerSize(
  layoutNode: HTMLElement | null,
  fallback: FloatingChatContainerSize,
): FloatingChatContainerSize {
  if (!layoutNode) return fallback

  const rect = layoutNode.getBoundingClientRect()
  if (!hasUsableDimension(rect.width) || !hasUsableDimension(rect.height)) {
    return fallback
  }

  return {
    containerWidth: rect.width,
    containerHeight: rect.height,
    safeTop: readFloatingChatSafeTop(layoutNode),
  }
}

function resolveFloatingChatMinimumSize(
  containerSize: FloatingChatContainerSize,
  profile: BenchLayoutProfileID = BENCH_LAYOUT_PROFILE_DOCUMENT,
): FloatingChatMinimumSize {
  const defaults = resolveBenchLayoutDefaults({
    profile,
    viewport: benchViewportFromContainerSize(containerSize),
  })

  return {
    minWidth: defaults.floatingMinWidthPx,
    minHeight: defaults.floatingMinHeightPx,
  }
}

function clampFloatingChatSize(
  size: FloatingChatSize,
  containerSize: FloatingChatContainerSize,
  profile: BenchLayoutProfileID = BENCH_LAYOUT_PROFILE_DOCUMENT,
): FloatingChatSize {
  const defaults = resolveBenchLayoutDefaults({
    profile,
    viewport: benchViewportFromContainerSize(containerSize),
  })
  const availableWidth = Math.max(0, containerSize.containerWidth - defaults.floatingMarginPx * 2)
  const availableHeight = Math.max(
    0,
    containerSize.containerHeight - containerSize.safeTop - defaults.floatingMarginPx,
  )

  return {
    width: Math.min(availableWidth, Math.max(defaults.floatingMinWidthPx, size.width)),
    height: Math.min(availableHeight, Math.max(defaults.floatingMinHeightPx, size.height)),
  }
}

function resolveFloatingChatBounds(
  containerSize: FloatingChatContainerSize,
  size: FloatingChatSize,
  profile: BenchLayoutProfileID = BENCH_LAYOUT_PROFILE_DOCUMENT,
): FloatingChatBounds {
  const defaults = resolveBenchLayoutDefaults({
    profile,
    viewport: benchViewportFromContainerSize(containerSize),
  })

  return {
    containerWidth: containerSize.containerWidth,
    containerHeight: containerSize.containerHeight,
    width: size.width,
    height: size.height,
    margin: defaults.floatingMarginPx,
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

export function clampFloatingChatRect(
  rect: FloatingChatRect,
  containerSize: FloatingChatContainerSize,
  profile: BenchLayoutProfileID = BENCH_LAYOUT_PROFILE_DOCUMENT,
): FloatingChatRect {
  const size = clampFloatingChatSize(rect, containerSize, profile)
  const position = clampFloatingChatPosition(
    rect,
    resolveFloatingChatBounds(containerSize, size, profile),
  )

  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
  }
}

export function resolveDefaultFloatingChatRect(
  containerSize: FloatingChatContainerSize,
  profile: BenchLayoutProfileID = BENCH_LAYOUT_PROFILE_DOCUMENT,
): FloatingChatRect {
  return resolveBenchLayoutDefaults({
    profile,
    viewport: benchViewportFromContainerSize(containerSize),
  }).floatingRect
}

function resizeFloatingChatRect(input: {
  rect: FloatingChatRect
  direction: FloatingChatResizeDirection
  deltaX: number
  deltaY: number
  containerSize: FloatingChatContainerSize
  profile: BenchLayoutProfileID
}): FloatingChatRect {
  const defaults = resolveBenchLayoutDefaults({
    profile: input.profile,
    viewport: benchViewportFromContainerSize(input.containerSize),
  })
  const minimumSize = resolveFloatingChatMinimumSize(input.containerSize, input.profile)
  const maxRight = input.containerSize.containerWidth - defaults.floatingMarginPx
  const maxBottom = input.containerSize.containerHeight - defaults.floatingMarginPx
  let left = input.rect.x
  let top = input.rect.y
  let right = input.rect.x + input.rect.width
  let bottom = input.rect.y + input.rect.height

  if (input.direction.includes("e")) {
    right = Math.min(maxRight, right + input.deltaX)
  }
  if (input.direction.includes("w")) {
    left = Math.max(defaults.floatingMarginPx, left + input.deltaX)
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
    input.profile,
  )
}

export function BenchContent(props: { bordered: boolean; children: ReactNode }) {
  // Editors, canvases, and the transcript must observe the real layout size; transformed width
  // animations leave their ResizeObservers out of sync with what the user sees.
  return (
    <div
      className={cn(
        "min-w-0 h-full w-full bg-background-base [view-transition-name:buddy-bench-surface]",
        props.bordered ? "border-r border-border-weaker-base" : "",
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

function FloatingChatRestoreButton(props: {
  onRestore: () => void
  suppressLayoutMotion: boolean
}) {
  return (
    <motion.div
      data-component="directory-chat-floating-restore"
      initial={props.suppressLayoutMotion ? false : { opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={
        props.suppressLayoutMotion ? INSTANT_LAYOUT_TRANSITION : FLOATING_CHAT_WINDOW_TRANSITION
      }
      className="absolute bottom-6 right-6 z-40"
    >
      <Button
        type="button"
        size="icon"
        variant="secondary"
        data-action="directory-chat-restore"
        aria-label={BENCH_CHAT_RESTORE_LABEL}
        title={BENCH_CHAT_RESTORE_LABEL}
        className="size-10 rounded-full border border-border-base/70 bg-background-stronger shadow-[0_16px_48px_rgba(0,0,0,0.24)]"
        onClick={props.onRestore}
      >
        <MessageSquareIcon className="size-4" />
      </Button>
    </motion.div>
  )
}

export function DirectoryChatBenchPageLayout(props: DirectoryChatBenchPageLayoutProps) {
  const chatLayoutMode = props.chatLayoutMode
  const onFloatingChatStateChange = props.onFloatingChatStateChange
  const onFloatingRectChange = props.onFloatingRectChange
  const [containerSize, setContainerSize] = useState<FloatingChatContainerSize>(
    resolveInitialFloatingChatContainerSize,
  )
  const [floatingEntryAnimation, setFloatingEntryAnimation] = useState(
    chatLayoutMode !== BENCH_CHAT_LAYOUT_FLOATING,
  )
  const [floatingChatAnchored, setFloatingChatAnchored] = useState(true)
  const layoutRef = useRef<HTMLElement | null>(null)
  const benchHostRef = useRef<HTMLDivElement | null>(null)
  const conversationHostRef = useRef<HTMLDivElement | null>(null)
  const containerSizeRef = useRef(containerSize)
  const previousChatLayoutModeRef = useRef(chatLayoutMode)
  const floatingRect = props.floatingRect
  const floatingChatState = props.floatingChatState
  const isFloating = chatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING
  const isFloatingOpen = isFloating && floatingChatState === "open"
  const isFloatingMinimized = isFloating && floatingChatState === "minimized"
  const dockedBenchOpen = props.dockedBenchLayout.open
  const benchInteractive = props.benchInteractive ?? true
  const suppressLayoutMotion = props.suppressLayoutMotion ?? false
  const conversation = props.conversation
  const floatingLayoutDefaults = resolveBenchLayoutDefaults({
    profile: props.layoutProfile,
    viewport: benchViewportFromContainerSize(containerSize),
  })
  const displayedFloatingRect = floatingChatAnchored
    ? floatingLayoutDefaults.floatingRect
    : floatingRect
  const benchHostStyle = isFloating
    ? ({
        inset: 0,
      } satisfies CSSProperties)
    : ({
        top: 0,
        right: 0,
        bottom: 0,
        width: dockedBenchOpen ? props.dockedBenchLayout.widthPx : 0,
      } satisfies CSSProperties)
  const conversationHostStyle = isFloating
    ? floatingChatAnchored
      ? ({
          right: floatingLayoutDefaults.floatingMarginPx,
          bottom: floatingLayoutDefaults.floatingMarginPx,
          width: displayedFloatingRect.width,
          height: displayedFloatingRect.height,
          transformOrigin: "70% 100%",
        } satisfies CSSProperties)
      : ({
          left: displayedFloatingRect.x,
          top: displayedFloatingRect.y,
          width: displayedFloatingRect.width,
          height: displayedFloatingRect.height,
          transformOrigin: "70% 100%",
        } satisfies CSSProperties)
    : ({
        top: 0,
        right: dockedBenchOpen ? props.dockedBenchLayout.widthPx : 0,
        bottom: 0,
        left: 0,
      } satisfies CSSProperties)

  useEffect(() => {
    containerSizeRef.current = containerSize
  }, [containerSize])

  useLayoutEffect(() => {
    benchHostRef.current?.toggleAttribute("inert", !benchInteractive)
  }, [benchInteractive])

  useLayoutEffect(() => {
    conversationHostRef.current?.toggleAttribute("inert", isFloatingMinimized)
  }, [isFloatingMinimized])

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

    if (!("ResizeObserver" in globalThis)) {
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
    if (chatLayoutMode !== BENCH_CHAT_LAYOUT_FLOATING) return

    const nextRect = floatingChatAnchored
      ? resolveDefaultFloatingChatRect(containerSize, props.layoutProfile)
      : clampFloatingChatRect(floatingRect, containerSize, props.layoutProfile)
    if (!areFloatingChatRectsEqual(nextRect, floatingRect)) {
      onFloatingRectChange(nextRect)
    }
  }, [
    chatLayoutMode,
    containerSize,
    floatingChatAnchored,
    floatingRect,
    onFloatingRectChange,
    props.layoutProfile,
  ])

  useEffect(() => {
    if (chatLayoutMode === BENCH_CHAT_LAYOUT_DOCKED) {
      onFloatingChatStateChange("open")
    }
  }, [chatLayoutMode, onFloatingChatStateChange])

  useLayoutEffect(() => {
    const previousChatLayoutMode = previousChatLayoutModeRef.current
    previousChatLayoutModeRef.current = chatLayoutMode
    if (previousChatLayoutMode === chatLayoutMode) return

    if (chatLayoutMode === BENCH_CHAT_LAYOUT_FLOATING) {
      setFloatingChatAnchored(true)
      const nextContainerSize = readFloatingChatContainerSize(
        layoutRef.current,
        containerSizeRef.current,
      )
      setContainerSize(nextContainerSize)
      onFloatingRectChange(resolveDefaultFloatingChatRect(nextContainerSize, props.layoutProfile))
      setFloatingEntryAnimation(true)
      return
    }

    setFloatingEntryAnimation(true)
  }, [chatLayoutMode, onFloatingRectChange, props.layoutProfile])

  function readCurrentContainerSize() {
    return readFloatingChatContainerSize(layoutRef.current, containerSizeRef.current)
  }

  function dockChat() {
    onFloatingChatStateChange("open")
    setFloatingEntryAnimation(true)
    props.onChatLayoutModeChange(BENCH_CHAT_LAYOUT_DOCKED)
  }

  function startFloatingChatDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (
      target.closest("button") ||
      target.closest("a") ||
      target.closest("input") ||
      target.closest('[role="dialog"]') ||
      target.closest('[role="menu"]')
    ) {
      return
    }
    event.preventDefault()

    const startRect = floatingChatAnchored
      ? resolveDefaultFloatingChatRect(readCurrentContainerSize(), props.layoutProfile)
      : floatingRect
    if (floatingChatAnchored) {
      setFloatingChatAnchored(false)
      onFloatingRectChange(startRect)
    }

    const handle = event.currentTarget
    const pointerID = event.pointerId
    const startClientX = event.clientX
    const startClientY = event.clientY
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
      onFloatingRectChange(
        clampFloatingChatRect(
          {
            ...startRect,
            x: startRect.x + deltaX,
            y: startRect.y + deltaY,
          },
          nextContainerSize,
          props.layoutProfile,
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

    const startRect = floatingChatAnchored
      ? resolveDefaultFloatingChatRect(readCurrentContainerSize(), props.layoutProfile)
      : floatingRect
    if (floatingChatAnchored) {
      setFloatingChatAnchored(false)
      onFloatingRectChange(startRect)
    }

    const handle = event.currentTarget
    const pointerID = event.pointerId
    const startClientX = event.clientX
    const startClientY = event.clientY
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

      onFloatingRectChange(
        resizeFloatingChatRect({
          rect: startRect,
          direction,
          deltaX: moveEvent.clientX - startClientX,
          deltaY: moveEvent.clientY - startClientY,
          containerSize: readCurrentContainerSize(),
          profile: props.layoutProfile,
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
      data-component="directory-chat-bench-page-layout"
      data-layout-motion={isFloating && !suppressLayoutMotion ? "animated" : "instant"}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-raised-base"
    >
      <div
        ref={benchHostRef}
        data-component="directory-chat-bench-host"
        aria-hidden={!benchInteractive}
        className={cn(
          "absolute min-h-0 min-w-0 overflow-hidden",
          benchInteractive ? "" : "pointer-events-none opacity-0",
          !isFloating ? "border-l border-border-weaker-base" : "",
          !isFloating ? "transition-none" : "",
        )}
        style={benchHostStyle}
      >
        <BenchContent bordered={false}>{props.bench}</BenchContent>
        {!isFloating && dockedBenchOpen ? (
          <ResizeHandle
            data-component="directory-chat-docked-bench-resize-handle"
            direction="horizontal"
            edge="start"
            size={props.dockedBenchLayout.widthPx}
            min={props.dockedBenchLayout.minWidthPx}
            max={props.dockedBenchLayout.maxWidthPx}
            collapseThreshold={RIGHT_WORKSPACE_COLLAPSE_THRESHOLD_PX}
            onResize={ignoreClampedDockedBenchResize}
            onResizeIntent={props.dockedBenchLayout.onResizeIntent}
            onCollapse={props.dockedBenchLayout.onCollapse}
          />
        ) : null}
      </div>
      <motion.div
        ref={conversationHostRef}
        data-component={
          isFloating ? "directory-chat-floating-window" : "directory-chat-docked-window"
        }
        data-mode={isFloating ? BENCH_CHAT_LAYOUT_FLOATING : BENCH_CHAT_LAYOUT_DOCKED}
        aria-hidden={isFloatingMinimized}
        style={conversationHostStyle}
        initial={
          !suppressLayoutMotion && floatingEntryAnimation && isFloating
            ? { opacity: 0, scale: 0.95, y: 22 }
            : false
        }
        animate={
          isFloating
            ? {
                opacity: isFloatingOpen ? 1 : 0,
                scale: isFloatingOpen ? 1 : 0.97,
                y: isFloatingOpen ? 0 : 16,
              }
            : { opacity: 1, scale: 1, y: 0 }
        }
        transition={
          suppressLayoutMotion
            ? INSTANT_LAYOUT_TRANSITION
            : isFloating
              ? FLOATING_CHAT_WINDOW_TRANSITION
              : INSTANT_LAYOUT_TRANSITION
        }
        className={cn(
          "absolute z-30 flex min-h-0 min-w-0 overflow-hidden",
          isFloating
            ? "rounded-2xl border border-border-base/70 bg-background-stronger shadow-lg"
            : "bg-background-base transition-none",
          isFloatingMinimized && "pointer-events-none",
        )}
      >
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
          {isFloating ? (
            /*
             * Compact window chrome: the floating layout exists to give the bench room, so this
             * bar stays at 36px with flat `chrome="plain"` controls. Pill halos here would nest a
             * bordered capsule inside an already-bordered bar and cost height for no information.
             *
             * Grouping comes from spacing alone, on one scale: adjacent controls touch (their
             * 24px hit areas hold the 14px glyphs apart), and the only real gap — 8px — separates
             * a control cluster from the title. Any gap between the icons flattens that contrast
             * and the bar reads as loose specks rather than two clusters flanking a title.
             *
             * The 8px inset keeps the leading control clear of the window's `rounded-2xl` arc.
             *
             * No fill of its own: the header inherits the window's surface and is separated by a
             * hairline alone. A distinct raised band across a 36px strip cuts a small window into
             * two slabs, which is what made the chrome read as bolted on rather than part of it.
             */
            <div
              className="flex h-9 shrink-0 items-center gap-2 border-b border-border-weaker-base/70 px-2 cursor-grab active:cursor-grabbing select-none"
              onPointerDown={startFloatingChatDrag}
            >
              <ThreadParentReturnButton
                parentSession={props.threadBrowserProps?.parentSession}
                onSelectSession={props.threadBrowserProps?.onSelectSession}
                size="compact"
                className="[-webkit-app-region:no-drag]"
              />

              {props.threadBrowserProps ? (
                <div className="flex min-w-0 max-w-[34rem] shrink items-center gap-2">
                  {/* History is a real button here, matching the docked titlebar: the title is a
                      label, not a trigger. Hover-opening a popover off the title made the list
                      appear while the pointer was only passing through the header. */}
                  <ThreadActionPill
                    sessions={props.threadBrowserProps.sessions}
                    activeSessionID={props.threadBrowserProps.activeSessionID}
                    linkedSessionID={props.threadBrowserProps.linkedSessionID}
                    onSelectSession={props.threadBrowserProps.onSelectSession}
                    notebookName={props.threadBrowserProps.notebookName}
                    onNewSession={props.threadBrowserProps.onNewSession}
                    chrome="plain"
                    size="compact"
                    className="[-webkit-app-region:no-drag]"
                  />
                  {/* One step off the icons, not two: `text-base` weight-medium made the title the
                      loudest thing in a bar whose job is to stay quiet under the conversation. */}
                  <span className="min-w-0 shrink truncate text-xs font-medium tracking-tight text-text-weak">
                    <TextShimmer
                      text={props.threadBrowserProps.sessionTitle}
                      active={props.threadBrowserProps.isTurnActive ?? false}
                    />
                  </span>
                </div>
              ) : null}

              {/* `ml-auto` rather than a flex-1 spacer: a spacer element sits between two `gap-2`
                  gaps, so the window controls end up 8px further out than the 8px inset. */}
              <ThreadActionPill
                sessions={[]}
                onSelectSession={() => undefined}
                onMinimizeChat={() => onFloatingChatStateChange("minimized")}
                onDockChat={dockChat}
                showHistory={false}
                chrome="plain"
                size="compact"
                className="ml-auto [-webkit-app-region:no-drag]"
              />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">{conversation}</div>
        </div>
        {isFloating ? (
          <>
            <FloatingChatResizeHandle
              direction="n"
              className="inset-x-6 top-0 h-2 -translate-y-1/2 cursor-ns-resize before:h-[3px] before:top-1/2 before:-translate-y-1/2"
              onResizeStart={startFloatingChatResize}
            />
            <FloatingChatResizeHandle
              direction="s"
              className="inset-x-6 bottom-0 h-2 translate-y-1/2 cursor-ns-resize before:h-[3px] before:top-1/2 before:-translate-y-1/2"
              onResizeStart={startFloatingChatResize}
            />
            <FloatingChatResizeHandle
              direction="e"
              className="inset-y-6 right-0 w-2 translate-x-1/2 cursor-ew-resize before:left-1/2 before:w-[3px] before:-translate-x-1/2"
              onResizeStart={startFloatingChatResize}
            />
            <FloatingChatResizeHandle
              direction="w"
              className="inset-y-6 left-0 w-2 -translate-x-1/2 cursor-ew-resize before:left-1/2 before:w-[3px] before:-translate-x-1/2"
              onResizeStart={startFloatingChatResize}
            />
            <FloatingChatResizeHandle
              direction="ne"
              className="right-0 top-0 size-5 -translate-y-1/2 translate-x-1/2 cursor-nesw-resize"
              onResizeStart={startFloatingChatResize}
            />
            <FloatingChatResizeHandle
              direction="nw"
              className="left-0 top-0 size-5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"
              onResizeStart={startFloatingChatResize}
            />
            <FloatingChatResizeHandle
              direction="se"
              className="bottom-0 right-0 size-5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"
              onResizeStart={startFloatingChatResize}
            />
            <FloatingChatResizeHandle
              direction="sw"
              className="bottom-0 left-0 size-5 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"
              onResizeStart={startFloatingChatResize}
            />
          </>
        ) : null}
      </motion.div>
      {isFloatingMinimized ? (
        <FloatingChatRestoreButton
          key="directory-chat-floating-restore"
          onRestore={() => onFloatingChatStateChange("open")}
          suppressLayoutMotion={suppressLayoutMotion}
        />
      ) : null}
    </section>
  )
}
