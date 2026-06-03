import { animate, type AnimationPlaybackControls } from "motion"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react"

/**
 * Threshold (in px) from the bottom at which we consider the user "at the bottom".
 * Vendor uses 10px. We use 20px to account for sub-pixel rounding and padding.
 */
const BOTTOM_THRESHOLD_PX = 20
const SCROLL_GESTURE_WINDOW_MS = 250
const USER_DETACH_COOLDOWN_MS = 300

/**
 * Auto-scroll marker expiry. After a programmatic scrollTo, we mark
 * the expected scrollTop so the scroll handler can distinguish it from
 * user scrolling.
 */
const AUTO_SCROLL_MARKER_TTL_MS = 1500

/**
 * Animation speed for the "scroll to bottom" button (not streaming follow).
 */
const SCROLL_ANIMATION_SPEED_PX_PER_S = 1200
const MIN_SCROLL_ANIMATION_DURATION_S = 0.08
const MAX_SCROLL_ANIMATION_DURATION_S = 0.24

const SCROLL_TOP_CHANGE_THRESHOLD_PX = 1
const FINAL_RENDER_SETTLE_FRAMES = 6

const SCROLL_DETACH_KEYS = new Set(["ArrowUp", "PageUp", "Home", " "])

const SCROLL_GESTURE_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
])

// ─── Helpers ──────────────────────────────────────────────────────────

function canScroll(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight > 1
}

function distanceFromBottom(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight - el.scrollTop
}

function normalizeWheelDelta(input: { deltaY: number; deltaMode: number; rootHeight: number }) {
  if (input.deltaMode === 1) return input.deltaY * 40
  if (input.deltaMode === 2) return input.deltaY * input.rootHeight
  return input.deltaY
}

function shouldMarkBoundaryGesture(input: {
  delta: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}) {
  const max = input.scrollHeight - input.clientHeight
  if (max <= 1) return true
  if (!input.delta) return false

  if (input.delta < 0) return input.scrollTop + input.delta <= 0

  const remaining = max - input.scrollTop
  return input.delta > remaining
}

function boundaryTarget(root: HTMLElement, target: EventTarget | null) {
  const current = target instanceof Element ? target : undefined
  const nested = current?.closest("[data-scrollable]")
  if (!nested || nested === root) return root
  if (!(nested instanceof HTMLElement)) return root
  return nested
}

function shouldMarkRootGesture(input: {
  root: HTMLElement
  target: EventTarget | null
  delta: number
}) {
  const target = boundaryTarget(input.root, input.target)
  if (target === input.root) return true

  return shouldMarkBoundaryGesture({
    delta: input.delta,
    scrollTop: target.scrollTop,
    scrollHeight: target.scrollHeight,
    clientHeight: target.clientHeight,
  })
}

// ─── Types ────────────────────────────────────────────────────────────

type AutoScrollOptions = {
  /** Whether the agent is currently generating (streaming) content. */
  working: boolean
  /** Reactive dependency that triggers re-scroll (e.g. messages array). */
  contentDep: unknown
  /** Called when the user manually scrolls away from the bottom. */
  onUserScrolled?: () => void
}

type AutoScrollResult = {
  /** Attach to the scrollable container element. */
  scrollRef: React.RefObject<HTMLElement | null>
  /** Attach to the scroll content element. */
  contentRef: React.RefObject<HTMLElement | null>
  /** Whether the user has scrolled away from the bottom. */
  userScrolled: boolean
  /** Call from the container's onScroll handler. */
  handleScroll: (event: React.UIEvent<HTMLElement>) => void
  /** Call from the container's onWheel handler. */
  handleWheel: (event: ReactWheelEvent<HTMLElement>) => void
  /** Call from the container's onKeyDown handler. */
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
  /** Call from the container's onPointerDown handler. */
  handlePointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  /** Call from the container's touch handlers. */
  handleTouchStart: (event: ReactTouchEvent<HTMLElement>) => void
  handleTouchMove: (event: ReactTouchEvent<HTMLElement>) => void
  handleTouchEnd: () => void
  handleTouchCancel: () => void
  /** Call from content interactions that should pause auto-follow. */
  handleInteraction: () => void
  /** Pause auto-follow without forcing a scroll. */
  pause: () => void
  /** Force re-engagement and scroll to bottom (e.g. on send). */
  forceScrollToBottom: () => void
  /**
   * Animated scroll to bottom for "scroll to bottom" button.
   * Uses motion animation for a polished feel.
   */
  scrollToBottom: () => void
  /** Snap to bottom instantly and re-engage. For thread switches. */
  snapToBottomForThreadSwitch: () => void
  /** Keep bottom pinned across a short final-render settle window. */
  settleToBottom: () => void
}

