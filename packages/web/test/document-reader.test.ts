import { describe, expect, test } from "bun:test"
import {
  documentReaderEngine,
  foliateLocationToReaderRelocation,
  foliateSelectionToReaderSelection,
  readerSourceToFoliateSource,
} from "../src/components/readers/document-reader-adapters"
import type { ReaderSource } from "../src/components/readers/reader-types"
import { isPdfReaderSource } from "../src/components/readers/reader-types"
import { createSyntheticMultiPagePdf } from "./fixtures/synthetic-pdf"

const PDF_SOURCE: ReaderSource = {
  kind: "blob",
  blob: new Blob(["pdf"], { type: "application/pdf" }),
  name: "reference.pdf",
  sourceId: "reference",
  format: "pdf",
}

const EPUB_SOURCE: ReaderSource = {
  kind: "blob",
  blob: new Blob(["epub"], { type: "application/epub+zip" }),
  name: "reference.epub",
  sourceId: "reference",
  format: "epub",
}

describe("DocumentReader adapters", () => {
  test("routes PDF sources to PDF.js and EPUB sources to Foliate", () => {
    expect(documentReaderEngine(PDF_SOURCE)).toBe("pdf")
    expect(documentReaderEngine(EPUB_SOURCE)).toBe("foliate")
    expect(documentReaderEngine(null)).toBe("foliate")
  })

  test("recognizes a real PDF blob without requiring an explicit format hint", () => {
    const source: ReaderSource = {
      kind: "blob",
      blob: new Blob([createSyntheticMultiPagePdf()], { type: "application/pdf" }),
      name: "synthetic-document",
      sourceId: "synthetic-pdf",
    }

    expect(isPdfReaderSource(source)).toBe(true)
    expect(documentReaderEngine(source)).toBe("pdf")
  })

  test("uses a PDF filename hint when a signed URL has no extension", () => {
    const source: ReaderSource = {
      kind: "url",
      url: "https://documents.example/download?id=reference",
      name: "reference.pdf",
      sourceId: "signed-pdf",
    }

    expect(isPdfReaderSource(source)).toBe(true)
    expect(documentReaderEngine(source)).toBe("pdf")
  })

  test("honors an explicit non-PDF format over misleading file metadata", () => {
    const source: ReaderSource = {
      kind: "blob",
      blob: new Blob(["epub"], { type: "application/pdf" }),
      name: "misleading.pdf",
      sourceId: "explicit-epub",
      format: "epub",
    }

    expect(isPdfReaderSource(source)).toBe(false)
    expect(documentReaderEngine(source)).toBe("foliate")
  })

  test("adapts an engine-neutral source without leaking persistence metadata", () => {
    expect(readerSourceToFoliateSource(EPUB_SOURCE)).toEqual({
      kind: "blob",
      blob: EPUB_SOURCE.blob,
      name: "reference.epub",
    })
  })

  test("emits a neutral CFI relocation only after Foliate has a real CFI", () => {
    expect(foliateLocationToReaderRelocation({ fraction: 0 })).toBeUndefined()
    expect(
      foliateLocationToReaderRelocation({
        cfi: "epubcfi(/6/4!/4/2)",
        index: 2,
        fraction: 0.25,
        tocLabel: "Chapter 2",
        currentPassageText: "A passage",
      }),
    ).toEqual({
      anchor: {
        kind: "cfi-position",
        cfi: "epubcfi(/6/4!/4/2)",
        sectionIndex: 2,
      },
      fraction: 0.25,
      tocLabel: "Chapter 2",
      currentPassageText: "A passage",
    })
  })

  test("adapts Foliate text selections to the shared anchor contract", () => {
    expect(
      foliateSelectionToReaderSelection({
        text: "Selected text",
        cfi: "epubcfi(/6/4!/4/2:0,/1:0,/1:13)",
        index: 2,
        selectionKey: "selection-1",
        pageLabel: "14",
      }),
    ).toEqual({
      text: "Selected text",
      anchor: {
        kind: "cfi-text",
        cfi: "epubcfi(/6/4!/4/2:0,/1:0,/1:13)",
        sectionIndex: 2,
      },
      selectionKey: "selection-1",
      pageLabel: "14",
    })
  })
})
