import "../happydom"
import { afterEach, describe, expect, test } from "bun:test"
import { act, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { TransientBenchSurfaceStack } from "../src/components/bench/transient-bench-surface"

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

describe("transient Bench surface lifecycle", () => {
  test("keeps the persistent Bench mounted while a transient surface covers it", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    let mounts = 0
    let unmounts = 0

    function PersistentBench() {
      useEffect(() => {
        mounts += 1
        return () => {
          unmounts += 1
        }
      }, [])
      return <div data-testid="persistent-bench">Browser page</div>
    }

    const render = (active: boolean) =>
      root?.render(
        <TransientBenchSurfaceStack active={active} hostRef={() => undefined}>
          <PersistentBench />
        </TransientBenchSurfaceStack>,
      )

    await act(async () => {
      render(false)
    })
    const originalPersistentBench = container.querySelector('[data-testid="persistent-bench"]')
    const originalTransientHost = container.querySelector<HTMLDivElement>(
      '[data-component="transient-bench-surface-host"]',
    )
    expect(originalTransientHost?.classList.contains("hidden")).toBeTrue()

    await act(async () => {
      render(true)
    })

    const coveredLayer = container.querySelector(
      '[data-component="persistent-bench-surface-layer"]',
    )
    expect(mounts).toBe(1)
    expect(unmounts).toBe(0)
    expect(container.querySelector('[data-testid="persistent-bench"]')).toBe(
      originalPersistentBench,
    )
    expect(container.querySelector('[data-component="transient-bench-surface-host"]')).toBe(
      originalTransientHost,
    )
    expect(originalTransientHost?.classList.contains("hidden")).toBeFalse()
    expect(coveredLayer?.hasAttribute("inert")).toBeTrue()

    await act(async () => {
      render(false)
    })

    expect(mounts).toBe(1)
    expect(unmounts).toBe(0)
    expect(container.querySelector('[data-testid="persistent-bench"]')).toBe(
      originalPersistentBench,
    )
    expect(container.querySelector('[data-component="transient-bench-surface-host"]')).toBe(
      originalTransientHost,
    )
    expect(originalTransientHost?.classList.contains("hidden")).toBeTrue()
  })
})
