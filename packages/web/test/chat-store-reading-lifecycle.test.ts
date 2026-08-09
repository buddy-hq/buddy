import { beforeEach, describe, expect, test } from "bun:test"
import { READER_ANCHOR_KIND_CFI_POSITION, type ReaderRelocation } from "@buddy/reader-contract"
import { useChatStore, type ActiveReadingResourceState } from "../src/state/chat-store"

const DIRECTORY = "/tmp/reader-lifecycle"

beforeEach(() => {
  localStorage.clear()
  useChatStore.setState({
    activeReadingResourceByDirectory: {},
    lastOpenedReadingResourceByDirectory: {},
  })
})

describe("active reading resource lifecycle", () => {
  test("metadata enrichment for the same file preserves live reader context", () => {
    const store = useChatStore.getState()
    store.setActiveReadingResource(DIRECTORY, {
      name: "Book",
      path: "books/book.epub",
    })
    store.updateActiveReadingResourceLocation(DIRECTORY, {
      anchor: {
        kind: READER_ANCHOR_KIND_CFI_POSITION,
        cfi: "epubcfi(/6/4)",
        sectionIndex: 1,
      },
      fraction: 0.25,
      tocLabel: "Chapter 1",
      currentPassageText: "The live passage",
    })

    store.setActiveReadingResource(DIRECTORY, {
      objectID: "resource-1",
      alias: "book",
      name: "Book",
      path: "books/book.epub",
      status: "ready",
    })

    expect(useChatStore.getState().activeReadingResourceByDirectory[DIRECTORY]).toEqual({
      objectID: "resource-1",
      alias: "book",
      name: "Book",
      path: "books/book.epub",
      status: "ready",
      location: {
        anchor: {
          kind: READER_ANCHOR_KIND_CFI_POSITION,
          cfi: "epubcfi(/6/4)",
          sectionIndex: 1,
        },
        fraction: 0.25,
        tocLabel: "Chapter 1",
      },
      currentPassageText: "The live passage",
    })
  })

  test("identical metadata and relocation writes do not notify subscribers", () => {
    const store = useChatStore.getState()
    const resource: ActiveReadingResourceState = {
      objectID: "resource-1",
      name: "Book",
      path: "books/book.epub",
      status: "ready",
    }
    const relocation: ReaderRelocation = {
      anchor: {
        kind: READER_ANCHOR_KIND_CFI_POSITION,
        cfi: "epubcfi(/6/4)",
      },
      fraction: 0.25,
    }

    store.setActiveReadingResource(DIRECTORY, resource)
    store.updateActiveReadingResourceLocation(DIRECTORY, relocation)

    let notifications = 0
    const unsubscribe = useChatStore.subscribe(() => {
      notifications += 1
    })
    store.setActiveReadingResource(DIRECTORY, resource)
    store.updateActiveReadingResourceLocation(DIRECTORY, relocation)
    unsubscribe()

    expect(notifications).toBe(0)
  })
})