export function useAutoScroll(options: AutoScrollOptions): AutoScrollResult {
  const scrollRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const onUserScrolled = options.onUserScrolled

  // ─── Refs (synchronous, no render) ──────────────────────────────
  const userScrolledRef = useRef(false)
  const autoMarkerRef = useRef<{ top: number; time: number } | undefined>(undefined)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const animationRef = useRef<AnimationPlaybackControls | null>(null)
  const scrollGestureUntilRef = useRef(0)
  const touchGestureYRef = useRef<number | undefined>(undefined)
  const userDetachUntilRef = useRef(0)
  const lastScrollTopRef = useRef<number | undefined>(undefined)
  const resizeScrollFrameRef = useRef<number | undefined>(undefined)
  const settleScrollFrameRef = useRef<number | undefined>(undefined)
  const settleScrollRemainingFramesRef = useRef(0)
  const previousWorkingRef = useRef(options.working)

  // ─── State (triggers re-render for UI, e.g. "scroll to bottom" button) ──
  const [userScrolled, setUserScrolled] = useState(false)

  // ─── Derived ────────────────────────────────────────────────────
  const hasScrollGesture = () => Date.now() < scrollGestureUntilRef.current

  const markScrollGesture = useCallback(() => {
    scrollGestureUntilRef.current = Date.now() + SCROLL_GESTURE_WINDOW_MS
  }, [])

  // ─── Auto-scroll marker ─────────────────────────────────────────
  // After we programmatically set scrollTop, mark the expected position
  // so the scroll handler can distinguish it from user scrolling.

  const markAuto = useCallback(
    (el: HTMLElement, top = Math.max(0, el.scrollHeight - el.clientHeight)) => {
      autoMarkerRef.current = {
        top,
        time: Date.now(),
      }
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
      autoTimerRef.current = setTimeout(() => {
        autoMarkerRef.current = undefined
        autoTimerRef.current = undefined
      }, AUTO_SCROLL_MARKER_TTL_MS)
    },
    [],
  )

  const isAuto = useCallback((el: HTMLElement) => {
    const a = autoMarkerRef.current
    if (!a) return false
    if (Date.now() - a.time > AUTO_SCROLL_MARKER_TTL_MS) {
      autoMarkerRef.current = undefined
      return false
    }
    return Math.abs(el.scrollTop - a.top) < 2
  }, [])

  // ─── Overflow anchor ────────────────────────────────────────────
  const updateOverflowAnchor = useCallback((el: HTMLElement, scrolledAway: boolean) => {
    // When following the bottom, disable browser overflow anchoring so
    // our manual scrollTop updates aren't fought by the browser.
    // When the user has scrolled up, enable it to keep their reading
    // position stable as content grows above.
    el.style.overflowAnchor = scrolledAway ? "auto" : "none"
  }, [])

  // ─── Core state transitions ─────────────────────────────────────

  const setScrolledAway = useCallback(
    (next: boolean, el: HTMLElement | null = scrollRef.current, userInitiated = false) => {
      userScrolledRef.current = next
      setUserScrolled(next)
      if (el) updateOverflowAnchor(el, next)

      if (next) {
        if (userInitiated) {
          userDetachUntilRef.current = Date.now() + USER_DETACH_COOLDOWN_MS
        }
        // Detaching: clear auto markers so scroll handler doesn't
        // mistake programmatic scrolls in progress.
        if (autoTimerRef.current) {
          clearTimeout(autoTimerRef.current)
          autoMarkerRef.current = undefined
          autoTimerRef.current = undefined
        }
      }
    },
    [updateOverflowAnchor],
  )

  // ─── Stop animation ─────────────────────────────────────────────

  const stopAnimation = useCallback(() => {
    animationRef.current?.stop()
    animationRef.current = null
  }, [])

  const pause = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (!canScroll(el)) {
      if (userScrolledRef.current) {
        setScrolledAway(false, el)
      }
      return
    }
    if (userScrolledRef.current) return
    stopAnimation()
    setScrolledAway(true, el, true)
    onUserScrolled?.()
  }, [onUserScrolled, setScrolledAway, stopAnimation])

  // ─── Scroll to bottom (instant, for streaming follow) ───────────

  const scrollToBottomInstant = useCallback(
    (el: HTMLElement) => {
      stopAnimation()
      const top = Math.max(0, el.scrollHeight - el.clientHeight)
      markAuto(el, top)
      lastScrollTopRef.current = top
      el.scrollTop = top
    },
    [markAuto, stopAnimation],
  )

  const cancelResizeScrollFrame = useCallback(() => {
    if (resizeScrollFrameRef.current === undefined) return
    window.cancelAnimationFrame(resizeScrollFrameRef.current)
    resizeScrollFrameRef.current = undefined
  }, [])

  const scheduleResizeScrollToBottom = useCallback(
    (el: HTMLElement) => {
      if (resizeScrollFrameRef.current !== undefined) return

      resizeScrollFrameRef.current = window.requestAnimationFrame(() => {
        resizeScrollFrameRef.current = undefined
        if (userScrolledRef.current) return
        scrollToBottomInstant(el)
      })
    },
    [scrollToBottomInstant],
  )

  const cancelSettleScrollFrames = useCallback(() => {
    settleScrollRemainingFramesRef.current = 0
    if (settleScrollFrameRef.current === undefined) return
    window.cancelAnimationFrame(settleScrollFrameRef.current)
    settleScrollFrameRef.current = undefined
  }, [])

  const scheduleSettleScrollToBottom = useCallback(
    (frameCount = FINAL_RENDER_SETTLE_FRAMES) => {
      const el = scrollRef.current
      if (!el || userScrolledRef.current) return
      settleScrollRemainingFramesRef.current = Math.max(
        settleScrollRemainingFramesRef.current,
        frameCount,
      )
      if (settleScrollFrameRef.current !== undefined) return

      const tick = () => {
        settleScrollFrameRef.current = undefined
        if (userScrolledRef.current) {
          settleScrollRemainingFramesRef.current = 0
          return
        }
        const container = scrollRef.current
        if (!container) {
          settleScrollRemainingFramesRef.current = 0
          return
        }
        scrollToBottomInstant(container)
        settleScrollRemainingFramesRef.current -= 1
        if (settleScrollRemainingFramesRef.current <= 0) return
        settleScrollFrameRef.current = window.requestAnimationFrame(tick)
      }

      settleScrollFrameRef.current = window.requestAnimationFrame(tick)
    },
    [scrollToBottomInstant],
  )

  // ─── Scroll to bottom (animated, for button click) ──────────────

  const scrollToBottomAnimated = useCallback(() => {
    const el = scrollRef.current
    if (!el) return

    const target = Math.max(0, el.scrollHeight - el.clientHeight)
    const current = el.scrollTop
    if (Math.abs(target - current) < 1) {
      stopAnimation()
      return
    }
    if (target <= current) {
      stopAnimation()
      el.scrollTop = target
      return
    }

    stopAnimation()
    const duration = Math.max(
      MIN_SCROLL_ANIMATION_DURATION_S,
      Math.min(
        MAX_SCROLL_ANIMATION_DURATION_S,
        (target - current) / SCROLL_ANIMATION_SPEED_PX_PER_S,
      ),
    )
    animationRef.current = animate(current, target, {
      duration,
      ease: "linear",
      onUpdate: (latest) => {
        const container = scrollRef.current
        if (!container) return
        container.scrollTop = Math.max(current, Math.min(target, latest))
      },
      onComplete: () => {
        animationRef.current = null
      },
    })
  }, [stopAnimation])

  // ─── Force scroll to bottom (on send, on thread switch) ─────────

  const forceScrollToBottom = useCallback(() => {
    setScrolledAway(false)
    const el = scrollRef.current
    if (el) scrollToBottomInstant(el)
  }, [scrollToBottomInstant, setScrolledAway])

  const scrollToBottom = useCallback(() => {
    setScrolledAway(false)
    scrollToBottomAnimated()
  }, [scrollToBottomAnimated, setScrolledAway])

  const snapToBottomForThreadSwitch = useCallback(() => {
    stopAnimation()
    cancelResizeScrollFrame()
    cancelSettleScrollFrames()
    setScrolledAway(false)
    const el = scrollRef.current
    if (el) scrollToBottomInstant(el)
  }, [
    cancelResizeScrollFrame,
    cancelSettleScrollFrames,
    scrollToBottomInstant,
    setScrolledAway,
    stopAnimation,
  ])

  const settleToBottom = useCallback(() => {
    scheduleSettleScrollToBottom()
  }, [scheduleSettleScrollToBottom])

  // ─── Streaming follow via content changes ───────────────────────
  // While the user remains attached, every transcript mutation should
  // preserve the bottom anchor. ResizeObserver below catches late height
  // changes from measurement, markdown, and media rendering.

  useLayoutEffect(() => {
    if (userScrolledRef.current) return
    const el = scrollRef.current
    if (!el) return
    scrollToBottomInstant(el)
  }, [options.contentDep, options.working, scrollToBottomInstant])

  useLayoutEffect(() => {
    const wasWorking = previousWorkingRef.current
    previousWorkingRef.current = options.working
    if (wasWorking && !options.working) {
      scheduleSettleScrollToBottom()
    }
  }, [options.working, scheduleSettleScrollToBottom])

  // ─── ResizeObserver: catch height changes from rendering ────────

  useLayoutEffect(() => {
    const container = scrollRef.current
    const content = contentRef.current
    if (!(container instanceof HTMLElement) || !(content instanceof HTMLElement)) return

    const observer = new ResizeObserver(() => {
      if (userScrolledRef.current) return
      scheduleResizeScrollToBottom(container)
    })
    observer.observe(content)

    return () => {
      observer.disconnect()
      cancelResizeScrollFrame()
    }
  }, [cancelResizeScrollFrame, scheduleResizeScrollToBottom])

  // ─── Overflow anchor sync ───────────────────────────────────────

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateOverflowAnchor(el, userScrolled)
  }, [userScrolled, updateOverflowAnchor])

  // ─── Stop animation when user detaches ──────────────────────────

  useEffect(() => {
    if (userScrolled) stopAnimation()
  }, [userScrolled, stopAnimation])

  // ─── Wheel handler: detect user scrolling up ────────────────────

  // ─── Cleanup ────────────────────────────────────────────────────

  useEffect(
    () => () => {
      stopAnimation()
      cancelResizeScrollFrame()
      cancelSettleScrollFrames()
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    },
    [cancelResizeScrollFrame, cancelSettleScrollFrames, stopAnimation],
  )

  // ─── Scroll handler ────────────────────────────────────────────

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const el = event.currentTarget
      const previousScrollTop = lastScrollTopRef.current
      lastScrollTopRef.current = el.scrollTop
      const scrollTopChanged =
        previousScrollTop !== undefined &&
        Math.abs(el.scrollTop - previousScrollTop) > SCROLL_TOP_CHANGE_THRESHOLD_PX

      if (!canScroll(el)) {
        if (userScrolledRef.current) {
          setScrolledAway(false, el)
        }
        return
      }

      const dist = distanceFromBottom(el)

      if (userScrolledRef.current && Date.now() < userDetachUntilRef.current) {
        return
      }

      if (dist <= BOTTOM_THRESHOLD_PX) {
        if (userScrolledRef.current) {
          setScrolledAway(false, el)
        }
        return
      }

      // Scroll event during our own animation: ignore.
      if (animationRef.current && !userScrolledRef.current) {
        return
      }

      // Scroll event from our own programmatic scroll: re-trigger.
      if (!userScrolledRef.current && isAuto(el)) {
        return
      }

      if (!hasScrollGesture()) {
        if (!userScrolledRef.current && scrollTopChanged) {
          pause()
        }
        return
      }

      pause()
    },
    [isAuto, pause, setScrolledAway],
  )

  const handleInteraction = useCallback(() => {
    if (userScrolledRef.current) return
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) {
      pause()
    }
  }, [pause])

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      const root = event.currentTarget
      const delta = normalizeWheelDelta({
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        rootHeight: root.clientHeight,
      })
      if (!delta) return
      if (!shouldMarkRootGesture({ root, target: event.target, delta })) return

      markScrollGesture()
      if (delta < 0) {
        pause()
      }
    },
    [markScrollGesture, pause],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!SCROLL_GESTURE_KEYS.has(event.key)) {
        return
      }
      markScrollGesture()
      if (event.key === " " && !event.shiftKey) {
        return
      }
      if (SCROLL_DETACH_KEYS.has(event.key)) {
        pause()
      }
    },
    [markScrollGesture, pause],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) {
        markScrollGesture()
      }
    },
    [markScrollGesture],
  )

  const handleTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    touchGestureYRef.current = event.touches[0]?.clientY
  }, [])

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const nextY = event.touches[0]?.clientY
      const previousY = touchGestureYRef.current
      touchGestureYRef.current = nextY
      if (nextY === undefined || previousY === undefined) return

      const delta = previousY - nextY
      if (!delta) return
      if (!shouldMarkRootGesture({ root: event.currentTarget, target: event.target, delta })) return

      markScrollGesture()
    },
    [markScrollGesture],
  )

  const handleTouchEnd = useCallback(() => {
    touchGestureYRef.current = undefined
  }, [])

  const handleTouchCancel = useCallback(() => {
    touchGestureYRef.current = undefined
  }, [])

  return {
    scrollRef,
    contentRef,
    userScrolled,
    handleScroll,
    handleWheel,
    handleKeyDown,
    handlePointerDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleInteraction,
    pause,
    forceScrollToBottom,
    scrollToBottom,
    snapToBottomForThreadSwitch,
    settleToBottom,
  }
}
