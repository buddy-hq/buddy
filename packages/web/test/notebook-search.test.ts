import { describe, expect, test } from "bun:test"
import {
  balanceNotebookSearchResults,
  scoreNotebookSearchText,
  searchNotebookResults,
  type NotebookSearchResult,
  type NotebookSearchResultKind,
} from "../src/state/notebook-search"

function searchResult(input: {
  id: string
  kind: NotebookSearchResultKind
  title: string
  updatedAtMs?: number
}): NotebookSearchResult {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    metadata: input.kind,
    updatedAtMs: input.updatedAtMs ?? 0,
    target: {
      type: "file",
      path: `${input.id}.md`,
      viewer: "markdown",
    },
  }
}

describe("notebook search", () => {
  test("ranks exact and title-prefix matches ahead of metadata and token matches", () => {
    const exact = scoreNotebookSearchText({
      query: "industrial revolution",
      title: "Industrial Revolution",
    })
    const prefix = scoreNotebookSearchText({
      query: "industrial",
      title: "Industrial Revolution",
    })
    const metadata = scoreNotebookSearchText({
      query: "industrial",
      title: "Lesson notes",
      metadata: "Industrial Revolution",
    })
    const tokens = scoreNotebookSearchText({
      query: "revolution lesson",
      title: "Lesson notes",
      metadata: "Industrial Revolution",
    })

    expect(exact).toBe(0)
    expect(prefix).toBeLessThan(metadata ?? Number.POSITIVE_INFINITY)
    expect(metadata).toBeLessThan(tokens ?? Number.POSITIVE_INFINITY)
  })

  test("balances mixed results before filling unused capacity from a dominant kind", () => {
    const scored = [
      ...Array.from({ length: 8 }, (_, index) => ({
        result: searchResult({
          id: `file-${index}`,
          kind: "file",
          title: `File ${index}`,
        }),
        score: index,
      })),
      {
        result: searchResult({
          id: "thread-1",
          kind: "thread",
          title: "Thread",
        }),
        score: 100,
      },
      {
        result: searchResult({
          id: "source-1",
          kind: "source",
          title: "Source",
        }),
        score: 101,
      },
    ]

    const balanced = balanceNotebookSearchResults(scored, 6)

    expect(balanced).toHaveLength(6)
    expect(balanced.some((result) => result.kind === "thread")).toBeTrue()
    expect(balanced.some((result) => result.kind === "source")).toBeTrue()
    expect(balanced.filter((result) => result.kind === "file")).toHaveLength(4)
  })

  test("filters by result type, removes duplicate IDs, and respects the total limit", () => {
    const duplicate = searchResult({
      id: "source-1",
      kind: "source",
      title: "Industrial Revolution",
      updatedAtMs: 10,
    })
    const results = searchNotebookResults({
      query: "industrial",
      filter: "source",
      limit: 2,
      results: [
        duplicate,
        { ...duplicate, metadata: "Source duplicate" },
        searchResult({
          id: "source-2",
          kind: "source",
          title: "Industrial education",
        }),
        searchResult({
          id: "thread-1",
          kind: "thread",
          title: "Industrial chat",
        }),
      ],
    })

    expect(results.map((result) => result.id).toSorted()).toEqual(["source-1", "source-2"])
  })
})
