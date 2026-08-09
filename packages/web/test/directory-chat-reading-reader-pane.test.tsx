import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { createBrowserPlatform, PlatformProvider, type Platform } from "../src/context/platform"
import type {
  DocumentReaderProps,
  ReaderSnapshot,
  ReaderSource,
} from "../src/components/readers/reader-types"

const DIRECTORY = "/repo"
const RESOURCE_PATH = "book.pdf"
const RESOURCE_QUERY_KEY_ROOT = "test-reading-blob"
const READER_FAILURE_MESSAGE = "reader failed"

let currentBlob = new Blob(["initial"], { type: "application/pdf" })
let readerShouldError = true
let readerRenderCount = 0
let latestReaderSource: ReaderSource | null = null
let latestOpenExternalLink: DocumentReaderProps["onOpenExternalLink"]

function createReaderSnapshot(): ReaderSnapshot {
  return {
    engine: "pdf",
    capabilities: {
      textFlow: false,
      pageLayouts: true,
      search: true,
      outline: true,
      pageLabels: true,
      textSelection: true,
      annotations: true,
    },
    title: "Book",
    author: "",
    formatLabel: "PDF",
    isFixedLayout: true,
    toc: [],
    pageList: [],
    landmarks: [],
    metadata: [],
  }
}

mock.module("@/components/readers/document-reader", () => ({
  DocumentReader: (props: DocumentReaderProps) => {
    readerRenderCount += 1
    const { onError, onReady } = props
    const source = props.source
    latestReaderSource = source
    latestOpenExternalLink = props.onOpenExternalLink

    useEffect(() => {
      if (!source) return
      if (readerShouldError) {
        onError?.(new Error(READER_FAILURE_MESSAGE))
        return
      }
      onReady?.(createReaderSnapshot())
    }, [onError, onReady, source])

    return createElement("div", { "data-component": "mock-document-reader" }, "Reader")
  },
}))

mock.module("@/state/resources-query", () => ({
  isSupportedReadingResourcePath: () => true,
  resourceCoverQueryOptions: (directory: string, coverRelpath: string) => ({
    queryKey: ["test-cover", directory, coverRelpath],
    queryFn: async () => null,
    retry: false,
  }),
  readingResourceBlobQueryOptions: (directory: string, resourcePath: string) => ({
    queryKey: [RESOURCE_QUERY_KEY_ROOT, directory, resourcePath],
    queryFn: async () => currentBlob,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  }),
}))

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("DirectoryChatReadingReaderPane", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
      writable: true,
    })
    currentBlob = new Blob(["initial"], { type: "application/pdf" })
    readerShouldError = true
    readerRenderCount = 0
    latestReaderSource = null
    latestOpenExternalLink = undefined
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    queryClient.clear()
    container.remove()
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  })

  test("keeps object-backed identity across renames and separates path-backed sources", async () => {
    const { buildWorkspaceReaderSourceId } =
      await import("../src/components/directory-chat/directory-chat-reading-reader-pane")

    const beforeRename = buildWorkspaceReaderSourceId({
      directory: DIRECTORY,
      resourcePath: "books/old-name.epub",
      objectID: "resource-1",
    })
    const afterRename = buildWorkspaceReaderSourceId({
      directory: "/different-workspace",
      resourcePath: "archive/new-name.epub",
      objectID: "resource-1",
    })
    expect(afterRename).toBe(beforeRename)

    expect(
      buildWorkspaceReaderSourceId({
        directory: `${DIRECTORY}/`,
        resourcePath: "books/first.epub",
      }),
    ).not.toBe(
      buildWorkspaceReaderSourceId({
        directory: DIRECTORY,
        resourcePath: "books/second.epub",
      }),
    )
  })

  test("retries the reader when a repaired same-path blob is loaded", async () => {
    const { DirectoryChatReadingReaderPane } =
      await import("../src/components/directory-chat/directory-chat-reading-reader-pane")
    const queryKey = [RESOURCE_QUERY_KEY_ROOT, DIRECTORY, RESOURCE_PATH]
    queryClient.setQueryData(queryKey, currentBlob)

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <DirectoryChatReadingReaderPane
            directory={DIRECTORY}
            resourceName="Book"
            resourcePath={RESOURCE_PATH}
          />
        </QueryClientProvider>,
      )
      await flushEffects()
      await flushEffects()
    })

    expect(container.textContent).toContain(READER_FAILURE_MESSAGE)
    const failedRenderCount = readerRenderCount
    const initialSourceId = latestReaderSource?.sourceId
    expect(failedRenderCount).toBeGreaterThan(0)
    expect(latestReaderSource?.format).toBe("pdf")
    expect(initialSourceId).toBeString()

    currentBlob = new Blob(["repaired"], { type: "application/pdf" })
    readerShouldError = false

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey,
      })
      await flushEffects()
      await flushEffects()
    })

    expect(container.textContent).not.toContain(READER_FAILURE_MESSAGE)
    expect(container.querySelector('[data-component="mock-document-reader"]')).not.toBeNull()
    expect(readerRenderCount).toBeGreaterThan(failedRenderCount)
    expect(latestReaderSource?.sourceId).toBe(initialSourceId)
  })

  test("routes reader links through the active platform", async () => {
    const { DirectoryChatReadingReaderPane } =
      await import("../src/components/directory-chat/directory-chat-reading-reader-pane")
    const queryKey = [RESOURCE_QUERY_KEY_ROOT, DIRECTORY, RESOURCE_PATH]
    const openedLinks: string[] = []
    const platform: Platform = {
      ...createBrowserPlatform(),
      openLink(url) {
        openedLinks.push(url)
      },
    }
    readerShouldError = false
    queryClient.setQueryData(queryKey, currentBlob)

    await act(async () => {
      root.render(
        <PlatformProvider value={platform}>
          <QueryClientProvider client={queryClient}>
            <DirectoryChatReadingReaderPane
              directory={DIRECTORY}
              resourceName="Book"
              resourcePath={RESOURCE_PATH}
            />
          </QueryClientProvider>
        </PlatformProvider>,
      )
      await flushEffects()
      await flushEffects()
    })

    const openExternalLink = latestOpenExternalLink
    expect(openExternalLink).toBeFunction()
    openExternalLink?.("https://example.com/reader-link")
    openExternalLink?.("file:///Users/reader/private.txt")
    openExternalLink?.("example-handler://run/action")

    expect(openedLinks).toEqual(["https://example.com/reader-link"])
  })

  test("suspends the opening timeout while the reader waits for user input", async () => {
    const { shouldStartReaderOpenTimeout } =
      await import("../src/components/directory-chat/directory-chat-reading-reader-pane")

    expect(
      shouldStartReaderOpenTimeout({
        hasReaderData: true,
        ready: false,
        failed: false,
        interactionPending: true,
      }),
    ).toBe(false)
    expect(
      shouldStartReaderOpenTimeout({
        hasReaderData: true,
        ready: false,
        failed: false,
        interactionPending: false,
      }),
    ).toBe(true)
  })
})
