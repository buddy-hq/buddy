import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  WHITEBOARD_PRESENTATION_MAX_FRAMES,
  buildWhiteboardPresentationFrames,
  useWhiteboardPresentation,
} from "../src/components/whiteboard/whiteboard-presentation"
import {
  buildProgressiveWhiteboardSignature,
  type ProgressiveWhiteboardPreview,
} from "../src/components/whiteboard/whiteboard-progressive"
import type { PersistedWhiteboardElement } from "../src/components/whiteboard/whiteboard-elements"

function element(id: string, x = 0): PersistedWhiteboardElement {
  return { type: "rectangle", id, x, y: 0, width: 100, height: 80 }
}

function preview(elements: PersistedWhiteboardElement[]): ProgressiveWhiteboardPreview {
  return {
    elements,
    signature: buildProgressiveWhiteboardSignature({ elements }),
  }
}

const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
let root: Root | undefined
let container: HTMLDivElement | undefined
let nextFrameID = 1
let pendingFrames = new Map<number, FrameRequestCallback>()

async function flushFrames(): Promise<void> {
  while (pendingFrames.size > 0) {
    const callbacks = [...pendingFrames.values()]
    pendingFrames = new Map()
    await act(async () => {
      for (const callback of callbacks) callback(performance.now())
    })
  }
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  nextFrameID = 1
  pendingFrames = new Map()
  globalThis.requestAnimationFrame = (callback) => {
    const frameID = nextFrameID
    nextFrameID += 1
    pendingFrames.set(frameID, callback)
    return frameID
  }
  globalThis.cancelAnimationFrame = (frameID) => {
    pendingFrames.delete(frameID)
  }
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
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

describe("whiteboard presentation", () => {
  test("turns a one-shot target into bounded semantic frames with an exact final scene", () => {
    const current = preview([element("persisted")])
    const target = preview([
      element("persisted"),
      ...Array.from({ length: 24 }, (_, index) => element(`new-${index}`, index * 120)),
    ])

    const frames = buildWhiteboardPresentationFrames({ current, target })
    const elementCounts = frames.map((frame) => frame.elements.length)

    expect(frames.length).toBeGreaterThan(1)
    expect(frames.length).toBeLessThanOrEqual(WHITEBOARD_PRESENTATION_MAX_FRAMES)
    expect(elementCounts).toEqual(elementCounts.toSorted((a, b) => a - b))
    expect(frames.at(-1)).toEqual(target)
  })

  test("cancels stale reveal frames when a newer target supersedes them", async () => {
    const base = preview([])
    const first = preview(Array.from({ length: 12 }, (_, index) => element(`first-${index}`)))
    const second = preview(Array.from({ length: 12 }, (_, index) => element(`second-${index}`)))

    function Probe(props: { target: ProgressiveWhiteboardPreview }) {
      const presented = useWhiteboardPresentation({ base, target: props.target, animate: true })
      return <output>{presented?.elements.map((item) => item.id).join(",")}</output>
    }

    await act(async () => root?.render(<Probe target={first} />))
    expect(pendingFrames.size).toBe(1)
    await act(async () => root?.render(<Probe target={second} />))
    await flushFrames()

    expect(container?.querySelector("output")?.textContent).toContain("second-11")
    expect(container?.querySelector("output")?.textContent).not.toContain("first-")
  })

  test("fast-forwards when animation is disabled", async () => {
    const base = preview([element("old")])
    const target = preview([element("final")])

    function Probe() {
      const presented = useWhiteboardPresentation({ base, target, animate: false })
      return <output>{presented?.elements.map((item) => item.id).join(",")}</output>
    }

    await act(async () => root?.render(<Probe />))

    expect(container?.querySelector("output")?.textContent).toBe("final")
    expect(pendingFrames.size).toBe(0)
  })
})
