import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useDurableScrollTop } from "../src/lib/use-durable-scroll-top"
import {
  readWorkspaceDrawerUiState,
  useWorkspaceDrawerUiState,
  writeWorkspaceDrawerUiState,
} from "../src/state/workspace-drawer-ui-state"

const DRAWER_KEY = "/notebooks/first::sources"
const SAVED_SCROLL_TOP = 180

type ScrollMetrics = {
  maximum: number
  scrollTop: number
}

type ResizeObserverHarness = {
  callback: ResizeObserverCallback
  disconnected: boolean
  observer: ResizeObserver
}

let container: HTMLDivElement | undefined
let root: Root | undefined
let originalResizeObserver: typeof globalThis.ResizeObserver | undefined
let resizeObservers: ResizeObserverHarness[] = []

function ScrollHarness(props: { metrics: ScrollMetrics }) {
  const { containerRef, onScroll } = useDurableScrollTop(DRAWER_KEY)

  return (
    <div
      ref={(node) => {
        if (node) {
          Object.defineProperty(node, "scrollTop", {
            configurable: true,
            get: () => props.metrics.scrollTop,
            set: (value: number) => {
              props.metrics.scrollTop = Math.min(Math.max(0, value), props.metrics.maximum)
            },
          })
        }
        containerRef.current = node
      }}
      onScroll={onScroll}
    />
  )
}

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  useWorkspaceDrawerUiState.setState({ byKey: {} })
  resizeObservers = []
  originalResizeObserver = globalThis.ResizeObserver

  class MockResizeObserver implements ResizeObserver {
    readonly harness: ResizeObserverHarness

    constructor(callback: ResizeObserverCallback) {
      this.harness = {
        callback,
        disconnected: false,
        observer: this,
      }
      resizeObservers.push(this.harness)
    }

    disconnect(): void {
      this.harness.disconnected = true
    }

    observe(): void {}

    unobserve(): void {}
  }

  globalThis.ResizeObserver = MockResizeObserver
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  container?.remove()
  if (originalResizeObserver) {
    globalThis.ResizeObserver = originalResizeObserver
  } else {
    Reflect.deleteProperty(globalThis, "ResizeObserver")
  }
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  root = undefined
  container = undefined
})

describe("useDurableScrollTop", () => {
  test("retries a clamped restore after async content grows", async () => {
    writeWorkspaceDrawerUiState(DRAWER_KEY, { scrollTop: SAVED_SCROLL_TOP })
    const metrics: ScrollMetrics = { maximum: 0, scrollTop: 0 }

    await act(async () => {
      root?.render(<ScrollHarness metrics={metrics} />)
    })

    expect(metrics.scrollTop).toBe(0)
    expect(resizeObservers).toHaveLength(1)

    metrics.maximum = 400
    await act(async () => {
      const harness = resizeObservers[0]
      harness?.callback([], harness.observer)
    })

    expect(metrics.scrollTop).toBe(SAVED_SCROLL_TOP)
    expect(resizeObservers[0]?.disconnected).toBeTrue()
  })

  test("does not overwrite a saved offset when unmounted before restoration", async () => {
    writeWorkspaceDrawerUiState(DRAWER_KEY, { scrollTop: SAVED_SCROLL_TOP })
    const metrics: ScrollMetrics = { maximum: 0, scrollTop: 0 }

    await act(async () => {
      root?.render(<ScrollHarness metrics={metrics} />)
    })
    await act(async () => {
      root?.unmount()
    })
    root = undefined

    expect(readWorkspaceDrawerUiState(DRAWER_KEY)?.scrollTop).toBe(SAVED_SCROLL_TOP)
  })
})
