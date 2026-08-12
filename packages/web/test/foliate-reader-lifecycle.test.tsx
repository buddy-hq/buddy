import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BenchSurfaceActivityProvider } from "../src/components/bench/bench-surface-activity"
import type { DocumentReaderHandle, ReaderSource } from "../src/components/readers/reader-types"
import type {
  FoliateReaderSource,
  ReaderAnnotation,
} from "../src/components/readers/foliate-reader-types"
import {
  buildBookPersistenceKey,
  loadGlobalPreferences,
  saveBookState,
  saveGlobalPreferences,
} from "../src/components/readers/utils/foliate-storage"

const ASYNC_POLL_MS = 10
const ASYNC_TIMEOUT_MS = 2_000

let openCount = 0
let closeCount = 0
let annotationAddCount = 0
let annotationDeleteCount = 0
let annotationStateCount = 0

type ResizeObserverHarness = {
  callback: ResizeObserverCallback
  disconnected: boolean
  observed: Set<Element>
  observer: ResizeObserver
}

class LifecycleView extends HTMLElement {
  private annotationKeys = new Set<string>()
  private contentDocument = document.implementation.createHTMLDocument("Lifecycle EPUB")
  private overlayer = {
    element: document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    add: (key: string) => {
      this.annotationKeys.add(key)
      annotationAddCount += 1
    },
    remove: (key: string) => {
      if (!this.annotationKeys.delete(key)) return
      annotationDeleteCount += 1
    },
    redraw: () => undefined,
    hitTest: () => [undefined, undefined],
  }
  book = {
    metadata: { title: "Lifecycle EPUB", author: "Buddy" },
    sections: [{ id: "chapter.xhtml", cfi: "epubcfi(/6/4)", load: () => "chapter" }],
    toc: [],
    pageList: [],
    landmarks: [],
  }
  history = Object.assign(new EventTarget(), {
    canGoBack: false,
    canGoForward: false,
    back: () => undefined,
    forward: () => undefined,
  })
  isFixedLayout = false
  lastLocation:
    | {
        cfi: string
        index: number
        location: { current: number; total: number }
        range: Range
      }
    | undefined
  renderer = Object.assign(document.createElement("div"), {
    start: 100,
    getContents: () => [
      {
        index: 0,
        doc: this.contentDocument,
        overlayer: this.overlayer,
      },
    ],
    goTo: async () => undefined,
  })

  async open(): Promise<void> {
    openCount += 1
  }

  async init(): Promise<void> {
    const range = this.contentDocument.createRange()
    range.selectNodeContents(this.contentDocument.body)
    this.lastLocation = {
      cfi: "epubcfi(/6/4!/4/2:0)",
      index: 0,
      location: { current: 0, total: 1 },
      range,
    }
    this.dispatchEvent(new CustomEvent("relocate", { detail: this.lastLocation }))
  }

  resolveNavigation() {
    const range = this.contentDocument.createRange()
    range.selectNodeContents(this.contentDocument.body)
    return { index: 0, anchor: () => range }
  }

  getProgressOf() {
    return { tocItem: { label: "Chapter" } }
  }

  close(): void {
    closeCount += 1
  }
}

if (!customElements.get("buddy-lifecycle-foliate-view")) {
  customElements.define("buddy-lifecycle-foliate-view", LifecycleView)
}

mock.module("foliate-js/view.js", () => ({ View: LifecycleView }))

type DocumentReaderModule = typeof import("../src/components/readers/document-reader")
let documentReaderModule: DocumentReaderModule | undefined

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt >= ASYNC_TIMEOUT_MS) {
      throw new Error("Timed out waiting for the Foliate lifecycle condition")
    }
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, ASYNC_POLL_MS))
    })
  }
}

