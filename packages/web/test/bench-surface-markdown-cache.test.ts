import { describe, expect, test } from "bun:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import {
  benchSurfaceQueryKeys,
  cacheMarkdownBenchFile,
  forgetMarkdownBenchFile,
  invalidateMarkdownBenchFile,
  markdownBenchApprovedFileQueryOptions,
  type MarkdownBenchFileData,
} from "../src/state/bench-surface-query"
import type { ProjectExplorerEditableFileState } from "../src/state/chat-actions"

const LOCATION = { directory: "/repo", path: "notes/worksheet.md" }
const APPROVED_KEY = markdownBenchApprovedFileQueryOptions(LOCATION).queryKey

function savedFile(content: string, version: string): ProjectExplorerEditableFileState {
  return { path: LOCATION.path, content, version }
}

function seedReady(client: QueryClient, content: string) {
  client.setQueryData(benchSurfaceQueryKeys.markdownFile(LOCATION), {
    status: "ready",
    initialFile: savedFile(content, "version-1"),
    sizeBytes: 12,
  } satisfies MarkdownBenchFileData)
}

describe("Markdown Bench file cache", () => {
  test("a save replaces the content a reopened surface would seed the editor with", () => {
    const client = new QueryClient()
    seedReady(client, "original")

    cacheMarkdownBenchFile(client, { ...LOCATION, file: savedFile("edited", "version-2") })

    const cached = client.getQueryData<MarkdownBenchFileData>(
      benchSurfaceQueryKeys.markdownFile(LOCATION),
    )
    expect(cached).toEqual({
      status: "ready",
      initialFile: savedFile("edited", "version-2"),
      sizeBytes: 12,
    })
  })

  test("does not turn a large-file approval prompt into cached content", () => {
    const client = new QueryClient()
    client.setQueryData(benchSurfaceQueryKeys.markdownFile(LOCATION), {
      status: "requires-approval",
      sizeBytes: 9_000_000,
    } satisfies MarkdownBenchFileData)

    cacheMarkdownBenchFile(client, { ...LOCATION, file: savedFile("edited", "version-2") })

    expect(
      client.getQueryData<MarkdownBenchFileData>(benchSurfaceQueryKeys.markdownFile(LOCATION)),
    ).toEqual({ status: "requires-approval", sizeBytes: 9_000_000 })
  })

  test("never creates cache entries for surfaces that never loaded the file", () => {
    const client = new QueryClient()

    cacheMarkdownBenchFile(client, { ...LOCATION, file: savedFile("edited", "version-2") })

    expect(client.getQueryData(benchSurfaceQueryKeys.markdownFile(LOCATION))).toBeUndefined()
    expect(client.getQueryData(APPROVED_KEY)).toBeUndefined()
  })

  test("keeps the approved large-file entry in step with the same save", () => {
    const client = new QueryClient()
    client.setQueryData(APPROVED_KEY, savedFile("original", "version-1"))

    cacheMarkdownBenchFile(client, { ...LOCATION, file: savedFile("edited", "version-2") })

    expect(client.getQueryData<ProjectExplorerEditableFileState>(APPROVED_KEY)).toEqual(
      savedFile("edited", "version-2"),
    )
  })

  test("drops both content entries when the note is renamed away", () => {
    const client = new QueryClient()
    seedReady(client, "original")
    client.setQueryData(APPROVED_KEY, savedFile("original", "version-1"))

    forgetMarkdownBenchFile(client, LOCATION)

    expect(client.getQueryData(benchSurfaceQueryKeys.markdownFile(LOCATION))).toBeUndefined()
    expect(client.getQueryData(APPROVED_KEY)).toBeUndefined()
  })

  test("invalidates an active markdown query without starting a refetch", async () => {
    const client = new QueryClient()
    const markdownKey = benchSurfaceQueryKeys.markdownFile(LOCATION)
    const ready = {
      status: "ready",
      initialFile: savedFile("original", "version-1"),
      sizeBytes: 12,
    } satisfies MarkdownBenchFileData
    let loads = 0
    const observed = {
      queryKey: markdownKey,
      queryFn: () => {
        loads += 1
        return Promise.resolve(ready)
      },
      staleTime: Number.POSITIVE_INFINITY,
    }

    await client.fetchQuery(observed)
    const observer = new QueryObserver(client, observed)
    const unsubscribe = observer.subscribe(() => undefined)

    try {
      invalidateMarkdownBenchFile(client, LOCATION)

      expect(client.getQueryState(markdownKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(markdownKey)?.fetchStatus).toBe("idle")
      expect(loads).toBe(1)
    } finally {
      unsubscribe()
      client.clear()
    }
  })
})
