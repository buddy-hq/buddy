import { describe, expect, test } from "bun:test"
import {
  balanceNotebookSearchResults,
  scoreNotebookSearchText,
  searchNotebookResults,
  searchNotebookCommands,
  type NotebookSearchCommandID,
  type NotebookSearchFilter,
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
  test.each([
    { query: "write", filter: "all", available: ["new-note"], expected: ["new-note"] },
    {
      query: "whiteboard",
      filter: "board",
      available: ["new-board", "open-boards"],
      expected: ["new-board", "open-boards"],
    },
    {
      query: "sources",
      filter: "source",
      available: ["open-resources"],
      expected: ["open-resources"],
    },
    {
      query: "flashcards",
      filter: "practice",
      available: ["open-practice"],
      expected: ["open-practice"],
    },
    { query: "write", filter: "file", available: ["new-note"], expected: [] },
    { query: "note", filter: "all", available: ["open-files"], expected: [] },
    { query: "  ", filter: "all", available: ["new-note"], expected: [] },
  ] satisfies Array<{
    query: string
    filter: NotebookSearchFilter
    available: NotebookSearchCommandID[]
    expected: NotebookSearchCommandID[]
  }>)(
    "commands honor aliases, availability, and filters: $query / $filter",
    ({ query, filter, available, expected }) => {
      expect(
        searchNotebookCommands({ query, filter, available }).map((command) => command.id),
      ).toEqual(expected)
    },
  )

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

  test("keeps abbreviated filename matches returned by file search", () => {
    const results = searchNotebookResults({
      query: "nbs",
      filter: "all",
      results: [
        searchResult({ id: "notebook-search", kind: "file", title: "notebook-search.ts" }),
        searchResult({ id: "unrelated", kind: "file", title: "unrelated.ts" }),
      ],
    })
    expect(results.map((result) => result.id)).toEqual(["notebook-search"])
  })

  test("does not match generic file labels and keeps processed filename abbreviations", () => {
    const file = {
      ...searchResult({ id: "readme", kind: "file", title: "readme.md" }),
      metadata: "File · docs",
    }
    expect(searchNotebookResults({ query: "file", filter: "all", results: [file] })).toEqual([])
    const source = {
      ...searchResult({ id: "source", kind: "source", title: "A book about learning" }),
      matchTitle: "notebook-search.pdf",
      keywords: "books/notebook-search.pdf",
    }
    expect(searchNotebookResults({ query: "nbs", filter: "all", results: [source] })).toEqual([
      source,
    ])
  })

  test("ranks a separator-equivalent file name ahead of a path match", () => {
    const obvious = {
      ...searchResult({ id: "objectives", kind: "file", title: "workshop-objectives.md" }),
      keywords: "notes/workshop-objectives.md",
    }
    const pathMatch = {
      ...searchResult({ id: "chat", kind: "thread", title: "Planning notes" }),
      metadata: "Chat · archive/workshop objectives",
    }
    for (const query of ["workshop objectives", "workshop_objectives", "workshop/objectives"]) {
      expect(
        searchNotebookResults({
          query,
          filter: "all",
          results: [pathMatch, obvious],
        }).map((result) => result.id),
      ).toEqual(["objectives", "chat"])
    }
    const separatorName = scoreNotebookSearchText({ query: "xyz", title: "x-y-z.md" })
    const deepLiteral = scoreNotebookSearchText({
      query: "xyz",
      title: "Other file",
      keywords: `${"deep/".repeat(40)}xyz-notes.md`,
    })
    expect(separatorName).toBeLessThan(deepLiteral ?? Number.POSITIVE_INFINITY)
    expect(
      scoreNotebookSearchText({ query: "xyz", title: "x-many-letters-y-z.md" }),
    ).toBeUndefined()
  })

  test("ranks a filename prefix ahead of a provider-only note", () => {
    const file = searchResult({
      id: "file",
      kind: "file",
      title: "workshop-objectives.md",
    })
    const note = {
      ...searchResult({ id: "note", kind: "note", title: "Meeting recap" }),
      providerMatchedQuery: "workshop objectives",
    }
    expect(
      searchNotebookResults({
        query: "workshop objectives",
        filter: "all",
        results: [note, file],
      }).map((result) => result.id),
    ).toEqual(["file", "note"])
  })

  test("matches reordered tokens and abbreviations for every separator", () => {
    const tokenScore = scoreNotebookSearchText({
      query: "case snake",
      title: "notes/snake-case.md",
    })
    expect(tokenScore).toBeDefined()
    for (const query of ["case snake", "case-snake", "case_snake", "case/snake", "case\\snake"]) {
      expect(scoreNotebookSearchText({ query, title: "notes/snake-case.md" })).toBe(tokenScore)
    }
    const abbreviation = scoreNotebookSearchText({
      query: "nb-search",
      title: "src/notebook-search.ts",
    })
    expect(abbreviation).toBeDefined()
    for (const query of ["nb search", "nb-search", "nb_search", "nb/search", "nb\\search"]) {
      expect(scoreNotebookSearchText({ query, title: "src/notebook-search.ts" })).toBe(abbreviation)
    }
  })

  test("ranks a literal path hit ahead of a loose title abbreviation", () => {
    const literal = scoreNotebookSearchText({
      query: "nbs",
      title: "Other file",
      keywords: `${"deep/".repeat(40)}nbs/readme.md`,
    })
    const abbreviation = scoreNotebookSearchText({ query: "nbs", title: "notebook-search.ts" })
    expect(literal).toBeLessThan(abbreviation ?? Number.POSITIVE_INFINITY)
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
          title: "Chat",
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

  test("an open board appears under both Boards and Open tabs", () => {
    const board: NotebookSearchResult = {
      ...searchResult({ id: "open-board", kind: "board", title: "Geometry board" }),
      target: {
        type: "open-tab",
        tabKey: "object:whiteboard:board-1:view",
        target: {
          type: "object",
          ref: { kind: "whiteboard", objectID: "board-1", revisionID: null, itemID: null },
          viewID: "view",
        },
      },
    }
    expect(
      searchNotebookResults({ query: "geometry", filter: "board", results: [board] }),
    ).toHaveLength(1)
    expect(
      searchNotebookResults({ query: "geometry", filter: "tab", results: [board] }),
    ).toHaveLength(1)
  })
})