describe("Foliate reader lifecycle", () => {
  let container: HTMLDivElement
  let root: Root

  beforeAll(async () => {
    documentReaderModule = await import("../src/components/readers/document-reader")
  })

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    openCount = 0
    closeCount = 0
    annotationAddCount = 0
    annotationDeleteCount = 0
    annotationStateCount = 0
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("does not reopen EPUB content when its source ID and persistence suffix resolve", async () => {
    const module = documentReaderModule
    if (!module) throw new Error("DocumentReader module was not initialized")

    const blob = new Blob(["epub"], { type: "application/epub+zip" })
    const errors: Error[] = []
    const pathSource: ReaderSource = {
      kind: "blob",
      blob,
      name: "lifecycle.epub",
      sourceId: "workspace-path:lifecycle.epub",
      format: "epub",
    }
    const objectSource: ReaderSource = {
      ...pathSource,
      sourceId: "workspace-object:resource-1",
    }

    await act(async () => {
      root.render(
        <module.DocumentReader
          source={pathSource}
          showToolbar={false}
          onError={(error) => errors.push(error)}
        />,
      )
    })
    await waitFor(() => openCount === 1 || errors.length > 0)
    expect(errors).toEqual([])

    await act(async () => {
      root.render(
        <module.DocumentReader
          source={objectSource}
          persistenceSuffix="notebook:resource-1"
          showToolbar={false}
          onError={(error) => errors.push(error)}
        />,
      )
      await Promise.resolve()
    })

    expect(errors).toEqual([])
    expect(openCount).toBe(1)
    expect(closeCount).toBe(0)
  })

  test("does not navigate or reopen the resident Foliate view across Bench switches", async () => {
    const module = documentReaderModule
    if (!module) throw new Error("DocumentReader module was not initialized")

    const source: ReaderSource = {
      kind: "blob",
      blob: new Blob(["epub"], { type: "application/epub+zip" }),
      name: "reactivation.epub",
      sourceId: "workspace-path:reactivation.epub",
      format: "epub",
    }
    const renderReader = (active: boolean) => (
      <BenchSurfaceActivityProvider value={active}>
        <module.DocumentReader source={source} showToolbar={false} />
      </BenchSurfaceActivityProvider>
    )

    await act(async () => {
      root.render(renderReader(true))
    })
    await waitFor(() => openCount === 1)

    await act(async () => {
      root.render(renderReader(false))
      await Promise.resolve()
    })
    const view = container.querySelector<LifecycleView>("buddy-lifecycle-foliate-view")
    if (!view) throw new Error("Lifecycle view was not mounted")
    expect(openCount).toBe(1)
    expect(closeCount).toBe(0)
    expect(view.renderer.start).toBe(100)

    await act(async () => {
      root.render(renderReader(true))
      await new Promise<void>((resolve) => setTimeout(resolve, ASYNC_POLL_MS))
    })
    expect(openCount).toBe(1)
    expect(closeCount).toBe(0)
    expect(view.renderer.start).toBe(100)
  })

  test("updates responsive margins only while the Foliate surface is active", async () => {
    const module = documentReaderModule
    if (!module) throw new Error("DocumentReader module was not initialized")

    const originalResizeObserver = globalThis.ResizeObserver
    const resizeObservers: ResizeObserverHarness[] = []
    class MockResizeObserver implements ResizeObserver {
      readonly harness: ResizeObserverHarness

      constructor(callback: ResizeObserverCallback) {
        this.harness = {
          callback,
          disconnected: false,
          observed: new Set<Element>(),
          observer: this,
        }
        resizeObservers.push(this.harness)
      }

      observe(target: Element): void {
        this.harness.observed.add(target)
      }

      unobserve(target: Element): void {
        this.harness.observed.delete(target)
      }

      disconnect(): void {
        this.harness.disconnected = true
        this.harness.observed.clear()
      }

      takeRecords(): ResizeObserverEntry[] {
        return []
      }
    }
    globalThis.ResizeObserver = MockResizeObserver
    saveGlobalPreferences({
      ...loadGlobalPreferences("paper", "paginated"),
      marginPx: 120,
    })

    const source: ReaderSource = {
      kind: "blob",
      blob: new Blob(["epub"], { type: "application/epub+zip" }),
      name: "responsive-margin.epub",
      sourceId: "workspace-path:responsive-margin.epub",
      format: "epub",
    }
    const renderReader = (active: boolean) => (
      <BenchSurfaceActivityProvider value={active}>
        <module.DocumentReader source={source} showToolbar={false} />
      </BenchSurfaceActivityProvider>
    )

    try {
      await act(async () => {
        root.render(renderReader(true))
      })
      await waitFor(() => resizeObservers.length === 1)
      const view = container.querySelector("buddy-lifecycle-foliate-view")
      if (!(view instanceof LifecycleView))
        throw new Error("Foliate lifecycle view was not mounted")
      let viewportWidth = 800
      Object.defineProperty(view, "getBoundingClientRect", {
        configurable: true,
        value: () => DOMRect.fromRect({ width: viewportWidth, height: 600 }),
      })
      const activeObserver = resizeObservers[0]
      if (!activeObserver) throw new Error("Active resize observer was not created")

      activeObserver.callback([], activeObserver.observer)
      expect(view.renderer.getAttribute("margin")).toBe("120px")

      viewportWidth = 514
      activeObserver.callback([], activeObserver.observer)
      expect(view.renderer.getAttribute("margin")).toBe("97px")

      await act(async () => {
        root.render(renderReader(false))
        await Promise.resolve()
      })
      expect(activeObserver.disconnected).toBe(true)
      viewportWidth = 800
      activeObserver.callback([], activeObserver.observer)
      expect(view.renderer.getAttribute("margin")).toBe("97px")

      await act(async () => {
        root.render(renderReader(true))
        await Promise.resolve()
      })
      expect(openCount).toBe(1)
      expect(view.renderer.getAttribute("margin")).toBe("120px")
      expect(resizeObservers).toHaveLength(2)
    } finally {
      if (originalResizeObserver) globalThis.ResizeObserver = originalResizeObserver
      else Reflect.deleteProperty(globalThis, "ResizeObserver")
    }
  })

  test("does not refresh annotation tokens for reader preference changes", async () => {
    const module = documentReaderModule
    if (!module) throw new Error("DocumentReader module was not initialized")

    const blob = new Blob(["epub"], { type: "application/epub+zip" })
    const foliateSource: FoliateReaderSource = {
      kind: "blob",
      blob,
      name: "lifecycle.epub",
    }
    const source: ReaderSource = {
      ...foliateSource,
      sourceId: "workspace-path:lifecycle.epub",
      format: "epub",
    }
    const annotation: ReaderAnnotation = {
      value: "epubcfi(/6/4)",
      text: "Theme-aware highlight",
      note: "",
      style: "highlight",
      color: "#f59e0b",
      created: "2026-08-08T00:00:00.000Z",
      modified: "2026-08-08T00:00:00.000Z",
    }
    saveBookState(buildBookPersistenceKey(foliateSource, new LifecycleView().book), {
      bookmarks: [],
      annotations: [annotation],
    })
    const readerRef = createRef<DocumentReaderHandle>()

    await act(async () => {
      root.render(
        <module.DocumentReader
          ref={readerRef}
          source={source}
          showToolbar={false}
          onAnnotationsChange={(annotations) => {
            annotationStateCount = annotations.length
          }}
        />,
      )
    })
    await waitFor(() => annotationAddCount === 1 && annotationStateCount === 1)

    await act(async () => {
      readerRef.current?.setTheme("night")
      await Promise.resolve()
    })
    expect(annotationDeleteCount).toBe(0)
    expect(annotationAddCount).toBe(1)
  })
})
