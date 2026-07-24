import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchSurfacePending } from "../src/components/bench/bench-surface-pending"

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  root = undefined
  container = undefined
})

async function renderPending() {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<BenchSurfacePending shape="canvas" />)
  })
}

async function advance(ms: number) {
  await act(async () => {
    await new Promise((resolve) => globalThis.setTimeout(resolve, ms))
  })
}

describe("BenchSurfacePending", () => {
  test("shows nothing for a load that resolves quickly", async () => {
    await renderPending()

    expect(container?.querySelector('[data-component="bench-surface-pending"]')).toBeNull()
    expect(container?.querySelector('[data-component="bench-surface-pending-idle"]')).not.toBeNull()
    expect(container?.textContent).toBe("")
  })

  test("acknowledges a slow load with a wordless skeleton", async () => {
    await renderPending()
    await advance(320)

    const pending = container?.querySelector('[data-component="bench-surface-pending"]')
    expect(pending).not.toBeNull()
    expect(pending?.getAttribute("data-pending-shape")).toBe("canvas")
    expect(pending?.getAttribute("aria-busy")).not.toBeNull()
    // No product-facing copy at all, and none of Buddy's internal vocabulary.
    expect(container?.textContent).toBe("")
  })
})
