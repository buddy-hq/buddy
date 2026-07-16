import { describe, expect, test } from "bun:test"
import { ArchiveIcon } from "@buddy/ui"
import { act, createRef } from "react"
import { createRoot } from "react-dom/client"
import { Panda } from "../src/icons/app-icons"

describe("icon components", () => {
  test("forwards SVG refs and preserves the Panda's round strokes", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    const sharedIconRef = createRef<SVGSVGElement>()
    const pandaRef = createRef<SVGSVGElement>()

    try {
      await act(async () => {
        root.render(
          <>
            <ArchiveIcon ref={sharedIconRef} />
            <Panda ref={pandaRef} data-testid="panda" />
          </>,
        )
      })

      expect(sharedIconRef.current?.tagName.toLowerCase()).toBe("svg")
      expect(pandaRef.current?.tagName.toLowerCase()).toBe("svg")

      const pandaPaths = container.querySelectorAll('[data-testid="panda"] path')
      expect(pandaPaths.length).toBeGreaterThan(0)
      for (const path of pandaPaths) {
        expect(path.getAttribute("stroke-linecap")).toBe("round")
        expect(path.getAttribute("stroke-linejoin")).toBe("round")
      }
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
      Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    }
  })
})
