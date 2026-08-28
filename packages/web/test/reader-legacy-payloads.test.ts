import { afterEach, describe, expect, test } from "bun:test"
import { z } from "zod"
import { parsePdfOutline } from "../src/components/readers/pdf/pdf-outline"
import { PdfJsPageViewSchema } from "../src/components/readers/pdf/pdf-geometry"
import { loadBookState } from "../src/components/readers/utils/foliate-storage"
import {
  defaultPdfReaderMode,
  loadStoredReaderDocumentState,
  readerDocumentStorageKey,
  saveReaderPreferences,
} from "../src/components/readers/reader-storage"
import type { ReaderSource } from "../src/components/readers/reader-types"

/**
 * Regression pins for the anti-slop parse-at-I/O wave (954e797b5d).
 *
 * The wave replaced per-field / per-item reads with whole-object zod schemas. Because these all
 * sit behind `safeParse`, a schema that is narrower than the real producer does not throw — it
 * takes the failure branch and the reader silently loses state. Each test below asserts the
 * pre-wave contract: one bad or nullable sibling field must not discard the rest of the record.
 */

const PDF_SOURCE: ReaderSource = {
  kind: "url",
  url: "https://example.invalid/doc.pdf",
  sourceId: "doc1",
  format: "pdf",
}

afterEach(() => {
  globalThis.localStorage.clear()
})

describe("PDF outline destinations survive real PDF.js dest arrays", () => {
  test("keeps the destination for an explicit /Fit dest", () => {
    const [item] = parsePdfOutline([
      { title: "Chapter 1", dest: [{ num: 3, gen: 0 }, { name: "Fit" }], items: [] },
    ])
    expect(item?.title).toBe("Chapter 1")
    expect(item?.destination).toBeDefined()
  })

  test("keeps the destination for an /XYZ dest with coordinates", () => {
    const [item] = parsePdfOutline([
      { title: "Section 2", dest: [{ num: 7, gen: 0 }, { name: "XYZ" }, 0, 792, null], items: [] },
    ])
    expect(item?.destination).toBeDefined()
  })

  test("still keeps named-destination strings", () => {
    const [item] = parsePdfOutline([{ title: "Named", dest: "chapter-1", items: [] }])
    expect(item?.destination).toBe("chapter-1")
  })

  test("an outline entry with no dest still parses without a destination", () => {
    const [item] = parsePdfOutline([{ title: "No dest", items: [] }])
    expect(item?.title).toBe("No dest")
    expect(item?.destination).toBeUndefined()
  })
})

describe("EPUB book state keeps good records alongside a malformed one", () => {
  test("one incomplete bookmark does not discard lastLocation", () => {
    const bookKey = "reader:book:legacy"
    globalThis.localStorage.setItem(
      bookKey,
      JSON.stringify({
        lastLocation: "epubcfi(/6/4[chap]!/4/2/1:0)",
        bookmarks: [
          { value: "epubcfi(/6/4)", label: "Keep me", created: "2024-01-01T00:00:00.000Z" },
          { value: "epubcfi(/6/8)" },
        ],
        annotations: [],
      }),
    )

    const state = loadBookState(bookKey)
    expect(state.lastLocation).toBe("epubcfi(/6/4[chap]!/4/2/1:0)")
    expect(state.bookmarks).toHaveLength(1)
    expect(state.bookmarks[0]?.label).toBe("Keep me")
  })

  test("a malformed annotation does not discard bookmarks", () => {
    const bookKey = "reader:book:legacy-annotation"
    globalThis.localStorage.setItem(
      bookKey,
      JSON.stringify({
        lastLocation: "epubcfi(/6/2)",
        bookmarks: [{ value: "epubcfi(/6/4)", label: "Kept", created: "2024-01-01T00:00:00.000Z" }],
        annotations: [{ value: 42 }],
      }),
    )

    const state = loadBookState(bookKey)
    expect(state.lastLocation).toBe("epubcfi(/6/2)")
    expect(state.bookmarks).toHaveLength(1)
  })

  test("a fully valid record still round-trips", () => {
    const bookKey = "reader:book:valid"
    globalThis.localStorage.setItem(
      bookKey,
      JSON.stringify({ lastLocation: "epubcfi(/6/2)", bookmarks: [], annotations: [] }),
    )
    expect(loadBookState(bookKey).lastLocation).toBe("epubcfi(/6/2)")
  })
})

