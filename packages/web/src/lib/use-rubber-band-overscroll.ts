import { useEffect, type RefObject } from "react"

/** UIScrollView's rubber-band constant: lower is stiffer. */
const RUBBER_BAND_COEFFICIENT = 0.55
/** UIScrollView's bounce-back spring: unit mass, stiffness 100, critically damped. */
const SPRING_OMEGA_PER_MS = Math.sqrt(100) / 1000
/** Quiet time after the last edge wheel event before the band is released. */
const RELEASE_GAP_MS = 50
/** A pause this long between edge wheel events starts a new gesture. */
const GESTURE_GAP_MS = 120
/**
 * The web never says when fingers leave the trackpad. Momentum arrives as steadily shrinking
 * deltas, so this many shrinking edge events in a row count as a release.
 */
const MOMENTUM_DECAY_EVENTS = 3
const MAX_RELEASE_VELOCITY_PX_PER_MS = 4
const MIN_EVENT_INTERVAL_MS = 8
const SETTLE_PX = 0.5
const LINE_HEIGHT_PX = 16

type TMotion =
  | { kind: "rest" }
  | { kind: "drag"; overscroll: number }
  | { kind: "spring"; from: number; velocity: number; startTime: number }

function rubberBand(overscroll: number, dimension: number) {
  const distance = Math.abs(overscroll)
  const offset = (1 - 1 / ((distance * RUBBER_BAND_COEFFICIENT) / dimension + 1)) * dimension
  return Math.sign(overscroll) * offset
}

function inverseRubberBand(offset: number, dimension: number) {
  const distance = Math.min(Math.abs(offset), dimension - 1)
  const overscroll = (dimension / RUBBER_BAND_COEFFICIENT) * (1 / (1 - distance / dimension) - 1)
  return Math.sign(offset) * overscroll
}

/** Critically damped spring toward 0: x(t) = (x₀ + (v₀ + ωx₀)t)·e^(−ωt). */
function springOffset(motion: Extract<TMotion, { kind: "spring" }>, time: number) {
  const elapsed = time - motion.startTime
  const omega = SPRING_OMEGA_PER_MS
  return (
    (motion.from + (motion.velocity + omega * motion.from) * elapsed) * Math.exp(-omega * elapsed)
  )
}

function clampVelocity(velocity: number) {
  return Math.max(
    -MAX_RELEASE_VELOCITY_PX_PER_MS,
    Math.min(MAX_RELEASE_VELOCITY_PX_PER_MS, velocity),
  )
}

function wheelDeltaPx(event: WheelEvent) {
  return event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * LINE_HEIGHT_PX
    : event.deltaY
}

/**
 * UIScrollView's elastic overscroll at both ends of a scroll container, for wheels and
 * trackpads on every platform. While pulled, the offset follows Apple's rubber-band curve; on
 * release, Apple's critically damped spring carries it home from the pull's own velocity. The
 * container itself is translated, so its parent must clip it: translating the content instead
 * would change the container's scroll height and clamp the pull away.
 */
export function useRubberBandOverscroll(scrollRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let motion: TMotion = { kind: "rest" }
    let offset = 0
    let offsetVelocity = 0
    let frame: number | undefined
    let lastWheelTime = Number.NEGATIVE_INFINITY
    let lastEdgeWheelTime = Number.NEGATIVE_INFINITY
    let lastEdgeDelta = Number.POSITIVE_INFINITY
    let shrinkingEdgeEvents = 0
    let gestureReleased = false

    function applyOffset(next: number) {
      if (!element) return
      offset = next
      element.style.transform = next === 0 ? "" : `translateY(${next}px)`
    }

    function release(time: number) {
      motion = {
        kind: "spring",
        from: offset,
        velocity: clampVelocity(offsetVelocity),
        startTime: time,
      }
      gestureReleased = true
      ensureFrame()
    }

    function step(time: number) {
      frame = undefined
      if (motion.kind === "drag") {
        if (time - lastEdgeWheelTime > RELEASE_GAP_MS) release(time)
        else ensureFrame()
        return
      }
      if (motion.kind !== "spring") return

      const next = springOffset(motion, time)
      if (Math.abs(next) < SETTLE_PX && time - motion.startTime > 1 / SPRING_OMEGA_PER_MS) {
        motion = { kind: "rest" }
        offsetVelocity = 0
        applyOffset(0)
        return
      }
      applyOffset(next)
      ensureFrame()
    }

    function ensureFrame() {
      if (frame === undefined) frame = requestAnimationFrame(step)
    }

    function handleWheel(event: WheelEvent) {
      if (!element || event.ctrlKey || reducedMotion.matches) return
      const delta = wheelDeltaPx(event)
      if (delta === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return

      const now = performance.now()
      const interval = Math.max(now - lastWheelTime, MIN_EVENT_INTERVAL_MS)
      lastWheelTime = now

      const overflow = element.scrollHeight - element.clientHeight
      if (overflow <= 0) return

      const atTop = element.scrollTop <= 0
      const atBottom = Math.ceil(element.scrollTop) >= overflow
      if (!(atTop && delta < 0) && !(atBottom && delta > 0)) {
        if (motion.kind === "drag") release(now)
        return
      }

      if (now - lastEdgeWheelTime > GESTURE_GAP_MS) {
        gestureReleased = false
        shrinkingEdgeEvents = 0
        lastEdgeDelta = Number.POSITIVE_INFINITY
      }
      lastEdgeWheelTime = now
      if (gestureReleased) return

      const shrinking = Number.isFinite(lastEdgeDelta) && Math.abs(delta) < lastEdgeDelta
      shrinkingEdgeEvents = shrinking ? shrinkingEdgeEvents + 1 : 0
      lastEdgeDelta = Math.abs(delta)
      if (shrinkingEdgeEvents >= MOMENTUM_DECAY_EVENTS && motion.kind === "drag") {
        release(now)
        return
      }

      const dimension = element.clientHeight
      const overscroll =
        (motion.kind === "drag" ? motion.overscroll : inverseRubberBand(offset, dimension)) - delta
      motion = { kind: "drag", overscroll }
      const next = rubberBand(overscroll, dimension)
      offsetVelocity = (next - offset) / interval
      applyOffset(next)
      ensureFrame()
    }

    element.addEventListener("wheel", handleWheel, { passive: true })
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      element.removeEventListener("wheel", handleWheel)
      element.style.transform = ""
    }
  }, [scrollRef])
}
