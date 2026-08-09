import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { BOOK_STATE_STORAGE_KEY_PREFIX } from "../src/components/readers/foliate-reader-constants"
import type {
  DocumentReaderHandle,
  ReaderAnnotation,
  ReaderRelocation,
  ReaderSnapshot,
  ReaderSource,
} from "../src/components/readers/reader-types"
import { createSyntheticMultiPagePdf } from "./fixtures/synthetic-pdf"

const ASYNC_SMOKE_TIMEOUT_MS = 2_000
const ASYNC_SMOKE_POLL_MS = 10

type DocumentReaderModule = typeof import("../src/components/readers/document-reader")
type PdfViewerSessionModule = typeof import("../src/components/readers/pdf/pdf-viewer-session")

let documentReaderModule: DocumentReaderModule | undefined
let pdfViewerSessionModule: PdfViewerSessionModule | undefined

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt >= ASYNC_SMOKE_TIMEOUT_MS) {
      throw new Error("Timed out waiting for the document reader smoke condition")
    }
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ASYNC_SMOKE_POLL_MS)
      })
    })
  }
}

describe("DocumentReader PDF integration", () => {
  let container: HTMLDivElement
  let root: Root

  beforeAll(async () => {
    const pdfJsModuleUrl = import.meta.resolve("pdfjs-dist")
    mock.module("virtual:buddy-pdfjs-runtime", () => ({
      pdfJsRuntimeBaseUrl: new URL("../", pdfJsModuleUrl).toString(),
      pdfJsWorkerSrc: new URL("pdf.worker.mjs", pdfJsModuleUrl).toString(),
    }))
    documentReaderModule = await import("../src/components/readers/document-reader")
    pdfViewerSessionModule = await import("../src/components/readers/pdf/pdf-viewer-session")
  })

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    Object.defineProperties(container, {
      clientHeight: { configurable: true, value: 720 },
      clientWidth: { configurable: true, value: 960 },
    })
    document.body.appendChild(container)
    localStorage.clear()
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await Promise.resolve()
    })
    document.body.replaceChildren()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("lazy-loads PDF.js and publishes a neutral snapshot for a real multi-page PDF", async () => {
    const module = documentReaderModule
    if (!module) throw new Error("DocumentReader module was not initialized")

    const readerRef = createRef<DocumentReaderHandle>()
    const snapshots: ReaderSnapshot[] = []
    const locations: ReaderRelocation[] = []
    const errors: Error[] = []
    const source = {
      kind: "blob",
      blob: new Blob([createSyntheticMultiPagePdf()], { type: "application/pdf" }),
      name: "synthetic.pdf",
      sourceId: "synthetic-document-reader",
      format: "pdf",
    } as const

    await act(async () => {
      root.render(
        <module.DocumentReader
          ref={readerRef}
          source={source}
          showToolbar={false}
          onReady={(snapshot) => snapshots.push(snapshot)}
          onLocationChange={(location) => locations.push(location)}
          onError={(error) => errors.push(error)}
        />,
      )
      await Promise.resolve()
    })
    await waitFor(() => snapshots.length > 0 || errors.length > 0)

    expect(errors).toEqual([])
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({
      engine: "pdf",
      title: "Buddy Synthetic PDF",
      author: "Buddy Tests",
      formatLabel: "PDF",
      isFixedLayout: true,
      pageCount: 3,
    })
    expect(snapshots[0]?.toc.map((item) => item.label)).toEqual([
      "Page one",
      "Page two",
      "Page three",
    ])
    expect(snapshots[0]?.pageList.map((item) => item.label)).toEqual(["i", "Sheet 7", "Appendix"])
    expect(readerRef.current?.getSnapshot()).toEqual(snapshots[0])
    await waitFor(() => locations.some((location) => location.currentPassageText !== undefined))
    expect(locations.at(-1)).toMatchObject({
      tocLabel: "Page one",
      pageLabel: "i",
      currentPassageText: "Buddy PDF page one alpha",
    })
  })

  test("does not let a stale PDF teardown erase a replacement document", async () => {
    const module = documentReaderModule
    if (!module) throw new Error("DocumentReader module was not initialized")

    let releaseStaleRead: ((value: ArrayBuffer) => void) | undefined
    class DeferredPdfBlob extends Blob {
      override arrayBuffer(): Promise<ArrayBuffer> {
        return new Promise<ArrayBuffer>((resolve) => {
          releaseStaleRead = resolve
        })
      }
    }

    const pdfBytes = createSyntheticMultiPagePdf()
    const staleSource: ReaderSource = {
      kind: "blob",
      blob: new DeferredPdfBlob([pdfBytes], { type: "application/pdf" }),
      name: "stale.pdf",
      sourceId: "stale-document-reader",
      format: "pdf",
    }
    const replacementSource: ReaderSource = {
      kind: "blob",
      blob: new Blob([pdfBytes], { type: "application/pdf" }),
      name: "replacement.pdf",
      sourceId: "replacement-document-reader",
      format: "pdf",
    }
    const snapshots: ReaderSnapshot[] = []
    const errors: Error[] = []

    await act(async () => {
      root.render(
        <module.DocumentReader
          source={staleSource}
          showToolbar={false}
          onReady={(snapshot) => snapshots.push(snapshot)}
          onError={(error) => errors.push(error)}
        />,
      )
      await Promise.resolve()
    })
    await waitFor(() => releaseStaleRead !== undefined)

    await act(async () => {
      root.render(
        <module.DocumentReader
          source={replacementSource}
          showToolbar={false}
          onReady={(snapshot) => snapshots.push(snapshot)}
          onError={(error) => errors.push(error)}
        />,
      )
      await Promise.resolve()
    })
    await waitFor(() => snapshots.length === 1 || errors.length > 0)
    expect(errors).toEqual([])
    expect(container.querySelector('.pdfViewer .page[data-page-number="1"]')).not.toBeNull()

    const staleBuffer = await new Blob([pdfBytes]).arrayBuffer()
    releaseStaleRead?.(staleBuffer)
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ASYNC_SMOKE_POLL_MS * 2)
      })
    })

    expect(errors).toEqual([])
    expect(snapshots).toHaveLength(1)
    expect(container.querySelector('.pdfViewer .page[data-page-number="1"]')).not.toBeNull()
  })

  test("repairs migrated Foliate PDF annotations with PDF.js text geometry", async () => {
    const module = documentReaderModule
    if (!module) throw new Error("DocumentReader module was not initialized")
    const source: ReaderSource = {
      kind: "blob",
      blob: new Blob([createSyntheticMultiPagePdf()], { type: "application/pdf" }),
      name: "synthetic.pdf",
      sourceId: "synthetic-annotation-migration",
      format: "pdf",
    }
    localStorage.setItem(
      `${BOOK_STATE_STORAGE_KEY_PREFIX}legacy__synthetic-pdf`,
      JSON.stringify({
        bookmarks: [],
        annotations: [
          {
            value: "epubcfi(/6/2!/4/2,/1:0,/1:24)",
            text: "Buddy PDF page one alpha",
            note: "Legacy note",
            style: "underline",
            color: "#38bdf8",
          },
        ],
      }),
    )
    const annotationSnapshots: ReaderAnnotation[][] = []
    const errors: Error[] = []

    await act(async () => {
      root.render(
        <module.DocumentReader
          source={source}
          showToolbar={false}
          onAnnotationsChange={(annotations) => annotationSnapshots.push(annotations)}
          onError={(error) => errors.push(error)}
        />,
      )
      await Promise.resolve()
    })
    await waitFor(() =>
      annotationSnapshots.some(
        (annotations) =>
          annotations[0]?.anchor.kind === "pdf-text" &&
          (annotations[0]?.anchor.segments[0]?.quads.length ?? 0) > 0,
      ),
    )

    expect(errors).toEqual([])
    expect(annotationSnapshots.at(-1)?.[0]).toMatchObject({
      text: "Buddy PDF page one alpha",
      note: "Legacy note",
      style: "underline",
      anchor: {
        kind: "pdf-text",
        segments: [{ pageIndex: 0, startOffset: 0, endOffset: 24 }],
      },
    })
  })

  test("streams scoped search results with exact PDF anchors", async () => {
    const module = pdfViewerSessionModule
    if (!module) throw new Error("PDF viewer session module was not initialized")
    const viewerContainer = document.createElement("div")
    const viewerElement = document.createElement("div")
    viewerElement.className = "pdfViewer"
    viewerContainer.append(viewerElement)
    container.append(viewerContainer)
    const snapshots: ReaderSnapshot[] = []
    const errors: Error[] = []
    const session = new module.PdfViewerSession({
      container: viewerContainer,
      viewerElement,
      source: {
        kind: "blob",
        blob: new Blob([createSyntheticMultiPagePdf()], { type: "application/pdf" }),
        name: "search.pdf",
        sourceId: "synthetic-search",
        format: "pdf",
      },
      mode: { layout: "continuous", scaleMode: "fit-width", rotation: 0 },
      callbacks: {
        onReady: (snapshot) => snapshots.push(snapshot),
        onLocationChange: () => undefined,
        onScaleChange: () => undefined,
        onPageRendered: () => undefined,
        onTextLayerRendered: () => undefined,
        onPassword: () => undefined,
        onLayoutFallback: () => undefined,
        onError: (error) => errors.push(error),
      },
    })

    try {
      await waitFor(() => snapshots.length > 0 || errors.length > 0)
      expect(errors).toEqual([])
      const sectionResults = await session.search(
        {
          query: "Buddy",
          scope: "section",
          matchCase: false,
          matchWholeWords: true,
          matchDiacritics: false,
        },
        new AbortController().signal,
      )
      expect(sectionResults).toHaveLength(1)

      const streamedResults: string[][] = []
      const documentResults = await session.search(
        {
          query: "page",
          scope: "document",
          matchCase: false,
          matchWholeWords: true,
          matchDiacritics: false,
        },
        new AbortController().signal,
        undefined,
        (results) => streamedResults.push(results.map((result) => result.id)),
      )

      expect(streamedResults).toHaveLength(3)
      expect(documentResults.map((result) => result.label)).toEqual([
        "Page i",
        "Page Sheet 7",
        "Page Appendix",
      ])
      expect(
        documentResults.every(
          (result) =>
            result.anchor.kind === "pdf-text" &&
            result.anchor.segments.every((segment) => segment.quads.length > 0),
        ),
      ).toBe(true)
      const secondResult = documentResults[1]
      expect(secondResult?.anchor.kind).toBe("pdf-text")
      if (!secondResult || secondResult.anchor.kind !== "pdf-text") return
      const secondAnchor = secondResult.anchor
      expect(await session.resolveTextAnchorPosition(secondAnchor)).toMatchObject({
        kind: "pdf-position",
        pageIndex: 1,
      })
      await session.showSearchResult(secondResult)
      await waitFor(() => session.getCurrentPosition()?.pageIndex === 1)
      expect(session.getCurrentPosition()?.pageIndex).toBe(1)
    } finally {
      await session.destroy()
    }
  })
})
