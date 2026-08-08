import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { DocumentReaderHandle, ReaderSource } from "../src/components/readers/reader-types"
import type {
  FoliateReaderSource,
  ReaderAnnotation,
} from "../src/components/readers/foliate-reader-types"
import {
  buildBookPersistenceKey,
  saveBookState,
} from "../src/components/readers/utils/foliate-storage"

const ASYNC_POLL_MS = 10
const ASYNC_TIMEOUT_MS = 2_000

let openCount = 0
let closeCount = 0
let annotationAddCount = 0
let annotationDeleteCount = 0
let annotationStateCount = 0

class LifecycleView extends HTMLElement {
  book = {
    metadata: { title: "Lifecycle EPUB", author: "Buddy" },
    sections: [],
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
  lastLocation = undefined
  renderer = undefined

  async open(): Promise<void> {
    openCount += 1
  }

  async init(): Promise<void> {}

  async addAnnotation(): Promise<undefined> {
    annotationAddCount += 1
    return undefined
  }

  async deleteAnnotation(): Promise<undefined> {
    annotationDeleteCount += 1
    return undefined
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
