import "../happydom"
import { describe, expect, test } from "bun:test"

import {
  SURFACE_REVEAL_BAND_VARIANTS,
  SURFACE_REVEAL_EASING_CSS,
  SURFACE_REVEAL_MOTION,
  createAnchorShiftAnimator,
  resolveAnchorShiftPx,
  resolveSurfaceRevealTransition,
  resolveSurfaceRevealVariants,
  shouldAnimateAnchorShift,
} from "../src/lib/surface-reveal-motion"
import { parseBuddyConfigObject, parseStringValue } from "./parse-test-values"

type RecordedAnimation = {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
}

function createAnimatableElement(recorded: RecordedAnimation[]): HTMLElement {
  const element = document.createElement("div")
  const listeners = new Map<string, () => void>()
  const animation = {
    cancel: () => {
      listeners.get("cancel")?.()
    },
    addEventListener: (type: string, listener: () => void) => {
      listeners.set(type, listener)
    },
  }
  Object.assign(element, {
    animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      recorded.push({ keyframes, options })
      return animation
    },
  })
  return element
}

describe("resolveAnchorShiftPx", () => {
  test("reports the upward travel when the viewport shrinks", () => {
    expect(
      resolveAnchorShiftPx({
        scrollHeight: 4_000,
        previousViewportHeight: 800,
        nextViewportHeight: 480,
      }),
    ).toBe(320)
  })

  test("reports downward travel when the viewport grows", () => {
    expect(
      resolveAnchorShiftPx({
        scrollHeight: 4_000,
        previousViewportHeight: 480,
        nextViewportHeight: 800,
      }),
    ).toBe(-320)
  })

  test("reports no travel when the transcript is shorter than both viewports", () => {
    expect(
      resolveAnchorShiftPx({
        scrollHeight: 300,
        previousViewportHeight: 800,
        nextViewportHeight: 480,
      }),
    ).toBe(0)
  })

  test("clamps travel to the scroll range the transcript actually has", () => {
    expect(
      resolveAnchorShiftPx({
        scrollHeight: 600,
        previousViewportHeight: 800,
        nextViewportHeight: 480,
      }),
    ).toBe(120)
  })
})

describe("shouldAnimateAnchorShift", () => {
  test("skips shifts small enough to read as no motion at all", () => {
    expect(shouldAnimateAnchorShift(SURFACE_REVEAL_MOTION.anchorShift.minimumPx - 1)).toBe(false)
  })

  test("skips window-scale shifts that are not surface reveals", () => {
    expect(shouldAnimateAnchorShift(SURFACE_REVEAL_MOTION.anchorShift.maximumPx + 1)).toBe(false)
  })

  test("animates surface-sized shifts in both directions", () => {
    expect(shouldAnimateAnchorShift(320)).toBe(true)
    expect(shouldAnimateAnchorShift(-320)).toBe(true)
  })
})

describe("surface reveal variants", () => {
  test("releases the band's layout height without waiting for the fade", () => {
    // A timed height collapse would hold the transcript back for the whole exit,
    // which reads as a stall before the conversation falls into the space.
    expect(SURFACE_REVEAL_BAND_VARIANTS.exit).toEqual({
      height: 0,
      transition: { duration: 0 },
    })
  })

  test("cancels the collapsed band so the surface fades in place", () => {
    const exit = resolveSurfaceRevealVariants(false).exit
    const exitTarget = parseBuddyConfigObject(exit)
    if (exitTarget === undefined) {
      throw new Error("Expected the exit variant to be a target object")
    }
    expect(parseStringValue(exitTarget.y)).toBe("-100%")
    expect(parseBuddyConfigObject(exitTarget.transition)).toEqual(
      parseBuddyConfigObject(
        Object.assign({}, resolveSurfaceRevealTransition(false), { y: { duration: 0 } }),
      ),
    )
  })

  test("keeps the fade on the same duration the transcript catch-up uses", () => {
    expect(resolveSurfaceRevealTransition(false).duration).toBe(
      SURFACE_REVEAL_MOTION.durationMs / 1_000,
    )
    expect(resolveSurfaceRevealTransition(true).duration).toBe(
      SURFACE_REVEAL_MOTION.reducedDurationMs / 1_000,
    )
  })

  test("drops the entrance drift when motion is reduced", () => {
    const enter = resolveSurfaceRevealVariants(true).enter
    const enterTarget = parseBuddyConfigObject(enter)
    if (enterTarget === undefined) {
      throw new Error("Expected the enter variant to be a target object")
    }
    expect(enterTarget.y).toBe(0)
  })
})

describe("createAnchorShiftAnimator", () => {
  test("replays the committed shift as an additive, non-filling transform", () => {
    const recorded: RecordedAnimation[] = []
    const element = createAnimatableElement(recorded)

    createAnchorShiftAnimator().run(element, 320)

    expect(recorded).toHaveLength(1)
    expect(recorded[0]?.keyframes).toEqual([
      { transform: "translate3d(0, 320px, 0)" },
      { transform: "translate3d(0, 0, 0)" },
    ])
    expect(recorded[0]?.options).toEqual({
      duration: SURFACE_REVEAL_MOTION.durationMs,
      easing: SURFACE_REVEAL_EASING_CSS,
      fill: "none",
      composite: "add",
    })
  })

  test("does not animate shifts outside the surface-reveal range", () => {
    const recorded: RecordedAnimation[] = []
    const element = createAnimatableElement(recorded)
    const animator = createAnchorShiftAnimator()

    animator.run(element, 4)
    animator.run(element, SURFACE_REVEAL_MOTION.anchorShift.maximumPx + 1)
    animator.run(null, 320)

    expect(recorded).toHaveLength(0)
  })

  test("cancel drops in-flight animations so a scroll gesture wins", () => {
    const recorded: RecordedAnimation[] = []
    const element = createAnimatableElement(recorded)
    const animator = createAnchorShiftAnimator()

    animator.run(element, 320)
    animator.cancel()
    animator.cancel()

    expect(recorded).toHaveLength(1)
  })
})
