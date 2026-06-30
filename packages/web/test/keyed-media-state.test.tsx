import { afterEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useKeyedMediaState } from "../src/components/media/use-keyed-media-state"

type LoadState = "loading" | "ready"

describe("keyed media state", () => {
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

  test("keeps terminal state scoped to the resource that reported it", async () => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    const testRoot = createRoot(container)
    root = testRoot
    const setters = new Map<string, (state: LoadState) => void>()

    function Probe(props: { resourceKey: string }) {
      const [state, setState] = useKeyedMediaState<LoadState>(
        props.resourceKey,
        "loading",
      )
      setters.set(props.resourceKey, setState)
      return <div data-state={state}>{props.resourceKey}</div>
    }

    await act(async () => {
      testRoot.render(<Probe resourceKey="first" />)
    })
    const firstSetter = setters.get("first")
    expect(firstSetter).toBeDefined()

    await act(async () => {
      firstSetter?.("ready")
    })
    expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe("ready")

    await act(async () => {
      testRoot.render(<Probe resourceKey="second" />)
    })
    expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe("loading")

    await act(async () => {
      firstSetter?.("ready")
    })
    expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe("loading")

    const secondSetter = setters.get("second")
    await act(async () => {
      secondSetter?.("ready")
    })
    expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe("ready")

    await act(async () => {
      firstSetter?.("ready")
    })
    expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe("ready")

    await act(async () => {
      testRoot.render(<Probe resourceKey="second" />)
    })
    expect(container.querySelector("[data-state]")?.getAttribute("data-state")).toBe("ready")
  })
})
