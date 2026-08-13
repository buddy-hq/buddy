import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useDelayedFlag } from "../src/components/chat/hooks/use-delayed-flag"

const FLAG_DELAY_MS = 20
const TIMER_SETTLE_MS = FLAG_DELAY_MS + 15

function DelayedFlagProbe(props: { resetKey: string }) {
  const visible = useDelayedFlag(true, FLAG_DELAY_MS, props.resetKey)
  return <div data-visible={visible ? "true" : "false"} />
}

async function waitForFlagDelay() {
  await act(async () => {
    await new Promise<void>((resolve) => window.setTimeout(resolve, TIMER_SETTLE_MS))
  })
}

describe("useDelayedFlag", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("hides a successor immediately when the reset key changes", async () => {
    await act(async () => root.render(<DelayedFlagProbe resetKey="first" />))
    await waitForFlagDelay()
    expect(container.firstElementChild?.getAttribute("data-visible")).toBe("true")

    await act(async () => root.render(<DelayedFlagProbe resetKey="second" />))
    expect(container.firstElementChild?.getAttribute("data-visible")).toBe("false")

    await waitForFlagDelay()
    expect(container.firstElementChild?.getAttribute("data-visible")).toBe("true")
  })
})
