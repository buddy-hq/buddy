import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ConwayGlider } from "../src/components/chat/tools/conway-glider"

describe("Conway glider", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("shares one clock while reserving distinct starting frames", async () => {
    const originalSetInterval = globalThis.setInterval
    let scheduledIntervalCount = 0
    Reflect.set(globalThis, "setInterval", (...args: unknown[]) => {
      scheduledIntervalCount += 1
      return Reflect.apply(originalSetInterval, globalThis, args)
    })

    try {
      await act(async () => {
        root.render(
          <>
            <ConwayGlider seed="duplicate-seed" />
            <ConwayGlider seed="duplicate-seed" />
          </>,
        )
      })

      const gliders = container.querySelectorAll('[data-component="conway-glider"]')
      const firstFrame = Array.from(gliders[0].children, (cell) => cell.getAttribute("style"))
      const secondFrame = Array.from(gliders[1].children, (cell) => cell.getAttribute("style"))

      expect(scheduledIntervalCount).toBe(1)
      expect(firstFrame).not.toEqual(secondFrame)
    } finally {
      Reflect.set(globalThis, "setInterval", originalSetInterval)
    }
  })
})
