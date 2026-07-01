import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  FoliateReaderProps,
  FoliateReaderSnapshot,
} from "../src/components/readers/foliate-reader-types"

const DIRECTORY = "/repo"
const RESOURCE_PATH = "book.pdf"
const RESOURCE_QUERY_KEY_ROOT = "test-reading-blob"
const READER_FAILURE_MESSAGE = "reader failed"

let currentBlob = new Blob(["initial"], { type: "application/pdf" })
let readerShouldError = true
let readerRenderCount = 0

function createReaderSnapshot(): FoliateReaderSnapshot {
  return {
    title: "Book",
    author: "",
    formatLabel: "PDF",
    isFixedLayout: true,
    toc: [],
    pageList: [],
    landmarks: [],
  }
}

mock.module("@/components/readers/foliate-reader", () => ({
  FoliateReader: (props: FoliateReaderProps) => {
    readerRenderCount += 1
    const { onError, onReady } = props
    const source = props.source

    useEffect(() => {
      if (!source) return
      if (readerShouldError) {
        onError?.(new Error(READER_FAILURE_MESSAGE))
        return
      }
      onReady?.(createReaderSnapshot())
    }, [onError, onReady, source])

    return createElement("div", { "data-component": "mock-foliate-reader" }, "Reader")
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

  test("retries the reader when a repaired same-path blob is loaded", async () => {
    const { DirectoryChatReadingReaderPane } = await import(
      "../src/components/directory-chat/directory-chat-reading-reader-pane"
    )
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
    expect(failedRenderCount).toBeGreaterThan(0)

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
    expect(container.querySelector('[data-component="mock-foliate-reader"]')).not.toBeNull()
    expect(readerRenderCount).toBeGreaterThan(failedRenderCount)
  })
})
