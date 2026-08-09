import { beforeEach, describe, expect, test } from "bun:test"
import { BOOK_STATE_STORAGE_KEY_PREFIX } from "../src/components/readers/foliate-reader-constants"
import {
  loadMirroredEpubBookState,
  saveFoliateBookPersistenceTarget,
} from "../src/components/readers/utils/foliate-storage"
import {
  READER_DOCUMENT_STORAGE_KEY_PREFIX,
  defaultPdfReaderMode,
  loadReaderDocumentState,
  loadStoredReaderDocumentState,
  readerDocumentStorageKey,
  withReaderSourceContentFingerprint,
} from "../src/components/readers/reader-storage"
import type { ReaderSource } from "../src/components/readers/reader-types"

const PERSISTENCE_SUFFIX = "notebook:resource-1"
const SOURCE: ReaderSource = {
  kind: "blob",
  blob: new Blob(["pdf"], { type: "application/pdf" }),
  name: "Guide.pdf",
  sourceId: "pdf-source-1",
  format: "pdf",
  contentFingerprint: "fingerprint-1",
}

function legacyKey(prefix: string): string {
  return `${BOOK_STATE_STORAGE_KEY_PREFIX}${prefix}__guide-pdf__notebook-resource-1`
}

function validPdfAnnotation(id: string) {
  return {
    id,
    anchor: {
      kind: "pdf-text",
      segments: [{ pageIndex: 2, quads: [] }],
      quote: { exact: "PDF text" },
    },
    text: "PDF text",
    note: "",
    style: "highlight",
    color: "sky",
    created: "2026-01-01T00:00:00.000Z",
    modified: "2026-01-01T00:00:00.000Z",
  }
}

