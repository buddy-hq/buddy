import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  clampFloatingChatPosition,
  DirectoryChatBenchPageLayout,
  readInitialChatPanelWidth,
  resolveDefaultFloatingChatPosition,
  resolveDefaultFloatingChatRect,
  resolveFloatingChatSize,
  resolveInitialFloatingChatContainerSize,
  type FloatingChatBounds,
} from "../src/components/directory-chat/directory-chat-bench-page-layout"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  type BenchChatLayoutMode,
} from "../src/lib/bench-navigation"

async function flushEffects(delay = 0) {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delay)
  })
}

function requireElement<TElement extends Element>(element: TElement | null): TElement {
  if (!element) {
    throw new Error("Expected element to exist")
  }

  return element
}

function TestBenchPageLayout(props: { initialMode?: BenchChatLayoutMode }) {
  const [mode, setMode] = useState<BenchChatLayoutMode>(
    props.initialMode ?? BENCH_CHAT_LAYOUT_DOCKED,
  )
  const [dockedChatWidthPx, setDockedChatWidthPx] = useState(() =>
    readInitialChatPanelWidth(BENCH_LAYOUT_PROFILE_DOCUMENT),
  )
  const [floatingRect, setFloatingRect] = useState(() =>
    resolveDefaultFloatingChatRect(
      resolveInitialFloatingChatContainerSize(),
      BENCH_LAYOUT_PROFILE_DOCUMENT,
    ),
  )
  const [floatingChatState, setFloatingChatState] = useState<"open" | "minimized">("open")

  return (
    <DirectoryChatBenchPageLayout
      chatLayoutMode={mode}
      layoutProfile={BENCH_LAYOUT_PROFILE_DOCUMENT}
      dockedChatWidthPx={dockedChatWidthPx}
      floatingRect={floatingRect}
      floatingChatState={floatingChatState}
      onChatLayoutModeChange={setMode}
      onDockedChatWidthChange={setDockedChatWidthPx}
      onFloatingRectChange={setFloatingRect}
      onFloatingChatStateChange={setFloatingChatState}
      bench={<div data-component="bench-probe">Bench</div>}
      conversation={(controls) => (
        <div data-component="conversation-probe">
          <span>Conversation</span>
          {controls.onFloatChat ? (
            <button type="button" data-action="directory-chat-float" onClick={controls.onFloatChat}>
              Float
            </button>
          ) : null}
        </div>
      )}
    />
  )
}

describe("workspace floating chat helpers", () => {
  test("keeps floating chat within the workspace viewport", () => {
    const bounds: FloatingChatBounds = {
      containerWidth: 1_000,
      containerHeight: 800,
      width: 420,
      height: 320,
      margin: 20,
      safeTop: 48,
    }

    expect(clampFloatingChatPosition({ x: -200, y: -80 }, bounds)).toEqual({
      x: 20,
      y: 48,
    })
    expect(clampFloatingChatPosition({ x: 900, y: 900 }, bounds)).toEqual({
      x: 560,
      y: 460,
    })
  })

  test("places the floating chat low and right of center by default", () => {
    const bounds: FloatingChatBounds = {
      containerWidth: 1_000,
      containerHeight: 800,
      width: 420,
      height: 320,
      margin: 20,
      safeTop: 48,
    }

    expect(resolveDefaultFloatingChatPosition(bounds)).toEqual({
      x: 560,
      y: 460,
    })
  })

  test("shrinks the floating chat for narrow workspace viewports", () => {
    const size = resolveFloatingChatSize({
      containerWidth: 300,
      containerHeight: 360,
      safeTop: 24,
    })

    expect(size.width).toBeLessThanOrEqual(252)
    expect(size.height).toBeLessThanOrEqual(312)
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
  })
})

describe("DirectoryChatBenchPageLayout floating chat", () => {
  let container: HTMLDivElement
  let root: Root
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    originalResizeObserver = globalThis.ResizeObserver
    class MockResizeObserver implements ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("moves the existing conversation between docked and floating shells", async () => {
    await act(async () => {
      root.render(<TestBenchPageLayout />)
      await flushEffects()
    })

    expect(container.querySelector('[data-component="conversation-probe"]')).not.toBeNull()
    expect(container.querySelector('[data-component="directory-chat-floating-window"]')).toBeNull()

    const floatButton = requireElement(
      container.querySelector<HTMLButtonElement>('[data-action="directory-chat-float"]'),
    )

    await act(async () => {
      floatButton.click()
      await flushEffects()
    })

    expect(
      container.querySelector('[data-component="directory-chat-floating-window"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-component="conversation-probe"]')).not.toBeNull()

    const dockButton = requireElement(
      container.querySelector<HTMLButtonElement>('[data-action="directory-chat-dock"]'),
    )

    await act(async () => {
      dockButton.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-action="directory-chat-float"]')).not.toBeNull()
    expect(container.querySelector('[data-component="conversation-probe"]')).not.toBeNull()
  })

  test("can start with chat in a floating window", async () => {
    await act(async () => {
      root.render(<TestBenchPageLayout initialMode={BENCH_CHAT_LAYOUT_FLOATING} />)
      await flushEffects()
    })

    expect(
      container.querySelector('[data-component="directory-chat-floating-window"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-action="directory-chat-float"]')).toBeNull()
  })

  test("can minimize and restore the floating chat window", async () => {
    await act(async () => {
      root.render(<TestBenchPageLayout initialMode={BENCH_CHAT_LAYOUT_FLOATING} />)
      await flushEffects()
    })

    const minimizeButton = requireElement(
      container.querySelector<HTMLButtonElement>('[data-action="directory-chat-minimize"]'),
    )

    await act(async () => {
      minimizeButton.click()
      await flushEffects()
    })

    await act(async () => {
      await flushEffects(350)
    })

    expect(container.querySelector('[data-component="directory-chat-floating-window"]')).toBeNull()
    expect(
      container.querySelector('[data-component="directory-chat-floating-restore"]'),
    ).not.toBeNull()

    const restoreButton = requireElement(
      container.querySelector<HTMLButtonElement>('[data-action="directory-chat-restore"]'),
    )

    await act(async () => {
      restoreButton.click()
      await flushEffects()
    })

    await act(async () => {
      await flushEffects(350)
    })

    expect(
      container.querySelector('[data-component="directory-chat-floating-window"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-component="directory-chat-floating-restore"]')).toBeNull()
  })
})
