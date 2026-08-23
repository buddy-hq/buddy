import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { FontSizeInput } from "../src/components/settings/settings-general"

function enterInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("settings font size input", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    container.remove()
  })

  test("keeps an intermediate draft while entering a multi-digit size", async () => {
    const changes: number[] = []
    await act(async () => {
      root.render(
        <FontSizeInput
          value={14}
          ariaLabel="UI font size"
          dataAction="settings-ui-font-size"
          onChange={(value) => changes.push(value)}
        />,
      )
    })

    const input = container.querySelector<HTMLInputElement>('input[type="number"]')
    expect(input).not.toBeNull()

    await act(async () => {
      if (!input) return
      enterInputValue(input, "2")
    })

    expect(input?.value).toBe("2")
    expect(changes).toEqual([])

    await act(async () => {
      if (!input) return
      enterInputValue(input, "24")
    })

    expect(input?.value).toBe("24")
    expect(changes).toEqual([24])
  })
})
