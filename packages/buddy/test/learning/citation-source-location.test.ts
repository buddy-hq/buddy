import { describe, expect, test } from "bun:test"
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import path from "node:path"
import { CITATION_SCHEMA_VERSION, type Citation } from "@buddy/citation-contract"
import {
  findCitationLineRange,
  resolveCitationProviderLocation,
} from "../../src/learning/prompt/citation-source-location"
import { tmpdir } from "../helpers/tmpdir"

const selector = { version: 1 as const, start: 0, end: 10, prefix: "", suffix: "" }

function documentCitation(input: { excerpt: string; path: string; directory?: string }): Citation {
  return {
    schemaVersion: CITATION_SCHEMA_VERSION,
    id: "citation-doc",
    excerpt: input.excerpt,
    comment: "explain",
    source: Object.assign(
      { kind: "document" as const, path: input.path, selector },
      input.directory === undefined ? undefined : { directory: input.directory },
    ),
  }
}

describe("citation source location", () => {
  test("keeps a web quote's location to its URL without reading the workspace", async () => {
    const citation: Citation = {
      schemaVersion: CITATION_SCHEMA_VERSION,
      id: "citation-web",
      excerpt: "Plants turn light into energy.",
      source: { kind: "web", url: "https://example.com/plants", selector },
    }
    expect(
      await resolveCitationProviderLocation(citation, {
        directory: "/workspace-that-does-not-exist",
        sessionID: "session-1",
      }),
    ).toEqual({ currentSessionID: "session-1" })
  })

  test("finds the lines a multi-line excerpt spans", () => {
    const text =
      "# Title\n\nIntro line.\nHabits are the compound\ninterest of self-improvement.\nEnd."
    expect(
      findCitationLineRange(
        text,
        "Habits are the compound\ninterest of self-improvement.",
        selector,
      ),
    ).toEqual({ start: 4, end: 5 })
  })

  test("maps rendered Markdown text back through source formatting", () => {
    const text = "# The **important** [result](https://example.com)\n\nNext line."
    expect(
      findCitationLineRange(text, "The important result", {
        ...selector,
        end: "The important result".length,
      }),
    ).toEqual({ start: 1, end: 1 })
  })

  test("matches normalized rendered whitespace without losing the source line", () => {
    expect(
      findCitationLineRange(
        "before\nThe  important result\nafter",
        "The important result",
        selector,
      ),
    ).toEqual({
      start: 2,
      end: 2,
    })
  })

  test("finds the final line after the first-line occurrence", () => {
    expect(findCitationLineRange("foo bar baz\nbaz", "foo bar baz\nbaz", selector)).toEqual({
      start: 1,
      end: 2,
    })
    expect(findCitationLineRange("repeat me\nrepeat me", "repeat me\nrepeat me", selector)).toEqual(
      {
        start: 1,
        end: 2,
      },
    )
  })

  test("does not fabricate an end line when only the excerpt prefix remains", () => {
    expect(findCitationLineRange("one\ntwo", "one\nmissing", selector)).toBeUndefined()
  })

  test("uses the text before the quote to pick between repeated passages", () => {
    const text = "Alpha one\nrepeat me\nBeta two\nrepeat me\n"
    expect(findCitationLineRange(text, "repeat me", { ...selector, prefix: "Beta two " })).toEqual({
      start: 4,
      end: 4,
    })
  })

  test("leaves the lines out when the quote is no longer in the file", () => {
    expect(
      findCitationLineRange("Completely different text", "missing quote", selector),
    ).toBeUndefined()
  })

  test("resolves a workspace path and lines from the quote's own root folder", async () => {
    await using notebook = await tmpdir()
    const notesDirectory = path.join(notebook.path, "notes")
    mkdirSync(path.join(notesDirectory, "daily"), { recursive: true })
    writeFileSync(path.join(notesDirectory, "daily", "today.md"), "one\ntwo\nquoted line\n")
    const location = await resolveCitationProviderLocation(
      documentCitation({
        excerpt: "quoted line",
        path: "daily/today.md",
        directory: notesDirectory,
      }),
      { directory: notebook.path, sessionID: "session-1" },
    )
    expect(location).toEqual({
      absolutePath: path.join(notesDirectory, "daily", "today.md"),
      lines: { start: 3, end: 3 },
      currentSessionID: "session-1",
    })
  })

  test("does not resolve an absolute citation path outside the active workspace", async () => {
    await using notebook = await tmpdir()
    await using outside = await tmpdir()
    const outsidePath = path.join(outside.path, "private.md")
    writeFileSync(outsidePath, "private quote\n")

    const location = await resolveCitationProviderLocation(
      documentCitation({ excerpt: "private quote", path: outsidePath }),
      { directory: notebook.path, sessionID: "session-1" },
    )

    expect(location).toEqual({ currentSessionID: "session-1" })
  })

  test("does not resolve a citation path that traverses outside the active workspace", async () => {
    await using notebook = await tmpdir()
    await using outside = await tmpdir()
    const outsidePath = path.join(outside.path, "private.md")
    writeFileSync(outsidePath, "private quote\n")

    const location = await resolveCitationProviderLocation(
      documentCitation({
        excerpt: "private quote",
        path: path.relative(notebook.path, outsidePath),
      }),
      { directory: notebook.path },
    )

    expect(location).toEqual({})
  })

  test("does not trust a citation source directory outside the active workspace", async () => {
    await using notebook = await tmpdir()
    await using outside = await tmpdir()
    writeFileSync(path.join(outside.path, "private.md"), "private quote\n")

    const absoluteDirectoryLocation = await resolveCitationProviderLocation(
      documentCitation({
        excerpt: "private quote",
        path: "private.md",
        directory: outside.path,
      }),
      { directory: notebook.path },
    )
    const traversingDirectoryLocation = await resolveCitationProviderLocation(
      documentCitation({
        excerpt: "private quote",
        path: "private.md",
        directory: path.relative(notebook.path, outside.path),
      }),
      { directory: notebook.path },
    )

    expect(absoluteDirectoryLocation).toEqual({})
    expect(traversingDirectoryLocation).toEqual({})
  })

  test("does not follow a workspace symlink to a citation source outside the workspace", async () => {
    await using notebook = await tmpdir()
    await using outside = await tmpdir()
    writeFileSync(path.join(outside.path, "private.md"), "private quote\n")
    symlinkSync(outside.path, path.join(notebook.path, "linked-outside"), "junction")

    const location = await resolveCitationProviderLocation(
      documentCitation({
        excerpt: "private quote",
        path: "linked-outside/private.md",
      }),
      { directory: notebook.path },
    )

    expect(location).toEqual({})
  })

  test("falls back to the chat's directory for quotes saved without a root folder", async () => {
    await using notebook = await tmpdir()
    const location = await resolveCitationProviderLocation(
      documentCitation({ excerpt: "gone", path: "missing.md" }),
      { directory: notebook.path },
    )
    expect(location).toEqual({ absolutePath: path.join(notebook.path, "missing.md") })
  })
})
