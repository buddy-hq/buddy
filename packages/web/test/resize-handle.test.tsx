import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { ResizeHandle, type ResizeHandleIntent } from "@buddy/ui"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

const TEST_POINTER_ID = 1
const TEST_START_X_PX = 100
const TEST_START_SIZE_PX = 300

let root: Root | undefined
let container: HTMLDivElement | undefined
const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

function dispatchPointerEvent(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  x: number,
) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: TEST_POINTER_ID,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: x,
    }),
  )
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
  if (originalRequestAnimationFrame) {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, "requestAnimationFrame")
  }
  if (originalCancelAnimationFrame) {
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  } else {
    Reflect.deleteProperty(globalThis, "cancelAnimationFrame")
  }
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

describe("ResizeHandle", () => {
  test("coalesces pointer moves to one resize write per animation frame", async () => {
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    const sizes: number[] = []
    const intents: ResizeHandleIntent[] = []
    let nextFrameID = 0
    globalThis.requestAnimationFrame = (callback) => {
      nextFrameID += 1
      frameCallbacks.set(nextFrameID, callback)
      return nextFrameID
    }
    globalThis.cancelAnimationFrame = (frameID) => {
      frameCallbacks.delete(frameID)
    }

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <ResizeHandle
          direction="horizontal"
          size={TEST_START_SIZE_PX}
          min={200}
          max={500}
          onResize={(size) => sizes.push(size)}
          onResizeIntent={(intent) => intents.push(intent)}
        />,
      )
    })

    const handle = container.querySelector<HTMLElement>("div")
    if (!handle) throw new Error("Expected resize handle")
    Object.defineProperties(handle, {
      setPointerCapture: { configurable: true, value() {} },
      hasPointerCapture: { configurable: true, value: () => false },
      releasePointerCapture: { configurable: true, value() {} },
    })

    dispatchPointerEvent(handle, "pointerdown", TEST_START_X_PX)
    dispatchPointerEvent(handle, "pointermove", TEST_START_X_PX + 10)
    dispatchPointerEvent(handle, "pointermove", TEST_START_X_PX + 20)

    expect(sizes).toEqual([])
    expect(frameCallbacks.size).toBe(1)
    const firstFrame = frameCallbacks.entries().next().value
    if (!firstFrame) throw new Error("Expected scheduled resize frame")
    frameCallbacks.delete(firstFrame[0])
    firstFrame[1](0)
    expect(sizes).toEqual([TEST_START_SIZE_PX + 20])
    expect(intents.map((intent) => intent.rawSize)).toEqual([TEST_START_SIZE_PX + 20])

    dispatchPointerEvent(handle, "pointermove", TEST_START_X_PX + 30)
    dispatchPointerEvent(handle, "pointerup", TEST_START_X_PX + 30)
    expect(sizes).toEqual([TEST_START_SIZE_PX + 20, TEST_START_SIZE_PX + 30])
    expect(frameCallbacks.size).toBe(0)
  })
})
