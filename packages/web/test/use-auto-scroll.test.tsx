import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useLayoutEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useAutoScroll } from "../src/lib/directory-chat/use-auto-scroll"

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)

type HarnessHandle = {
  pause: () => void
  forceScrollToBottom: () => void
  initialScrollOffset: () => number | undefined
  shouldAnchorBottom: () => boolean
}

type HarnessProps = {
  attachmentKey: string
  onReady: (handle: HarnessHandle) => void
}

type ScrollMetrics = {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}

function Harness(props: HarnessProps) {
  const onReady = props.onReady
  const auto = useAutoScroll({ attachmentKey: props.attachmentKey })

  useLayoutEffect(() => {
    onReady({
      pause: auto.pause,
      forceScrollToBottom: auto.forceScrollToBottom,
      initialScrollOffset: auto.initialScrollOffset,
      shouldAnchorBottom: auto.shouldAnchorBottom,
    })
  }, [
    auto.forceScrollToBottom,
    auto.initialScrollOffset,
    auto.pause,
    auto.shouldAnchorBottom,
    onReady,
  ])

  return (
    <div
      data-testid="scroll"
      ref={(node) => {
        Reflect.set(auto.scrollRef, "current", node)
      }}
      onScroll={auto.handleScroll}
    >
      <div data-testid="content" />
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

  test("explicit sends force the viewport to the bottom", async () => {
    let handle: HarnessHandle | undefined

    await act(async () => {
      root.render(
        <Harness
          attachmentKey="session-1"
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
      scrollTop: 120,
    }
    installScrollMetrics(scrollElement, metrics)

    await act(async () => {
      handle?.forceScrollToBottom()
    })

    expect(metrics.scrollTop).toBe(400)
    expect(handle?.shouldAnchorBottom()).toBe(true)
  })

  test("does not pull the viewport back down after an explicit detach", async () => {
    let handle: HarnessHandle | undefined

    await act(async () => {
      root.render(
        <Harness
          attachmentKey="session-1"
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
    expect(readyHandle.shouldAnchorBottom()).toBe(false)
    metrics.scrollHeight = 1_000
    await act(async () => {
      scrollElement.dispatchEvent(new Event("scroll", { bubbles: true }))
    })

    expect(metrics.scrollTop).toBe(200)
  })

  test("starts a newly selected session attached after the previous session detached", async () => {
    let handle: HarnessHandle | undefined
    const onReady = (nextHandle: HarnessHandle) => {
      handle = nextHandle
    }

    await act(async () => {
      root.render(<Harness attachmentKey="session-1" onReady={onReady} />)
    })

    const scrollElement = requireDiv(container, '[data-testid="scroll"]')
    installScrollMetrics(scrollElement, {
      clientHeight: 400,
      scrollHeight: 1_200,
      scrollTop: 300,
    })

    await act(async () => {
      handle?.pause()
    })
    expect(handle?.shouldAnchorBottom()).toBe(false)

    await act(async () => {
      root.render(<Harness attachmentKey="session-2" onReady={onReady} />)
    })

    expect(handle?.shouldAnchorBottom()).toBe(true)
    expect(handle?.initialScrollOffset()).toBeUndefined()
  })

  test("restores an attached session's finite offset when switching back", async () => {
    let handle: HarnessHandle | undefined
    const onReady = (nextHandle: HarnessHandle) => {
      handle = nextHandle
    }

    await act(async () => {
      root.render(<Harness attachmentKey="session-1" onReady={onReady} />)
    })

    const scrollElement = requireDiv(container, '[data-testid="scroll"]')
    const metrics: ScrollMetrics = {
      clientHeight: 400,
      scrollHeight: 1_600,
      scrollTop: 1_200,
    }
    installScrollMetrics(scrollElement, metrics)

    await act(async () => {
      scrollElement.dispatchEvent(new Event("scroll", { bubbles: true }))
    })
    expect(handle?.shouldAnchorBottom()).toBe(true)

    await act(async () => {
      root.render(<Harness attachmentKey="session-2" onReady={onReady} />)
    })
    expect(handle?.initialScrollOffset()).toBeUndefined()

    await act(async () => {
      root.render(<Harness attachmentKey="session-1" onReady={onReady} />)
    })
    expect(handle?.shouldAnchorBottom()).toBe(true)
    expect(handle?.initialScrollOffset()).toBe(1_200)
  })

  test("restores each recently visited session's detached reading position", async () => {
    let handle: HarnessHandle | undefined
    const onReady = (nextHandle: HarnessHandle) => {
      handle = nextHandle
    }

    await act(async () => {
      root.render(<Harness attachmentKey="session-1" onReady={onReady} />)
    })

    const scrollElement = requireDiv(container, '[data-testid="scroll"]')
    const metrics: ScrollMetrics = {
      clientHeight: 400,
      scrollHeight: 1_600,
      scrollTop: 540,
    }
    installScrollMetrics(scrollElement, metrics)

    await act(async () => {
      handle?.pause()
      scrollElement.dispatchEvent(new Event("scroll", { bubbles: true }))
    })
    expect(handle?.shouldAnchorBottom()).toBe(false)

    await act(async () => {
      root.render(<Harness attachmentKey="session-2" onReady={onReady} />)
    })
    expect(handle?.shouldAnchorBottom()).toBe(true)

    metrics.scrollTop = 0
    await act(async () => {
      handle?.pause()
      scrollElement.dispatchEvent(new Event("scroll", { bubbles: true }))
    })

    await act(async () => {
      root.render(<Harness attachmentKey="session-1" onReady={onReady} />)
    })
    expect(handle?.shouldAnchorBottom()).toBe(false)
    expect(handle?.initialScrollOffset()).toBe(540)

    await act(async () => {
      root.render(<Harness attachmentKey="session-2" onReady={onReady} />)
    })
    expect(handle?.shouldAnchorBottom()).toBe(false)
    expect(handle?.initialScrollOffset()).toBe(0)

    await act(async () => {
      handle?.forceScrollToBottom()
      root.render(<Harness attachmentKey="session-1" onReady={onReady} />)
    })
    await act(async () => {
      root.render(<Harness attachmentKey="session-2" onReady={onReady} />)
    })
    expect(handle?.shouldAnchorBottom()).toBe(true)
    expect(handle?.initialScrollOffset()).toBe(1_200)
  })
})
