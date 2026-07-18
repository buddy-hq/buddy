import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatScrollProvider } from "../src/components/chat/chat-scroll-context"
import { VirtualizedMarkdown } from "../src/components/markdown/virtualized-markdown"

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

class TestIntersectionObserver implements IntersectionObserver {
  static instances: TestIntersectionObserver[] = []

  readonly root: Element | Document | null
  readonly rootMargin: string
  readonly thresholds: readonly number[]
  private readonly callback: IntersectionObserverCallback
  private targets = new Set<Element>()

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.root = options?.root ?? null
    this.rootMargin = options?.rootMargin ?? "0px"
    this.thresholds = Array.isArray(options?.threshold)
      ? options.threshold
      : [options?.threshold ?? 0]
    TestIntersectionObserver.instances.push(this)
  }

  disconnect(): void {
    this.targets.clear()
  }

  observe(target: Element): void {
    this.targets.add(target)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  unobserve(target: Element): void {
    this.targets.delete(target)
  }

  observes(target: Element): boolean {
    return this.targets.has(target)
  }

  trigger(target: Element, isIntersecting: boolean): void {
    const rect = target.getBoundingClientRect()
    const entry: IntersectionObserverEntry = {
      boundingClientRect: rect,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: rect,
      isIntersecting,
      rootBounds: null,
      target,
      time: performance.now(),
    }
    this.callback([entry], this)
  }
}

function longMarkdown(): string {
  return Array.from(
    { length: 36 },
    (_, index) => `## Section ${index + 1}\n\n${`Sentence ${index + 1}. `.repeat(40)}`,
  ).join("\n\n")
}

describe("virtualized Markdown residency", () => {
  let container: HTMLDivElement
  let viewport: HTMLDivElement
  let root: Root
  let originalIntersectionObserver: typeof globalThis.IntersectionObserver | undefined

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    originalIntersectionObserver = globalThis.IntersectionObserver
    globalThis.IntersectionObserver = TestIntersectionObserver
    TestIntersectionObserver.instances = []
    viewport = document.createElement("div")
    container = document.createElement("div")
    viewport.append(container)
    document.body.append(viewport)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    viewport.remove()
    if (originalIntersectionObserver) {
      globalThis.IntersectionObserver = originalIntersectionObserver
    } else {
      Reflect.deleteProperty(globalThis, "IntersectionObserver")
    }
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  test("keeps stable shells but evicts heavy offscreen DOM after terminal", async () => {
    const text = longMarkdown()
    const viewportRef = { current: viewport }

    await act(async () => {
      root.render(
        <ChatScrollProvider viewportRef={viewportRef}>
          <VirtualizedMarkdown text={text} cacheKey="resident" streaming />
        </ChatScrollProvider>,
      )
      await flushEffects()
    })

    const shells = Array.from(
      container.querySelectorAll<HTMLElement>("[data-markdown-virtual-block-key]"),
    )
    expect(shells.length).toBeGreaterThan(2)
    const tailShell = shells.at(-1)
    expect(tailShell?.dataset.markdownResidency).toBe("resident")
    const tailContent = tailShell?.querySelector("[data-markdown-block-key]")
    expect(tailContent).not.toBeNull()
    expect(shells.some((shell) => shell.dataset.markdownResidency === "placeholder")).toBe(true)
    if (!tailShell) throw new Error("Expected a virtualized tail shell")

    await act(async () => {
      root.render(
        <ChatScrollProvider viewportRef={viewportRef}>
          <VirtualizedMarkdown text={text} cacheKey="resident" />
        </ChatScrollProvider>,
      )
      await flushEffects()
    })

    const terminalTailShell = container.querySelector<HTMLElement>(
      `[data-markdown-virtual-block-key="${tailShell.dataset.markdownVirtualBlockKey}"]`,
    )
    expect(terminalTailShell).toBe(tailShell)
    expect(terminalTailShell?.querySelector("[data-markdown-block-key]")).toBe(tailContent)

    const observer = TestIntersectionObserver.instances.find((candidate) =>
      terminalTailShell ? candidate.observes(terminalTailShell) : false,
    )
    expect(observer).not.toBeUndefined()
    if (!observer || !terminalTailShell) throw new Error("Expected tail residency observer")

    await act(async () => {
      observer.trigger(terminalTailShell, false)
      await flushEffects()
    })

    expect(terminalTailShell.dataset.markdownResidency).toBe("placeholder")
    expect(terminalTailShell.querySelector("[data-markdown-block-key]")).toBeNull()

    await act(async () => {
      observer.trigger(terminalTailShell, true)
      await flushEffects()
    })

    expect(terminalTailShell.dataset.markdownResidency).toBe("resident")
    expect(terminalTailShell.querySelector("[data-markdown-block-key]")).not.toBeNull()
  })

  test("reuses measured placeholder heights across transcript remounts at the same width", async () => {
    const text = longMarkdown()
    const viewportRef = { current: viewport }
    let viewportWidth = 800
    Object.defineProperty(viewport, "clientWidth", {
      configurable: true,
      get: () => viewportWidth,
    })
    const renderMarkdown = () => (
      <ChatScrollProvider viewportRef={viewportRef}>
        <VirtualizedMarkdown text={text} cacheKey="remount-measurement" />
      </ChatScrollProvider>
    )

    await act(async () => {
      root.render(renderMarkdown())
      await flushEffects()
    })

    const measuredShell = container.querySelectorAll<HTMLElement>(
      "[data-markdown-virtual-block-key]",
    )[1]
    if (!measuredShell) throw new Error("Expected a virtualized Markdown block to measure")
    measuredShell.getBoundingClientRect = () => new DOMRect(0, 0, viewportWidth, 137)
    const observer = TestIntersectionObserver.instances.find((candidate) =>
      candidate.observes(measuredShell),
    )
    if (!observer) throw new Error("Expected the Markdown block residency observer")

    await act(async () => {
      observer.trigger(measuredShell, true)
      await flushEffects()
      observer.trigger(measuredShell, false)
      await flushEffects()
    })
    expect(measuredShell.style.minHeight).toBe("137px")

    await act(async () => {
      root.render(null)
      await flushEffects()
      root.render(renderMarkdown())
      await flushEffects()
    })

    const restoredShell = container.querySelectorAll<HTMLElement>(
      "[data-markdown-virtual-block-key]",
    )[1]
    expect(restoredShell?.style.minHeight).toBe("137px")

    await act(async () => {
      root.render(null)
      await flushEffects()
      viewportWidth = 600
      root.render(renderMarkdown())
      await flushEffects()
    })

    const resizedShell = container.querySelectorAll<HTMLElement>(
      "[data-markdown-virtual-block-key]",
    )[1]
    expect(resizedShell?.style.minHeight).not.toBe("137px")
  })
})
