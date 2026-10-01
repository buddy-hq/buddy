import { describe, expect, test } from "bun:test"
import { rankNotebookFilePaths } from "../src/state/notebook-file-ranking"

describe("notebook file ranking", () => {
  test("ranks filename matches ahead of path-only matches and enforces the result limit", () => {
    expect(
      rankNotebookFilePaths({
        query: "search",
        paths: [
          "docs/search-notes.md",
          "src/features/search/index.ts",
          "src/notebook-search.ts",
          "src/unrelated.ts",
        ],
        limit: 2,
      }),
    ).toEqual(["docs/search-notes.md", "src/notebook-search.ts"])
  })

  test("finds abbreviated filenames after exact and substring matches", () => {
    expect(
      rankNotebookFilePaths({
        query: "nbs",
        paths: ["notes/nbs.md", "src/notebook-search.ts", "src/unrelated.ts"],
      }),
    ).toEqual(["notes/nbs.md", "src/notebook-search.ts"])
  })

  test("keeps deep literal path matches ahead of loose abbreviations", () => {
    expect(
      rankNotebookFilePaths({
        query: "xyz",
        paths: ["x-y-z.md", `${"deep/".repeat(40)}xyz-notes.md`, "x-many-letters-y-z.md"],
      }),
    ).toEqual([`${"deep/".repeat(40)}xyz-notes.md`, "x-y-z.md"])
  })

  test("matches names stored with decomposed accents", () => {
    const decomposed = "café-menu.md"
    expect(rankNotebookFilePaths({ query: "café", paths: [decomposed, "coffee.md"] })).toEqual([
      decomposed,
    ])
  })

  test("matches path segments, spaces, case, and non-Latin names", () => {
    const paths = ["biology/mitosis.md", "Meeting Notes.md", "README.md", "गणित/बीजगणित-नोट्स.md"]
    expect(rankNotebookFilePaths({ query: "biology/mito", paths })).toEqual(["biology/mitosis.md"])
    expect(rankNotebookFilePaths({ query: "meeting notes", paths })).toEqual(["Meeting Notes.md"])
    expect(rankNotebookFilePaths({ query: "readme", paths })).toEqual(["README.md"])
    expect(rankNotebookFilePaths({ query: "बीजगणित", paths })).toEqual(["गणित/बीजगणित-नोट्स.md"])
  })

  test("ranks a full-size index quickly enough for every keystroke", () => {
    const paths = Array.from(
      { length: 25_000 },
      (_, index) => `folder-${Math.floor(index / 200)}/note-${index}.md`,
    )
    rankNotebookFilePaths({ query: "warm", paths })
    const started = performance.now()
    for (const query of [
      "no",
      "not",
      "note",
      "note-",
      "note-1",
      "note-12",
      "nt12",
      "folder-3/note",
    ]) {
      rankNotebookFilePaths({ query, paths, limit: 50 })
    }
    // Eight keystrokes over 25k paths; generous so slow CI machines stay green.
    expect(performance.now() - started).toBeLessThan(800)
  })
})
