import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  type WheelEvent as ReactWheelEvent,
} from "react"

const ATTACHED_BOTTOM_THRESHOLD_PX = 20
const JUMP_TO_LATEST_DISTANCE_THRESHOLD_PX = 400
const SCROLL_GESTURE_WINDOW_MS = 250
const PROGRAMMATIC_SCROLL_MARKER_TTL_MS = 1_500
const SCROLL_TOP_CHANGE_THRESHOLD_PX = 1
const SCROLL_WHEEL_LINE_HEIGHT_PX = 40
const SCROLL_DETACH_KEYS = new Set(["ArrowUp", "PageUp", "Home", " "])

function canScroll(element: HTMLElement) {
  return element.scrollHeight - element.clientHeight > SCROLL_TOP_CHANGE_THRESHOLD_PX
}

function bottomScrollTop(element: HTMLElement) {
  return Math.max(0, element.scrollHeight - element.clientHeight)
}

function distanceFromBottom(element: HTMLElement) {
  return bottomScrollTop(element) - element.scrollTop
}

function jumpToLatestThreshold(element: HTMLElement) {
  return Math.min(element.clientHeight, JUMP_TO_LATEST_DISTANCE_THRESHOLD_PX)
}

function shouldShowJumpToLatest(element: HTMLElement) {
  return distanceFromBottom(element) >= jumpToLatestThreshold(element)
}

function normalizeWheelDelta(input: { deltaY: number; deltaMode: number; rootHeight: number }) {
  if (input.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return input.deltaY * SCROLL_WHEEL_LINE_HEIGHT_PX
  }
  if (input.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return input.deltaY * input.rootHeight
  }
  return input.deltaY
}

function shouldMarkBoundaryGesture(input: {
  delta: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}) {
  const max = input.scrollHeight - input.clientHeight
  if (max <= SCROLL_TOP_CHANGE_THRESHOLD_PX) return true
  if (!input.delta) return false

  if (input.delta < 0) return input.scrollTop + input.delta <= 0

  const remaining = max - input.scrollTop
  return input.delta > remaining
}

