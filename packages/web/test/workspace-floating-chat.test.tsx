import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  clampFloatingChatPosition,
  DirectoryChatBenchPageLayout,
  resolveDefaultFloatingChatPosition,
  resolveDefaultFloatingChatRect,
  resolveFloatingChatSize,
  resolveInitialFloatingChatContainerSize,
  type FloatingChatBounds,
  type FloatingChatRect,
} from "../src/components/directory-chat/directory-chat-bench-page-layout"
import {
  BENCH_CHAT_LAYOUT_DOCKED,
  BENCH_CHAT_LAYOUT_FLOATING,
  BENCH_LAYOUT_PROFILE_DOCUMENT,
  resolveBenchLayoutDefaults,
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

function dispatchResizePointerEvent(input: {
  target: Element
  type: "pointerdown" | "pointermove" | "pointerup"
  clientX: number
}) {
  input.target.dispatchEvent(
    new PointerEvent(input.type, {
      bubbles: true,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      buttons: input.type === "pointerup" ? 0 : 1,
      clientX: input.clientX,
      clientY: 100,
    }),
  )
}

function installPointerCapturePolyfill(): () => void {
  const setPointerCaptureMissing = !("setPointerCapture" in Element.prototype)
  const hasPointerCaptureMissing = !("hasPointerCapture" in Element.prototype)
  const releasePointerCaptureMissing = !("releasePointerCapture" in Element.prototype)

  if (setPointerCaptureMissing) {
    Object.defineProperty(Element.prototype, "setPointerCapture", {
      configurable: true,
      value() {},
    })
  }
  if (hasPointerCaptureMissing) {
    Object.defineProperty(Element.prototype, "hasPointerCapture", {
      configurable: true,
      value() {
        return false
      },
    })
  }
  if (releasePointerCaptureMissing) {
    Object.defineProperty(Element.prototype, "releasePointerCapture", {
      configurable: true,
      value() {},
    })
  }

  return () => {
    if (setPointerCaptureMissing) {
      Reflect.deleteProperty(Element.prototype, "setPointerCapture")
    }
    if (hasPointerCaptureMissing) {
      Reflect.deleteProperty(Element.prototype, "hasPointerCapture")
    }
    if (releasePointerCaptureMissing) {
      Reflect.deleteProperty(Element.prototype, "releasePointerCapture")
    }
  }
}

function TestBenchPageLayout(props: {
  initialMode?: BenchChatLayoutMode
  initialFloatingRect?: FloatingChatRect
}) {
  const [mode, setMode] = useState<BenchChatLayoutMode>(
    props.initialMode ?? BENCH_CHAT_LAYOUT_DOCKED,
  )
  const [floatingRect, setFloatingRect] = useState(
    () =>
      props.initialFloatingRect ??
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
      floatingRect={floatingRect}
      floatingChatState={floatingChatState}
      onChatLayoutModeChange={setMode}
      onFloatingRectChange={setFloatingRect}
      onFloatingChatStateChange={setFloatingChatState}
      dockedBenchLayout={{
        open: true,
        widthPx: 640,
        minWidthPx: 480,
        maxWidthPx: 800,
        onResizeIntent: () => undefined,
        onCollapse: () => undefined,
      }}
      bench={<div data-component="bench-probe">Bench</div>}
      conversation={
        <div data-component="conversation-probe">
          <span>Conversation</span>
          {mode !== BENCH_CHAT_LAYOUT_FLOATING ? (
            <button
              type="button"
              data-action="directory-chat-float"
              onClick={() => setMode(BENCH_CHAT_LAYOUT_FLOATING)}
            >
              Float
            </button>
          ) : null}
        </div>
      }
    />
  )
}

function StableWorkspaceLayoutHarness(props: { suppressLayoutMotion?: boolean }) {
  const [mode, setMode] = useState<BenchChatLayoutMode>(BENCH_CHAT_LAYOUT_DOCKED)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [targetKey, setTargetKey] = useState("target-1")
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
      floatingRect={floatingRect}
      floatingChatState={floatingChatState}
      onChatLayoutModeChange={setMode}
      onFloatingRectChange={setFloatingRect}
      onFloatingChatStateChange={setFloatingChatState}
      benchInteractive={mode === BENCH_CHAT_LAYOUT_FLOATING || workspaceOpen}
      suppressLayoutMotion={props.suppressLayoutMotion}
      dockedBenchLayout={{
        open: workspaceOpen,
        widthPx: 640,
        minWidthPx: 480,
        maxWidthPx: 800,
        onResizeIntent: () => undefined,
        onCollapse: () => setWorkspaceOpen(false),
      }}
      bench={<div key={targetKey} data-component="stable-bench-probe" data-target={targetKey} />}
      conversation={
        <div data-component="stable-conversation-probe">
          <button
            type="button"
            data-action="collapse-workspace"
            onClick={() => setWorkspaceOpen(false)}
          >
            Collapse
          </button>
          <button
            type="button"
            data-action="reveal-workspace"
            onClick={() => setWorkspaceOpen(true)}
          >
            Reveal
          </button>
          <button
            type="button"
            data-action="replace-target"
            onClick={() => setTargetKey("target-2")}
          >
            Replace target
          </button>
          {mode !== BENCH_CHAT_LAYOUT_FLOATING ? (
            <button
              type="button"
              data-action="float-workspace-chat"
              onClick={() => setMode(BENCH_CHAT_LAYOUT_FLOATING)}
            >
              Float
            </button>
          ) : null}
        </div>
      }
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
    const containerSize = {
      containerWidth: 300,
      containerHeight: 360,
      safeTop: 24,
    }
    const size = resolveFloatingChatSize(containerSize)
    const defaults = resolveBenchLayoutDefaults({
      profile: BENCH_LAYOUT_PROFILE_DOCUMENT,
      viewport: {
        widthPx: containerSize.containerWidth,
        heightPx: containerSize.containerHeight,
        safeTopPx: containerSize.safeTop,
      },
    })

    expect(size.width).toBeLessThanOrEqual(
      containerSize.containerWidth - defaults.floatingMarginPx * 2,
    )
    expect(size.height).toBeLessThanOrEqual(
      containerSize.containerHeight - containerSize.safeTop - defaults.floatingMarginPx,
    )
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
  })
})

