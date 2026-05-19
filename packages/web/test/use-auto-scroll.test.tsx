import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useLayoutEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useAutoScroll } from "../src/lib/directory-chat/use-auto-scroll"

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)

type HarnessHandle = {
  pause: () => void
}

type HarnessProps = {
  contentDep: number
  onReady: (handle: HarnessHandle) => void
  working: boolean
}

type ScrollMetrics = {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}

function Harness(props: HarnessProps) {
  const onReady = props.onReady
  const auto = useAutoScroll({
    working: props.working,
    contentDep: props.contentDep,
  })

  useLayoutEffect(() => {
    onReady({
      pause: auto.pause,
    })
  }, [auto.pause, onReady])

  return (
    <div
      data-testid="scroll"
      ref={(node) => {
        Reflect.set(auto.scrollRef, "current", node)
      }}
      onScroll={auto.handleScroll}
    >
      <div
        data-testid="content"
        ref={(node) => {
          Reflect.set(auto.contentRef, "current", node)
        }}
      />
    </div>
  )
}

function requireDiv(container: ParentNode, selector: string) {
  const element = container.querySelector(selector)
  if (!(element instanceof HTMLDivElement)) {
    throw new Error(`Expected ${selector} to resolve to an HTMLDivElement`)
  }
  return element
}

function installScrollMetrics(element: HTMLDivElement, metrics: ScrollMetrics) {
  Object.defineProperties(element, {
    clientHeight: {
      configurable: true,
      get: () => metrics.clientHeight,
    },
    scrollHeight: {
      configurable: true,
      get: () => metrics.scrollHeight,
    },
    scrollTop: {
      configurable: true,
      get: () => metrics.scrollTop,
      set: (value: number) => {
        metrics.scrollTop = value
      },
    },
  })
}

describe("useAutoScroll", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  test("keeps the bottom pinned for later transcript growth while still attached", async () => {
    let handle: HarnessHandle | undefined

    await act(async () => {
      root.render(
        <Harness
          working={false}
          contentDep={0}
          onReady={(nextHandle) => {
            handle = nextHandle
          }}
        />,
      )
    })

    expect(handle).toBeDefined()

    const scrollElement = requireDiv(container, '[data-testid="scroll"]')
    const metrics: ScrollMetrics = {
      clientHeight: 400,
      scrollHeight: 800,
      scrollTop: 400,
    }
    installScrollMetrics(scrollElement, metrics)

    metrics.scrollHeight = 1_000

    await act(async () => {
      root.render(
        <Harness
          working={false}
          contentDep={1}
          onReady={(nextHandle) => {
            handle = nextHandle
          }}
        />,
      )
    })

    expect(metrics.scrollTop).toBe(600)
  })

  test("does not pull the viewport back down after an explicit detach", async () => {
    let handle: HarnessHandle | undefined

    await act(async () => {
      root.render(
        <Harness
          working={false}
          contentDep={0}
          onReady={(nextHandle) => {
            handle = nextHandle
          }}
        />,
      )
    })

    const scrollElement = requireDiv(container, '[data-testid="scroll"]')
    const metrics: ScrollMetrics = {
      clientHeight: 400,
      scrollHeight: 800,
      scrollTop: 200,
    }
    installScrollMetrics(scrollElement, metrics)

    if (!handle) {
      throw new Error("Expected auto-scroll handle to be ready")
    }
    const readyHandle = handle

    await act(async () => {
      readyHandle.pause()
    })
    metrics.scrollHeight = 1_000

    await act(async () => {
      root.render(
        <Harness
          working={false}
          contentDep={1}
          onReady={(nextHandle) => {
            handle = nextHandle
          }}
        />,
      )
    })

    expect(metrics.scrollTop).toBe(200)
  })
})
