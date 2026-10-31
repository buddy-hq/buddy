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

function stubPointerCapture(handle: HTMLElement) {
  Object.defineProperties(handle, {
    setPointerCapture: { configurable: true, value() {} },
    hasPointerCapture: { configurable: true, value: () => false },
    releasePointerCapture: { configurable: true, value() {} },
  })
}

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
    stubPointerCapture(handle)

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

  test("a drag in progress reports to the callbacks from the latest render", async () => {
    Reflect.deleteProperty(globalThis, "requestAnimationFrame")
    const received: string[] = []
    const renderHandle = (label: string) =>
      root?.render(
        <ResizeHandle
          direction="horizontal"
          size={TEST_START_SIZE_PX}
          min={200}
          max={500}
          collapseThreshold={TEST_START_SIZE_PX}
          onResize={() => received.push(`${label} resize`)}
          onResizeIntent={() => received.push(`${label} intent`)}
          onCollapse={() => received.push(`${label} collapse`)}
        />,
      )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      renderHandle("first")
    })
    const handle = container.querySelector<HTMLElement>("div")
    if (!handle) throw new Error("Expected resize handle")
    stubPointerCapture(handle)

    dispatchPointerEvent(handle, "pointerdown", TEST_START_X_PX)
    dispatchPointerEvent(handle, "pointermove", TEST_START_X_PX + 10)
    await act(async () => {
      renderHandle("second")
    })
    dispatchPointerEvent(handle, "pointermove", TEST_START_X_PX - 10)
    dispatchPointerEvent(handle, "pointerup", TEST_START_X_PX - 10)

    expect(received).toEqual([
      "first resize",
      "first intent",
      "second resize",
      "second intent",
      "second collapse",
    ])
  })

  test("unmounting during a drag restores the page and drops the unsent resize", async () => {
    const frameCallbacks = new Map<number, FrameRequestCallback>()
    let nextFrameID = 0
    globalThis.requestAnimationFrame = (callback) => {
      nextFrameID += 1
      frameCallbacks.set(nextFrameID, callback)
      return nextFrameID
    }
    globalThis.cancelAnimationFrame = (frameID) => {
      frameCallbacks.delete(frameID)
    }
    const sizes: number[] = []
    let collapsed = false
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
          collapseThreshold={TEST_START_SIZE_PX}
          onResize={(size) => sizes.push(size)}
          onCollapse={() => {
            collapsed = true
          }}
        />,
      )
    })
    const handle = container.querySelector<HTMLElement>("div")
    if (!handle) throw new Error("Expected resize handle")
    stubPointerCapture(handle)
    document.body.style.userSelect = "text"
    document.body.style.overflow = "auto"

    dispatchPointerEvent(handle, "pointerdown", TEST_START_X_PX)
    dispatchPointerEvent(handle, "pointermove", TEST_START_X_PX - 10)
    expect(document.body.style.userSelect).toBe("none")
    expect(document.body.style.overflow).toBe("hidden")

    await act(async () => {
      root?.render(<div />)
    })

    expect(document.body.style.userSelect).toBe("text")
    expect(document.body.style.overflow).toBe("auto")
    expect(frameCallbacks.size).toBe(0)
    dispatchPointerEvent(handle, "pointerup", TEST_START_X_PX - 10)
    window.dispatchEvent(new Event("blur"))
    expect(sizes).toEqual([])
    expect(collapsed).toBe(false)
    document.body.style.userSelect = ""
    document.body.style.overflow = ""
  })
})