describe("saving reader preferences preserves the foliate-only keys", () => {
  // saveReaderPreferences read-modify-writes the shared foliate preferences key. A non-loose
  // schema on the read strips undeclared keys, so the write-back deletes marginPx and its seven
  // siblings from storage — a silent, permanent loss of the user's reader settings.
  const GLOBAL_KEY = "buddy:foliate-reader:preferences:v1"

  test("a theme save does not delete marginPx and its siblings", () => {
    globalThis.localStorage.setItem(
      GLOBAL_KEY,
      JSON.stringify({
        themeId: "paper",
        flow: "paginated",
        marginPx: 120,
        fontScaleRem: 1.2,
        lineHeight: 1.8,
        gapPercent: 12,
        maxInlineSizePx: 900,
        maxBlockSizePx: 1800,
        justify: false,
        hyphenate: false,
      }),
    )

    saveReaderPreferences({
      themeId: "sepia",
      reduceMotion: true,
      autohideCursor: false,
      pdfMode: defaultPdfReaderMode(),
    })

    const stored: unknown = JSON.parse(globalThis.localStorage.getItem(GLOBAL_KEY) ?? "{}")
    const parsed = z
      .object({
        themeId: z.string(),
        marginPx: z.number(),
        fontScaleRem: z.number(),
        lineHeight: z.number(),
        gapPercent: z.number(),
        maxInlineSizePx: z.number(),
        maxBlockSizePx: z.number(),
        justify: z.boolean(),
        hyphenate: z.boolean(),
      })
      .safeParse(stored)

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.marginPx).toBe(120)
    expect(parsed.data.fontScaleRem).toBe(1.2)
    expect(parsed.data.themeId).toBe("sepia")
  })
})

describe("PDF page-view parsing preserves the live viewport instance", () => {
  // PDF.js viewport methods read `this.transform`. A zod object schema rebuilds its output as a
  // plain object, stripping that state so the first coordinate conversion throws
  // "Cannot read properties of undefined (reading '0')" and the reader fails to open.
  class FakePageViewport {
    width = 600
    height = 800
    transform = [1, 0, 0, -1, 0, 800]
    convertToPdfPoint(x: number, y: number) {
      return [x * this.transform[0], y * this.transform[3]] as const
    }
    convertToViewportPoint(x: number, y: number) {
      return [x, y] as const
    }
  }

  function pageView() {
    return {
      div: globalThis.document.createElement("div"),
      textLayer: { div: globalThis.document.createElement("div") },
      viewport: new FakePageViewport(),
      pdfPage: { view: [0, 0, 600, 800] },
    }
  }

  test("returns the same viewport reference, not a rebuilt clone", () => {
    const value = pageView()
    const parsed = PdfJsPageViewSchema.safeParse(value)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.viewport).toBe(value.viewport)
  })

  test("converters still work when called off the parsed result", () => {
    const parsed = PdfJsPageViewSchema.safeParse(pageView())
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(() => parsed.data.viewport.convertToPdfPoint(10, 20)).not.toThrow()
    expect(parsed.data.viewport.convertToPdfPoint(10, 20)).toEqual([10, -20])
  })

  test("still rejects a page view whose viewport is malformed", () => {
    const value = Object.assign(pageView(), { viewport: { width: 600 } })
    expect(PdfJsPageViewSchema.safeParse(value).success).toBe(false)
  })
})

describe("stored reader document state survives a bad sibling field", () => {
  test("an unsatisfiable pdfMode does not discard the saved page", () => {
    globalThis.localStorage.setItem(
      readerDocumentStorageKey(PDF_SOURCE.sourceId),
      JSON.stringify({
        version: 2,
        identity: { sourceId: "doc1", format: "pdf" },
        lastLocation: { kind: "pdf-position", pageIndex: 12, xRatio: 0, yRatio: 0.4 },
        bookmarks: [],
        annotations: [],
        // scaleMode "custom" without `scale` fails PdfReaderModeSchema's refine.
        pdfMode: { layout: "continuous", scaleMode: "custom", rotation: 0 },
      }),
    )

    const state = loadStoredReaderDocumentState(PDF_SOURCE)
    expect(state).toBeDefined()
    expect(state?.lastLocation).toBeDefined()
  })

  test("one incomplete bookmark does not discard the saved page", () => {
    globalThis.localStorage.setItem(
      readerDocumentStorageKey(PDF_SOURCE.sourceId),
      JSON.stringify({
        version: 2,
        identity: { sourceId: "doc1", format: "pdf" },
        lastLocation: { kind: "pdf-position", pageIndex: 12, xRatio: 0, yRatio: 0.4 },
        bookmarks: [
          { id: "b1", anchor: { kind: "pdf-position", pageIndex: 3 }, label: "No created" },
        ],
        annotations: [],
      }),
    )

    const state = loadStoredReaderDocumentState(PDF_SOURCE)
    expect(state).toBeDefined()
    expect(state?.lastLocation).toBeDefined()
  })

  test("a fully valid v2 record still loads", () => {
    globalThis.localStorage.setItem(
      readerDocumentStorageKey(PDF_SOURCE.sourceId),
      JSON.stringify({
        version: 2,
        identity: { sourceId: "doc1", format: "pdf" },
        lastLocation: { kind: "pdf-position", pageIndex: 12, xRatio: 0, yRatio: 0.4 },
        bookmarks: [],
        annotations: [],
      }),
    )

    expect(loadStoredReaderDocumentState(PDF_SOURCE)?.lastLocation).toBeDefined()
  })

  test("a record for a different sourceId is still ignored", () => {
    globalThis.localStorage.setItem(
      readerDocumentStorageKey(PDF_SOURCE.sourceId),
      JSON.stringify({
        version: 2,
        identity: { sourceId: "other", format: "pdf" },
        bookmarks: [],
        annotations: [],
      }),
    )

    expect(loadStoredReaderDocumentState(PDF_SOURCE)).toBeUndefined()
  })
})