describe("DirectoryChatBenchPageLayout floating chat", () => {
  let container: HTMLDivElement
  let root: Root
  let originalResizeObserver: typeof globalThis.ResizeObserver | undefined
  let cleanupPointerCapturePolyfill: (() => void) | undefined

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    cleanupPointerCapturePolyfill = installPointerCapturePolyfill()

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
    cleanupPointerCapturePolyfill?.()
    cleanupPointerCapturePolyfill = undefined
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("preserves conversation identity between docked and floating modes", async () => {
    await act(async () => {
      root.render(<TestBenchPageLayout />)
      await flushEffects()
    })

    const dockedConversation = requireElement(
      container.querySelector('[data-component="conversation-probe"]'),
    )
    const dockedBench = requireElement(container.querySelector('[data-component="bench-probe"]'))
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
    expect(
      container
        .querySelector('[data-component="directory-chat-floating-window"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("false")
    expect(container.querySelector('[data-component="conversation-probe"]')).toBe(
      dockedConversation,
    )
    expect(container.querySelector('[data-component="bench-probe"]')).toBe(dockedBench)

    const dockButton = requireElement(
      container.querySelector<HTMLButtonElement>('[data-action="directory-chat-dock"]'),
    )

    await act(async () => {
      dockButton.click()
      await flushEffects()
    })

    expect(container.querySelector('[data-action="directory-chat-float"]')).not.toBeNull()
    expect(container.querySelector('[data-component="conversation-probe"]')).toBe(
      dockedConversation,
    )
    expect(container.querySelector('[data-component="bench-probe"]')).toBe(dockedBench)
  })

  test("keeps a newly floating chat anchored while its container changes", async () => {
    const initialContainerSize = resolveInitialFloatingChatContainerSize()
    const expectedRect = resolveDefaultFloatingChatRect(
      initialContainerSize,
      BENCH_LAYOUT_PROFILE_DOCUMENT,
    )
    const expectedDefaults = resolveBenchLayoutDefaults({
      profile: BENCH_LAYOUT_PROFILE_DOCUMENT,
      viewport: {
        widthPx: initialContainerSize.containerWidth,
        heightPx: initialContainerSize.containerHeight,
        safeTopPx: initialContainerSize.safeTop,
      },
    })

    await act(async () => {
      root.render(
        <TestBenchPageLayout
          initialFloatingRect={{
            x: 100,
            y: 100,
            width: expectedRect.width,
            height: expectedRect.height,
          }}
        />,
      )
      await flushEffects()
    })

    await act(async () => {
      requireElement(
        container.querySelector<HTMLButtonElement>('[data-action="directory-chat-float"]'),
      ).click()
      await flushEffects()
    })

    const floatingWindow = requireElement(
      container.querySelector<HTMLElement>('[data-component="directory-chat-floating-window"]'),
    )
    expect(floatingWindow.style.left).toBe("")
    expect(floatingWindow.style.top).toBe("")
    expect(floatingWindow.style.right).toBe(`${expectedDefaults.floatingMarginPx}px`)
    expect(floatingWindow.style.bottom).toBe(`${expectedDefaults.floatingMarginPx}px`)
    expect(floatingWindow.style.width).toBe(`${expectedRect.width}px`)
    expect(floatingWindow.style.height).toBe(`${expectedRect.height}px`)
  })

  test("keeps stable hosts through visibility and mode changes and remounts only a new target", async () => {
    await act(async () => {
      root.render(<StableWorkspaceLayoutHarness />)
      await flushEffects()
    })

    const initialConversation = requireElement(
      container.querySelector('[data-component="stable-conversation-probe"]'),
    )
    const initialTarget = requireElement(
      container.querySelector('[data-component="stable-bench-probe"]'),
    )

    await act(async () => {
      requireElement(
        container.querySelector<HTMLButtonElement>('[data-action="collapse-workspace"]'),
      ).click()
      await flushEffects()
    })

    expect(
      container
        .querySelector('[data-component="directory-chat-bench-host"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true")
    expect(
      container
        .querySelector('[data-component="directory-chat-bench-host"]')
        ?.hasAttribute("inert"),
    ).toBe(true)
    expect(container.querySelector('[data-component="stable-conversation-probe"]')).toBe(
      initialConversation,
    )
    expect(container.querySelector('[data-component="stable-bench-probe"]')).toBe(initialTarget)

    await act(async () => {
      requireElement(
        container.querySelector<HTMLButtonElement>('[data-action="reveal-workspace"]'),
      ).click()
      requireElement(
        container.querySelector<HTMLButtonElement>('[data-action="float-workspace-chat"]'),
      ).click()
      await flushEffects()
    })

    expect(container.querySelector('[data-component="stable-conversation-probe"]')).toBe(
      initialConversation,
    )
    expect(container.querySelector('[data-component="stable-bench-probe"]')).toBe(initialTarget)

    await act(async () => {
      requireElement(
        container.querySelector<HTMLButtonElement>('[data-action="directory-chat-dock"]'),
      ).click()
      requireElement(
        container.querySelector<HTMLButtonElement>('[data-action="replace-target"]'),
      ).click()
      await flushEffects()
    })

    expect(container.querySelector('[data-component="stable-conversation-probe"]')).toBe(
      initialConversation,
    )
    expect(container.querySelector('[data-component="stable-bench-probe"]')).not.toBe(initialTarget)
  })

  test("keeps the live conversation visible while native transition pixels are retained", async () => {
    await act(async () => {
      root.render(<StableWorkspaceLayoutHarness suppressLayoutMotion />)
      await flushEffects()
    })

    const initialConversation = requireElement(
      container.querySelector('[data-component="stable-conversation-probe"]'),
    )
    const conversationHost = requireElement(
      container.querySelector<HTMLElement>('[data-component="directory-chat-docked-window"]'),
    )
    expect(conversationHost.style.visibility).toBe("")
    expect(conversationHost.hasAttribute("inert")).toBeFalse()

    await act(async () => {
      root.render(<StableWorkspaceLayoutHarness suppressLayoutMotion={false} />)
      await flushEffects()
    })

    expect(container.querySelector('[data-component="stable-conversation-probe"]')).toBe(
      initialConversation,
    )
    expect(conversationHost.style.visibility).toBe("")
    expect(conversationHost.hasAttribute("inert")).toBeFalse()
  })

  test("keeps docked transcript geometry instant", async () => {
    await act(async () => {
      root.render(<StableWorkspaceLayoutHarness />)
      await flushEffects()
    })

    const directLayout = requireElement(
      container.querySelector('[data-component="directory-chat-bench-page-layout"]'),
    )
    const directBenchHost = requireElement(
      container.querySelector('[data-component="directory-chat-bench-host"]'),
    )
    const directConversation = requireElement(
      container.querySelector('[data-component="directory-chat-docked-window"]'),
    )
    expect(directLayout.getAttribute("data-layout-motion")).toBe("instant")
    expect(directBenchHost.classList.contains("transition-none")).toBeTrue()
    expect(directConversation.classList.contains("transition-none")).toBeTrue()

    await act(async () => {
      root.render(<StableWorkspaceLayoutHarness suppressLayoutMotion />)
      await flushEffects()
    })

    const instantLayout = requireElement(
      container.querySelector('[data-component="directory-chat-bench-page-layout"]'),
    )
    const instantBenchHost = requireElement(
      container.querySelector('[data-component="directory-chat-bench-host"]'),
    )
    const instantConversation = requireElement(
      container.querySelector('[data-component="directory-chat-docked-window"]'),
    )
    expect(instantLayout.getAttribute("data-layout-motion")).toBe("instant")
    expect(instantBenchHost.classList.contains("transition-none")).toBeTrue()
    expect(instantBenchHost.classList.contains("duration-200")).toBeFalse()
    expect(instantConversation.classList.contains("transition-none")).toBeTrue()
    expect(instantConversation.classList.contains("duration-200")).toBeFalse()
  })

  test("collapses docked Bench when the divider is dragged below threshold", async () => {
    await act(async () => {
      root.render(<StableWorkspaceLayoutHarness />)
      await flushEffects()
    })

    const resizeHandle = requireElement(
      container.querySelector('[data-component="directory-chat-docked-bench-resize-handle"]'),
    )

    await act(async () => {
      dispatchResizePointerEvent({
        target: resizeHandle,
        type: "pointerdown",
        clientX: 900,
      })
      dispatchResizePointerEvent({
        target: resizeHandle,
        type: "pointermove",
        clientX: 1_400,
      })
      dispatchResizePointerEvent({
        target: resizeHandle,
        type: "pointerup",
        clientX: 1_400,
      })
      await flushEffects()
    })

    expect(
      container
        .querySelector('[data-component="directory-chat-bench-host"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true")
    expect(
      container.querySelector('[data-component="directory-chat-docked-bench-resize-handle"]'),
    ).toBeNull()
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

    expect(
      container
        .querySelector('[data-component="directory-chat-floating-window"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true")
    expect(
      container.querySelector('[data-component="directory-chat-floating-restore"]'),
    ).not.toBeNull()
    const minimizedConversation = requireElement(
      container.querySelector('[data-component="conversation-probe"]'),
    )

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
    expect(container.querySelector('[data-component="conversation-probe"]')).toBe(
      minimizedConversation,
    )
  })
})
