import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FoliateReader } from "../src/components/readers/foliate-reader"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("reader theme filter", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = undefined
  })

  test("does not apply PDF inversion to dark EPUB themes", async () => {
    await act(async () => {
      root.render(<FoliateReader source={null} defaultTheme="night" showToolbar={false} />)
      await flushEffects()
    })

    const reader = container.querySelector('[data-component="foliate-reader"]')
    const style = container.querySelector("style")

    expect(reader?.getAttribute("data-theme")).toBe("night")
    expect(style?.textContent).toContain("::part(filter)")
    expect(style?.textContent).toContain("filter: none;")
    expect(style?.textContent).not.toContain("filter: invert(1)")
  })
})
