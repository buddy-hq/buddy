import "../happydom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Intro } from "../src/components/onboarding/cinematic"

describe("cinematic onboarding", () => {
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
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("renders the intro gate as a keyboard-operable button", async () => {
    const onBegin = mock(() => undefined)

    await act(async () => {
      root.render(<Intro onBegin={onBegin} />)
    })

    const button = container.querySelector("button")
    expect(button?.type).toBe("button")

    await act(async () => {
      button?.click()
    })
    expect(onBegin).toHaveBeenCalledTimes(1)
  })
})
