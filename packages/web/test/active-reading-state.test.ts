import { describe, expect, test } from "bun:test"
import {
  READER_ANCHOR_KIND_CFI_POSITION,
  READER_ANCHOR_KIND_PDF_POSITION,
} from "@buddy/reader-contract"
import {
  readActiveReadingResourceRecord,
  readActiveReadingResourceState,
  readerTrailEntriesEqual,
} from "../src/state/active-reading-state"

describe("active reading state", () => {
  test("migrates persisted flattened CFI locations at the inbound boundary", () => {
    expect(
      readActiveReadingResourceState({
        objectID: "book-1",
        name: "Book",
        path: "books/book.epub",
        cfi: "epubcfi(/6/2)",
        index: 1,
        fraction: 0.25,
        tocLabel: "Chapter 1",
      }),
    ).toEqual({
      objectID: "book-1",
      name: "Book",
      path: "books/book.epub",
      location: {
        anchor: {
          kind: READER_ANCHOR_KIND_CFI_POSITION,
          cfi: "epubcfi(/6/2)",
          sectionIndex: 1,
        },
        fraction: 0.25,
        tocLabel: "Chapter 1",
      },
    })
  })

  test("keeps PDF locations neutral and never creates a CFI field", () => {
    const state = readActiveReadingResourceState({
      name: "PDF",
      path: "books/book.pdf",
      location: {
        anchor: {
          kind: READER_ANCHOR_KIND_PDF_POSITION,
          pageIndex: 4,
          xRatio: 0.1,
          yRatio: 0.6,
        },
        fraction: 0.5,
        pageLabel: "v",
      },
    })

    expect(state).toEqual({
      name: "PDF",
      path: "books/book.pdf",
      location: {
        anchor: {
          kind: READER_ANCHOR_KIND_PDF_POSITION,
          pageIndex: 4,
          xRatio: 0.1,
          yRatio: 0.6,
        },
        fraction: 0.5,
        pageLabel: "v",
      },
    })
    expect(state).not.toHaveProperty("cfi")
  })

  test("does not fall back to legacy CFI fields when a canonical location is malformed", () => {
    expect(
      readActiveReadingResourceState({
        name: "PDF",
        path: "books/book.pdf",
        location: {
          anchor: {
            kind: READER_ANCHOR_KIND_PDF_POSITION,
            pageIndex: 1,
            xRatio: 2,
            yRatio: 0.5,
          },
        },
        cfi: "epubcfi(/6/2)",
      }),
    ).toEqual({
      name: "PDF",
      path: "books/book.pdf",
    })
  })

  test("strips transient reading context during persisted record hydration", () => {
    expect(
      readActiveReadingResourceRecord({
        "/repo": {
          name: "PDF",
          path: "books/book.pdf",
          location: {
            anchor: {
              kind: READER_ANCHOR_KIND_PDF_POSITION,
              pageIndex: 0,
              xRatio: 0,
              yRatio: 0,
            },
          },
          currentPassageText: "Transient passage",
          readingTrail: [
            {
              label: "Page 1",
              anchor: {
                kind: READER_ANCHOR_KIND_PDF_POSITION,
                pageIndex: 0,
                xRatio: 0,
                yRatio: 0,
              },
            },
          ],
        },
      }),
    ).toEqual({
      "/repo": {
        name: "PDF",
        path: "books/book.pdf",
        location: {
          anchor: {
            kind: READER_ANCHOR_KIND_PDF_POSITION,
            pageIndex: 0,
            xRatio: 0,
            yRatio: 0,
          },
        },
      },
    })
  })

  test("compares trail entries by label, progress, and position anchor", () => {
    const entry = {
      label: "Page 2",
      anchor: {
        kind: READER_ANCHOR_KIND_PDF_POSITION,
        pageIndex: 1,
        xRatio: 0,
        yRatio: 0.25,
      },
      fraction: 0.2,
    }

    expect(readerTrailEntriesEqual(entry, entry)).toBe(true)
    expect(
      readerTrailEntriesEqual(entry, {
        ...entry,
        anchor: { ...entry.anchor, yRatio: 0.5 },
      }),
    ).toBe(false)
  })
})
