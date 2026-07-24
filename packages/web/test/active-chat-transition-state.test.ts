import { afterEach, describe, expect, test } from "bun:test"
import {
  beginActiveChatTransition,
  markActiveChatDestinationLayoutReady,
  readActiveChatLayoutMotionSuppressed,
  registerActiveChatDestinationLayout,
  releaseActiveChatLayoutMotionAfterPaint,
  resetActiveChatTransitionStateForTests,
  subscribeActiveChatLayoutMotion,
  waitForActiveChatDestinationLayout,
} from "../src/lib/active-chat-transition-state"

const originalRequestAnimationFrame = globalThis.requestAnimationFrame

afterEach(() => {
  resetActiveChatTransitionStateForTests()
  if (originalRequestAnimationFrame) {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, "requestAnimationFrame")
  }
})

describe("active chat transition layout motion", () => {
  test("suppresses motion until the latest chat transition has painted", () => {
    const frameCallbacks: FrameRequestCallback[] = []
    const snapshots: boolean[] = []
    globalThis.requestAnimationFrame = (callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    }
    const unsubscribe = subscribeActiveChatLayoutMotion(() => {
      snapshots.push(readActiveChatLayoutMotionSuppressed())
    })

    const firstTransitionID = beginActiveChatTransition()
    releaseActiveChatLayoutMotionAfterPaint(firstTransitionID)
    const secondTransitionID = beginActiveChatTransition()

    expect(readActiveChatLayoutMotionSuppressed()).toBeTrue()
    expect(snapshots).toEqual([true])

    frameCallbacks.shift()?.(0)
    frameCallbacks.shift()?.(16)
    expect(readActiveChatLayoutMotionSuppressed()).toBeTrue()

    releaseActiveChatLayoutMotionAfterPaint(secondTransitionID)
    frameCallbacks.shift()?.(32)
    expect(readActiveChatLayoutMotionSuppressed()).toBeTrue()
    frameCallbacks.shift()?.(48)

    expect(readActiveChatLayoutMotionSuppressed()).toBeFalse()
    expect(snapshots).toEqual([true, false])
    unsubscribe()
  })

  test("suppresses layout motion until the destination transcript layout is quiet", () => {
    const frameCallbacks: FrameRequestCallback[] = []
    globalThis.requestAnimationFrame = (callback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    }

    const transitionID = beginActiveChatTransition()
    expect(registerActiveChatDestinationLayout(transitionID)).toBeTrue()
    releaseActiveChatLayoutMotionAfterPaint(transitionID)

    frameCallbacks.shift()?.(0)
    frameCallbacks.shift()?.(16)
    expect(readActiveChatLayoutMotionSuppressed()).toBeTrue()

    markActiveChatDestinationLayoutReady(transitionID)
    expect(readActiveChatLayoutMotionSuppressed()).toBeFalse()
  })

  test("holds a retained frame until the registered destination layout is ready", async () => {
    const transitionID = beginActiveChatTransition()
    expect(registerActiveChatDestinationLayout(transitionID)).toBeTrue()

    let settled = false
    const waiting = waitForActiveChatDestinationLayout(transitionID).then(() => {
      settled = true
    })
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(settled).toBeFalse()
    markActiveChatDestinationLayoutReady(transitionID)
    await waiting
    expect(settled).toBeTrue()
  })
})
