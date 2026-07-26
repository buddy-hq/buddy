import type { Transition, Variants } from "motion/react"

/**
 * Shared motion contract for surfaces that appear between the transcript and
 * the composer (task dock, arcade, sketch, permission docks).
 *
 * Those surfaces cannot animate their own `height`: they are flex siblings of
 * the virtualized transcript, so a per-frame height tween forces the transcript
 * to relayout, re-measure, and re-pin its bottom anchor on every frame.
 *
 * Instead each state change commits its layout height exactly once and the
 * *visual* catch-up is replayed on the compositor: the transcript content starts
 * at the offset it occupied before the commit and eases back to zero while the
 * surface fades. Both halves share the duration and curve below so the surface
 * and the conversation above it settle as a single gesture.
 */

export const SURFACE_REVEAL_EASING: [number, number, number, number] = [0.22, 1, 0.36, 1]

export const SURFACE_REVEAL_EASING_CSS = `cubic-bezier(${SURFACE_REVEAL_EASING.join(", ")})`

export const SURFACE_REVEAL_MOTION = {
  durationMs: 240,
  reducedDurationMs: 90,
  /** How far the surface drifts up into the band the transcript vacated. */
  enterOffsetPx: 12,
  anchorShift: {
    /** Below this the snap is imperceptible and an animation only adds latency. */
    minimumPx: 24,
    /** Above this the shift is a window/session change, not a surface reveal. */
    maximumPx: 1_200,
  },
} as const

export const SURFACE_REVEAL_VARIANT = {
  enter: "enter",
  visible: "visible",
  exit: "exit",
} as const

const INSTANT_TRANSITION: Transition = { duration: 0 }

export function resolveSurfaceRevealTransition(reduceMotion: boolean): Transition {
  return {
    duration:
      (reduceMotion ? SURFACE_REVEAL_MOTION.reducedDurationMs : SURFACE_REVEAL_MOTION.durationMs) /
      1_000,
    ease: SURFACE_REVEAL_EASING,
  }
}

/**
 * Variants for the in-flow band that reserves the surface's layout height.
 *
 * The band drops to zero the instant a close is requested so the transcript
 * starts reclaiming the space in the same frame. Holding the band open for the
 * length of the fade instead makes the transcript stall and only begin falling
 * once the surface has already gone.
 */
export const SURFACE_REVEAL_BAND_VARIANTS: Variants = {
  enter: {},
  visible: {},
  exit: { height: 0, transition: INSTANT_TRANSITION },
}

/**
 * Variants for the surface itself, rendered inside the band.
 *
 * The exit pulls the surface back up by its own height, cancelling the collapsed
 * band so the fade happens exactly where the surface already sat.
 */
export function resolveSurfaceRevealVariants(reduceMotion: boolean): Variants {
  const transition = resolveSurfaceRevealTransition(reduceMotion)

  return {
    enter: { opacity: 0, y: reduceMotion ? 0 : SURFACE_REVEAL_MOTION.enterOffsetPx },
    visible: { opacity: 1, y: 0, transition },
    exit: {
      opacity: 0,
      y: "-100%",
      transition: { ...transition, y: INSTANT_TRANSITION },
    },
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Resolves how far the transcript content visually moves when its viewport
 * height changes while the bottom anchor is held.
 *
 * Shrinking the viewport pushes content up (positive); growing it lets content
 * fall back down (negative). Both directions clamp to the scroll range, so a
 * transcript shorter than its viewport reports no shift at all.
 */
export function resolveAnchorShiftPx(input: {
  scrollHeight: number
  previousViewportHeight: number
  nextViewportHeight: number
}): number {
  const nextMaxScrollTop = Math.max(input.scrollHeight - input.nextViewportHeight, 0)
  const previousMaxScrollTop = Math.max(input.scrollHeight - input.previousViewportHeight, 0)
  return nextMaxScrollTop - previousMaxScrollTop
}

export function shouldAnimateAnchorShift(shiftPx: number): boolean {
  const distance = Math.abs(shiftPx)
  return (
    distance >= SURFACE_REVEAL_MOTION.anchorShift.minimumPx &&
    distance <= SURFACE_REVEAL_MOTION.anchorShift.maximumPx
  )
}

export type AnchorShiftAnimator = {
  /**
   * Replays an already-committed scroll correction as a compositor-only
   * transform. The element is expected to sit at its final layout position
   * before this runs.
   */
  run: (element: HTMLElement | null, shiftPx: number) => void
  cancel: () => void
}

const NO_OP_ANCHOR_SHIFT_ANIMATOR: AnchorShiftAnimator = {
  run: () => {},
  cancel: () => {},
}

export function createAnchorShiftAnimator(): AnchorShiftAnimator {
  if (typeof window === "undefined") return NO_OP_ANCHOR_SHIFT_ANIMATOR

  const running = new Set<Animation>()

  return {
    cancel: () => {
      for (const animation of running) {
        animation.cancel()
      }
      running.clear()
    },
    run: (element, shiftPx) => {
      if (!element || typeof element.animate !== "function") return
      if (!shouldAnimateAnchorShift(shiftPx) || prefersReducedMotion()) return

      // `composite: "add"` layers this onto any in-flight catch-up instead of
      // cancelling it, so overlapping reveals compose to the correct offset.
      // `fill: "none"` leaves no inline transform behind once it settles.
      const animation = element.animate(
        [{ transform: `translate3d(0, ${shiftPx}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        {
          duration: SURFACE_REVEAL_MOTION.durationMs,
          easing: SURFACE_REVEAL_EASING_CSS,
          fill: "none",
          composite: "add",
        },
      )

      running.add(animation)
      const forget = () => {
        running.delete(animation)
      }
      animation.addEventListener("finish", forget, { once: true })
      animation.addEventListener("cancel", forget, { once: true })
    },
  }
}
