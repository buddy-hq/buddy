import { animate, type AnimationPlaybackControls } from "motion"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * Threshold (in px) from the bottom at which we consider the user "at the bottom".
 * Vendor uses 10px. We use 20px to account for sub-pixel rounding and padding.
 */
const BOTTOM_THRESHOLD_PX = 20

/**
 * After a user-initiated detach (wheel-up / pointer-select), ignore
 * scroll-handler re-engagement for this long. Prevents the feedback
 * loop where programmatic scroll positioning keeps the user pinned.
 */
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

/**
 * After streaming ends, keep scrolling for a brief settle window
 * so late-arriving content (e.g. markdown rendering) is caught.
 */
const SETTLE_DURATION_MS = 300

/**
 * Thread-switch snap window: after switching sessions, snap instantly
 * to the bottom for this duration to avoid visible scroll animation.
 */
const THREAD_SWITCH_SNAP_WINDOW_MS = 350

// ─── Helpers ──────────────────────────────────────────────────────────

function canScroll(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight > 1
}

function distanceFromBottom(el: HTMLElement) {
  return el.scrollHeight - el.clientHeight - el.scrollTop
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
  /** Whether the user has scrolled away from the bottom. */
  userScrolled: boolean
  /** Call from the container's onScroll handler. */
  handleScroll: (event: React.UIEvent<HTMLElement>) => void
  /** Force re-engagement and scroll to bottom (e.g. on send). */
  forceScrollToBottom: () => void
  /**
   * Animated scroll to bottom for "scroll to bottom" button.
   * Uses motion animation for a polished feel.
   */
  scrollToBottom: () => void
  /** Snap to bottom instantly and re-engage. For thread switches. */
  snapToBottomForThreadSwitch: () => void
}

export function useAutoScroll(options: AutoScrollOptions): AutoScrollResult {
  const scrollRef = useRef<HTMLElement | null>(null)

  // ─── Refs (synchronous, no render) ──────────────────────────────
  const userScrolledRef = useRef(false)
  const workingRef = useRef(options.working)
  const settlingRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoMarkerRef = useRef<{ top: number; time: number } | undefined>(undefined)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const userDetachUntilRef = useRef(0)
  const animationRef = useRef<AnimationPlaybackControls | null>(null)
  const threadSwitchSnapUntilRef = useRef(0)

  // ─── State (triggers re-render for UI, e.g. "scroll to bottom" button) ──
  const [userScrolled, setUserScrolled] = useState(false)

  // ─── Derived ────────────────────────────────────────────────────
  const active = () => workingRef.current || settlingRef.current

  // ─── Auto-scroll marker ─────────────────────────────────────────
  // After we programmatically set scrollTop, mark the expected position
  // so the scroll handler can distinguish it from user scrolling.

  const markAuto = useCallback((el: HTMLElement) => {
    autoMarkerRef.current = {
      top: Math.max(0, el.scrollHeight - el.clientHeight),
      time: Date.now(),
    }
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = setTimeout(() => {
      autoMarkerRef.current = undefined
      autoTimerRef.current = undefined
    }, AUTO_SCROLL_MARKER_TTL_MS)
  }, [])

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
        // Detaching: clear auto markers so scroll handler doesn't
        // mistake programmatic scrolls in progress.
        if (userInitiated) {
          userDetachUntilRef.current = Date.now() + USER_DETACH_COOLDOWN_MS
        }
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

  // ─── Scroll to bottom (instant, for streaming follow) ───────────

  const scrollToBottomInstant = useCallback(
    (el: HTMLElement) => {
      stopAnimation()
      el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight)
      markAuto(el)
    },
    [markAuto, stopAnimation],
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
    threadSwitchSnapUntilRef.current = Date.now() + THREAD_SWITCH_SNAP_WINDOW_MS
    stopAnimation()
    setScrolledAway(false)
  }, [setScrolledAway, stopAnimation])

  // ─── Streaming follow via content changes ───────────────────────
  // This replaces the old smooth-follow RAF loop. On every content change
  // (message array update or isBusy toggle), we just snap to the bottom
  // if we're following. ResizeObserver below handles mid-frame catches.

  useLayoutEffect(() => {
    if (userScrolledRef.current) return
    const el = scrollRef.current
    if (!el) return

    if (Date.now() < threadSwitchSnapUntilRef.current) {
      scrollToBottomInstant(el)
      return
    }

    if (!active()) return
    scrollToBottomInstant(el)
  }, [options.contentDep, options.working, scrollToBottomInstant])

  // ─── ResizeObserver: catch height changes from rendering ────────

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const content = container.firstElementChild
    if (!(content instanceof HTMLElement)) return

    const observer = new ResizeObserver(() => {
      if (userScrolledRef.current) return
      scrollToBottomInstant(container)
    })
    observer.observe(container)
    observer.observe(content)

    return () => observer.disconnect()
  }, [scrollToBottomInstant])

  // ─── Track working → settling transition ────────────────────────

  useEffect(() => {
    workingRef.current = options.working
    if (options.working) {
      settlingRef.current = false
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = undefined
      }
    } else {
      settlingRef.current = true
      settleTimerRef.current = setTimeout(() => {
        settlingRef.current = false
        settleTimerRef.current = undefined
      }, SETTLE_DURATION_MS)
    }
  }, [options.working])

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

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0) return
      const target = e.target instanceof Element ? e.target : undefined
      const nested = target?.closest("[data-scrollable]")
      if (nested && nested !== container) return
      if (userScrolledRef.current) return
      stopAnimation()
      setScrolledAway(true, container, true)
    }

    container.addEventListener("wheel", handleWheel, { passive: true })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [setScrolledAway, stopAnimation])

  // ─── Pointer handler: detect text selection ─────────────────────

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleInteraction = () => {
      const selection = window.getSelection()
      if (selection && selection.toString().length > 0) {
        if (userScrolledRef.current) return
        stopAnimation()
        setScrolledAway(true, container, true)
      }
    }

    container.addEventListener("pointerdown", handleInteraction, { capture: true })
    return () => container.removeEventListener("pointerdown", handleInteraction, { capture: true })
  }, [setScrolledAway, stopAnimation])

  // ─── Cleanup ────────────────────────────────────────────────────

  useEffect(
    () => () => {
      stopAnimation()
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    },
    [stopAnimation],
  )

  // ─── Scroll handler ────────────────────────────────────────────

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const el = event.currentTarget
      const inCooldown = Date.now() < userDetachUntilRef.current

      // Non-scrollable container: always re-engage unless in cooldown.
      if (!canScroll(el)) {
        if (userScrolledRef.current && !inCooldown) {
          setScrolledAway(false, el)
        }
        return
      }

      const dist = distanceFromBottom(el)

      // Near bottom: re-engage unless in cooldown.
      if (dist <= BOTTOM_THRESHOLD_PX) {
        if (userScrolledRef.current && !inCooldown) {
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
        scrollToBottomInstant(el)
        return
      }

      // User has scrolled away from the bottom.
      stopAnimation()
      setScrolledAway(true, el)
    },
    [isAuto, scrollToBottomInstant, setScrolledAway, stopAnimation],
  )

  return {
    scrollRef,
    userScrolled,
    handleScroll,
    forceScrollToBottom,
    scrollToBottom,
    snapToBottomForThreadSwitch,
  }
}