function boundaryTarget(root: HTMLElement, target: EventTarget | null) {
  const current = target instanceof Element ? target : undefined
  const nested = current?.closest("[data-scrollable]")
  if (!nested || nested === root) return root
  return nested instanceof HTMLElement ? nested : root
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

type AutoScrollOptions = {
  onUserScrolled?: () => void
}

type AutoScrollResult = {
  scrollRef: React.RefObject<HTMLElement | null>
  showJumpToLatest: boolean
  handleScroll: (event: React.UIEvent<HTMLElement>) => void
  handleWheel: (event: ReactWheelEvent<HTMLElement>) => void
  handleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
  handlePointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  handleTouchStart: (event: ReactTouchEvent<HTMLElement>) => void
  handleTouchMove: (event: ReactTouchEvent<HTMLElement>) => void
  handleTouchEnd: () => void
  handleTouchCancel: () => void
  handleInteraction: () => void
  pause: () => void
  forceScrollToBottom: () => void
}

export function useAutoScroll(options?: AutoScrollOptions): AutoScrollResult {
  const onUserScrolled = options?.onUserScrolled
  const scrollRef = useRef<HTMLElement | null>(null)
  const detachedRef = useRef(false)
  const autoMarkerRef = useRef<{ top: number; time: number } | undefined>(undefined)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scrollGestureUntilRef = useRef(0)
  const touchGestureYRef = useRef<number | undefined>(undefined)
  const lastScrollTopRef = useRef<number | undefined>(undefined)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)

  const markAuto = useCallback((element: HTMLElement, top = bottomScrollTop(element)) => {
    autoMarkerRef.current = {
      top,
      time: Date.now(),
    }
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = setTimeout(() => {
      autoMarkerRef.current = undefined
      autoTimerRef.current = undefined
    }, PROGRAMMATIC_SCROLL_MARKER_TTL_MS)
  }, [])

  const isAuto = useCallback((element: HTMLElement) => {
    const marker = autoMarkerRef.current
    if (!marker) return false
    if (Date.now() - marker.time > PROGRAMMATIC_SCROLL_MARKER_TTL_MS) {
      autoMarkerRef.current = undefined
      return false
    }
    return Math.abs(element.scrollTop - marker.top) < 2
  }, [])

  const updateOverflowAnchor = useCallback((element: HTMLElement, detached: boolean) => {
    element.style.overflowAnchor = detached ? "auto" : "none"
  }, [])

  const updateDetachedState = useCallback(
    (detached: boolean, element = scrollRef.current) => {
      detachedRef.current = detached
      if (element) {
        updateOverflowAnchor(element, detached)
        setShowJumpToLatest(detached && shouldShowJumpToLatest(element))
        return
      }
      setShowJumpToLatest(detached)
    },
    [updateOverflowAnchor],
  )

  const markScrollGesture = useCallback(() => {
    scrollGestureUntilRef.current = Date.now() + SCROLL_GESTURE_WINDOW_MS
  }, [])

  const hasScrollGesture = useCallback(() => Date.now() < scrollGestureUntilRef.current, [])

  const scrollToBottomInstant = useCallback(
    (element: HTMLElement) => {
      const top = bottomScrollTop(element)
      markAuto(element, top)
      lastScrollTopRef.current = top
      element.scrollTop = top
    },
    [markAuto],
  )

  const pause = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    if (!canScroll(element)) {
      updateDetachedState(false, element)
      return
    }
    if (detachedRef.current) {
      setShowJumpToLatest(shouldShowJumpToLatest(element))
      return
    }

    updateDetachedState(true, element)
    onUserScrolled?.()
  }, [onUserScrolled, updateDetachedState])

  const forceScrollToBottom = useCallback(() => {
    updateDetachedState(false)
    const element = scrollRef.current
    if (element) scrollToBottomInstant(element)
  }, [scrollToBottomInstant, updateDetachedState])

  useEffect(() => {
    const element = scrollRef.current
    if (element) updateOverflowAnchor(element, detachedRef.current)
  }, [updateOverflowAnchor])

  useEffect(
    () => () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    },
    [],
  )

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLElement>) => {
      const element = event.currentTarget
      const previousScrollTop = lastScrollTopRef.current
      lastScrollTopRef.current = element.scrollTop

      if (!canScroll(element)) {
        updateDetachedState(false, element)
        return
      }

      const distance = distanceFromBottom(element)
      if (distance <= ATTACHED_BOTTOM_THRESHOLD_PX) {
        updateDetachedState(false, element)
        return
      }

      if (detachedRef.current) {
        setShowJumpToLatest(shouldShowJumpToLatest(element))
        return
      }

      if (isAuto(element)) return

      if (
        hasScrollGesture() &&
        previousScrollTop !== undefined &&
        element.scrollTop < previousScrollTop
      ) {
        pause()
      }
    },
    [hasScrollGesture, isAuto, pause, updateDetachedState],
  )

  const handleInteraction = useCallback(() => {
    if (detachedRef.current) return
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
      if (!SCROLL_DETACH_KEYS.has(event.key)) return
      if (event.key === " " && !event.shiftKey) return
      markScrollGesture()
      pause()
    },
    [markScrollGesture, pause],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) {
        lastScrollTopRef.current = event.currentTarget.scrollTop
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
      if (!shouldMarkRootGesture({ root: event.currentTarget, target: event.target, delta })) {
        return
      }

      markScrollGesture()
      if (delta < 0) {
        pause()
      }
    },
    [markScrollGesture, pause],
  )

  const handleTouchEnd = useCallback(() => {
    touchGestureYRef.current = undefined
  }, [])

  const handleTouchCancel = useCallback(() => {
    touchGestureYRef.current = undefined
  }, [])

  return {
    scrollRef,
    showJumpToLatest,
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
  }
}