describe("reader document storage", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test("defaults PDFs to continuous fit-width scrolling", () => {
    expect(defaultPdfReaderMode()).toEqual({
      layout: "continuous",
      scaleMode: "fit-width",
      rotation: 0,
    })
  })

  test("migrates one bounded Foliate PDF record without fabricating geometry", () => {
    const key = legacyKey("identifier")
    localStorage.setItem(
      key,
      JSON.stringify({
        lastLocation: "epubcfi(/6/6)",
        bookmarks: [
          {
            value: "epubcfi(/6/4)",
            label: "Second page",
            created: "2025-01-01T00:00:00.000Z",
          },
        ],
        annotations: [
          {
            value: "epubcfi(/6/8!/4/2,/1:0,/1:3)",
            text: "Legacy selection",
            note: "Keep this note",
            style: "underline",
            color: "#34d399",
            created: "2025-01-02T00:00:00.000Z",
          },
          {
            value: "malformed",
            index: 4,
            text: "Index fallback",
          },
        ],
      }),
    )

    const state = loadReaderDocumentState(SOURCE, PERSISTENCE_SUFFIX)

    expect(state.identity).toEqual({
      sourceId: SOURCE.sourceId,
      format: "pdf",
      contentFingerprint: "fingerprint-1",
    })
    expect(state.lastLocation).toEqual({
      kind: "pdf-position",
      pageIndex: 2,
      xRatio: 0,
      yRatio: 0,
    })
    expect(state.bookmarks).toEqual([
      {
        id: "legacy_pdf_bookmark_0",
        anchor: { kind: "pdf-position", pageIndex: 1, xRatio: 0, yRatio: 0 },
        label: "Second page",
        created: "2025-01-01T00:00:00.000Z",
      },
    ])
    expect(state.annotations).toHaveLength(2)
    expect(state.annotations[0]).toMatchObject({
      id: "legacy_pdf_annotation_0",
      anchor: {
        kind: "pdf-text",
        segments: [{ pageIndex: 3, quads: [] }],
        quote: { exact: "Legacy selection" },
      },
      note: "Keep this note",
      style: "underline",
      color: "mint",
    })
    expect(state.annotations[1]?.anchor).toMatchObject({
      kind: "pdf-text",
      segments: [{ pageIndex: 4, quads: [] }],
    })
    expect(localStorage.getItem(readerDocumentStorageKey(SOURCE.sourceId))).not.toBeNull()
    expect(localStorage.getItem(key)).not.toBeNull()
  })

  test("does not guess when more than one legacy key matches", () => {
    const legacyState = JSON.stringify({
      lastLocation: "epubcfi(/6/4)",
      bookmarks: [],
      annotations: [],
    })
    localStorage.setItem(legacyKey("first-title"), legacyState)
    localStorage.setItem(legacyKey("second-title"), legacyState)

    const state = loadReaderDocumentState(SOURCE, PERSISTENCE_SUFFIX)

    expect(state.lastLocation).toBeUndefined()
    expect(state.bookmarks).toEqual([])
    expect(state.annotations).toEqual([])
    expect(localStorage.getItem(readerDocumentStorageKey(SOURCE.sourceId))).toBeNull()
  })

  test("accepts only a real Foliate fake CFI when deriving PDF pages", () => {
    localStorage.setItem(
      legacyKey("strict-cfi"),
      JSON.stringify({
        lastLocation: "not-a-cfi/6/6",
        bookmarks: [
          {
            value: "prefix/6/4",
            label: "Invalid",
            created: "2025-01-01T00:00:00.000Z",
          },
        ],
        annotations: [],
      }),
    )

    const state = loadReaderDocumentState(SOURCE, PERSISTENCE_SUFFIX)

    expect(state.lastLocation).toBeUndefined()
    expect(state.bookmarks).toEqual([])
  })

  test("rejects changed bytes and filters anchors from the wrong document format", () => {
    const storageKey = readerDocumentStorageKey(SOURCE.sourceId)
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: 2,
        identity: {
          sourceId: SOURCE.sourceId,
          format: "pdf",
          contentFingerprint: "fingerprint-1",
        },
        lastLocation: { kind: "cfi-position", cfi: "epubcfi(/6/2)" },
        bookmarks: [
          {
            id: "pdf-bookmark",
            anchor: { kind: "pdf-position", pageIndex: 1, xRatio: 0.2, yRatio: 0.3 },
            label: "PDF",
            created: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "epub-bookmark",
            anchor: { kind: "cfi-position", cfi: "epubcfi(/6/2)" },
            label: "EPUB",
            created: "2026-01-01T00:00:00.000Z",
          },
        ],
        annotations: [
          validPdfAnnotation("pdf-annotation"),
          {
            id: "epub-annotation",
            anchor: { kind: "cfi-text", cfi: "epubcfi(/6/2!/4/2)" },
            text: "EPUB text",
            note: "",
            style: "highlight",
            color: "sky",
            created: "2026-01-01T00:00:00.000Z",
            modified: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    )

    const state = loadStoredReaderDocumentState(SOURCE)
    expect(state?.lastLocation).toBeUndefined()
    expect(state?.bookmarks.map((bookmark) => bookmark.id)).toEqual(["pdf-bookmark"])
    expect(state?.annotations.map((annotation) => annotation.id)).toEqual(["pdf-annotation"])

    expect(
      loadStoredReaderDocumentState({ ...SOURCE, contentFingerprint: "changed-fingerprint" }),
    ).toBeUndefined()
    expect(localStorage.length).toBe(1)
    expect(storageKey.startsWith(READER_DOCUMENT_STORAGE_KEY_PREFIX)).toBe(true)
  })

  test("rejects malformed persisted fingerprint metadata", () => {
    localStorage.setItem(
      readerDocumentStorageKey(SOURCE.sourceId),
      JSON.stringify({
        version: 2,
        identity: {
          sourceId: SOURCE.sourceId,
          format: "pdf",
          contentFingerprint: { unsafe: true },
        },
        bookmarks: [],
        annotations: [],
      }),
    )

    expect(
      loadStoredReaderDocumentState({ ...SOURCE, contentFingerprint: undefined }),
    ).toBeUndefined()
  })

  test("keeps an opened EPUB book key paired with its original reader source", () => {
    const firstSource: ReaderSource = {
      kind: "blob",
      blob: new Blob(["first epub"], { type: "application/epub+zip" }),
      name: "First.epub",
      sourceId: "epub-source-1",
      format: "epub",
      contentFingerprint: "epub-fingerprint-1",
    }
    const secondSource: ReaderSource = {
      kind: "blob",
      blob: new Blob(["second epub"], { type: "application/epub+zip" }),
      name: "Second.epub",
      sourceId: "epub-source-2",
      format: "epub",
      contentFingerprint: "epub-fingerprint-2",
    }
    const firstBookKey = `${BOOK_STATE_STORAGE_KEY_PREFIX}first-epub`

    saveFoliateBookPersistenceTarget(
      { bookKey: firstBookKey, readerSource: firstSource },
      {
        lastLocation: "epubcfi(/6/4)",
        bookmarks: [],
        annotations: [],
      },
    )

    expect(loadStoredReaderDocumentState(firstSource)?.lastLocation).toEqual({
      kind: "cfi-position",
      cfi: "epubcfi(/6/4)",
    })
    expect(loadStoredReaderDocumentState(secondSource)).toBeUndefined()
    expect(localStorage.getItem(firstBookKey)).not.toBeNull()
  })

  test("resets mirrored EPUB state when the bytes at one source identity change", () => {
    const bookKey = `${BOOK_STATE_STORAGE_KEY_PREFIX}same-book`
    const original: ReaderSource = {
      kind: "blob",
      blob: new Blob(["first epub"], { type: "application/epub+zip" }),
      name: "Book.epub",
      sourceId: "epub-source-stable",
      format: "epub",
      contentFingerprint: "epub-fingerprint-original",
    }
    const replacement: ReaderSource = {
      ...original,
      blob: new Blob(["replacement epub"], { type: "application/epub+zip" }),
      contentFingerprint: "epub-fingerprint-replacement",
    }
    saveFoliateBookPersistenceTarget(
      { bookKey, readerSource: original },
      {
        lastLocation: "epubcfi(/6/8)",
        bookmarks: [],
        annotations: [],
      },
    )

    expect(loadMirroredEpubBookState(bookKey, replacement)).toEqual({
      bookmarks: [],
      annotations: [],
    })
    expect(loadStoredReaderDocumentState(replacement)?.identity.contentFingerprint).toBe(
      "epub-fingerprint-replacement",
    )
    expect(loadStoredReaderDocumentState(replacement)?.lastLocation).toBeUndefined()
  })

  test("derives stable content fingerprints for EPUB blobs", async () => {
    const first: ReaderSource = {
      kind: "blob",
      blob: new Blob(["epub bytes"], { type: "application/epub+zip" }),
      name: "Book.epub",
      sourceId: "epub-source",
      format: "epub",
    }
    const same = await withReaderSourceContentFingerprint(first)
    const changed = await withReaderSourceContentFingerprint({
      ...first,
      blob: new Blob(["changed epub bytes"], { type: "application/epub+zip" }),
    })

    expect(same?.contentFingerprint).toStartWith("sha256:")
    expect(changed?.contentFingerprint).toStartWith("sha256:")
    expect(changed?.contentFingerprint).not.toBe(same?.contentFingerprint)
  })
})
