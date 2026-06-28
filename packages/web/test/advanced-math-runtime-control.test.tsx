import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  AdvancedMathRuntimeControl,
  advancedMathRuntimeDescription,
  isAdvancedMathRuntimeSupported,
} from "../src/components/settings/advanced-math-runtime-control"

describe("advanced math runtime settings control", () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container?.remove()
    container = null
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("reports Windows as unsupported and uses the coming soon description", () => {
    expect(isAdvancedMathRuntimeSupported("windows")).toBe(false)
    expect(advancedMathRuntimeDescription("windows")).toBe(
      "Advanced math is coming soon on Windows.",
    )
  })

  test("renders a coming soon badge on Windows instead of a toggle", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    const testRoot = createRoot(container)
    root = testRoot

    await act(async () => {
      testRoot.render(
        <AdvancedMathRuntimeControl
          os="windows"
          status={null}
          loading={false}
          busy={false}
          enabled={false}
          onToggle={() => undefined}
        />,
      )
    })

    expect(container.textContent).toContain("Coming soon")
    expect(container.querySelector('[data-action="settings-advanced-math-toggle"]')).toBeNull()
  })
})
