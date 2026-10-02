import { describe, expect, test } from "bun:test"
import {
  appendNoteBodyEntry,
  parseNoteFile,
  parseNoteSource,
  renderNoteSource,
  replaceNoteMetadata,
} from "../../src/notes/note-file"
import type { BuddyNoteMetadata } from "../../src/notes/note-file"

const METADATA = {
  type: "buddy-note" as const,
  "buddy-id": "01K00000000000000000000000",
  "buddy-notebook-id": "notebook-test",
  notebook: "Research",
}
const EXECUTION_MARKER = "__buddyNotesFrontmatterExecuted"

describe("Notes frontmatter", () => {
  test("never executes frontmatter while reading or rendering Markdown", () => {
    const source = `---javascript\n({ ran: Reflect.set(globalThis, "${EXECUTION_MARKER}", true) })\n---\n# Imported note`
    try {
      expect(
        parseNoteFile({ root: "/notes", filepath: "/notes/imported.md", source, updatedAt: 0 }),
      ).toMatchObject({ content: source, summary: { kind: "plain" } })
      expect(Reflect.has(globalThis, EXECUTION_MARKER)).toBe(false)
      const rendered = renderNoteSource(source, METADATA)
      expect(parseNoteSource(rendered)?.content).toBe(source)
      expect(Reflect.has(globalThis, EXECUTION_MARKER)).toBe(false)
    } finally {
      Reflect.deleteProperty(globalThis, EXECUTION_MARKER)
    }
  })

  test("keeps malformed and unsupported frontmatter as plain Markdown", () => {
    for (const source of [
      "---\nbroken: [\n---\n# Note",
      "---toml\ntitle = 'Note'\n---\n# Note",
      "---\ntype: buddy-note\n---\n# Missing identity",
      "---\ntitle: Missing closing delimiter",
      "\uFEFF---\ntype: buddy-note\n---\n# Missing identity",
    ]) {
      expect(
        parseNoteFile({ root: "/notes", filepath: "/notes/plain.md", source, updatedAt: 0 }),
      ).toMatchObject({ content: source, summary: { kind: "plain" } })
    }
  })

  test("preserves edited bodies exactly, including Markdown that resembles frontmatter", () => {
    for (const content of [
      "",
      "Edited note",
      "Edited note\n",
      "\nEdited note\n\n",
      "---\ntitle: Body text\n---\nKeep this",
    ]) {
      expect(parseNoteSource(renderNoteSource(content, METADATA))).toEqual({
        content,
        metadata: METADATA,
      })
    }
    const windowsSource = renderNoteSource("Body", METADATA).replaceAll("\n", "\r\n")
    expect(parseNoteSource(windowsSource)?.content).toBe("Body")
  })

  test("recognises Buddy frontmatter behind a leading byte-order mark", () => {
    const source = `\uFEFF${renderNoteSource("Body", METADATA)}`
    expect(parseNoteSource(source)).toEqual({ content: "Body", metadata: METADATA })
    expect(
      parseNoteFile({ root: "/notes", filepath: "/notes/Imported.md", source, updatedAt: 0 }),
    ).toMatchObject({
      content: "Body",
      metadata: METADATA,
      summary: { kind: "buddy", id: METADATA["buddy-id"] },
    })
    const windowsSource = source.replaceAll("\n", "\r\n")
    expect(parseNoteSource(windowsSource)).toEqual({ content: "Body", metadata: METADATA })
  })

  test("renders a note read behind a byte-order mark without the mark and reads it back", () => {
    const parsed = parseNoteSource(`\uFEFF${renderNoteSource("Body", METADATA)}`)
    if (!parsed) throw new Error("Expected the note to parse")
    const rewritten = renderNoteSource("Edited", parsed.metadata)
    expect(rewritten.startsWith("---\n")).toBe(true)
    expect(parseNoteSource(rewritten)).toEqual({ content: "Edited", metadata: METADATA })
  })

  test("does not treat a byte-order mark inside the body as frontmatter", () => {
    const source = `Intro\n\uFEFF${renderNoteSource("Body", METADATA)}`
    expect(parseNoteSource(source)).toBeUndefined()
  })
})

const HAND_EDITED_FRONTMATTER = [
  "\uFEFF---",
  "# kept by another tool",
  "type: buddy-note",
  "buddy-id: 01K00000000000000000000000",
  "buddy-notebook-id:   notebook-test   # moved once",
  "notebook: 'Research'",
  "tags: [alpha, beta]",
  "buddy-generated-title: Old title",
  "---",
  "",
].join("\r\n")

function parsedNote(source: string) {
  const parsed = parseNoteSource(source)
  if (!parsed) throw new Error("Expected the note to parse")
  return { source, ...parsed }
}

function crlfNote(frontmatter: readonly string[], body: string) {
  return `﻿---\r\n${frontmatter.join("\r\n")}\r\n---\r\n${body}`
}

describe("Notes metadata updates", () => {
  test("changes only the stamp keys that changed and keeps the rest byte for byte", () => {
    const note = parsedNote(`${HAND_EDITED_FRONTMATTER}Body\r\n`)
    const { "buddy-generated-title": _, ...withoutTitle } = note.metadata

    const rewritten = replaceNoteMetadata(note, {
      ...withoutTitle,
      "buddy-notebook-id": "notebook-moved",
      notebook: "Archive",
      "buddy-last-capture-day": "2026-10-02",
    })

    expect(rewritten).toBe(
      [
        "\uFEFF---",
        "# kept by another tool",
        "type: buddy-note",
        "buddy-id: 01K00000000000000000000000",
        "buddy-notebook-id:   notebook-moved   # moved once",
        "notebook: Archive",
        "tags: [alpha, beta]",
        "buddy-last-capture-day: 2026-10-02",
        "---",
        "Body",
        "",
      ].join("\r\n"),
    )
  })

  test("writes a new body under the kept frontmatter", () => {
    const note = parsedNote(`${HAND_EDITED_FRONTMATTER}Body\r\n`)

    expect(replaceNoteMetadata(note, note.metadata, "New body\r\n")).toBe(
      `${HAND_EDITED_FRONTMATTER}New body\r\n`,
    )
  })

  test("quotes a changed value that YAML would read differently", () => {
    const note = parsedNote(`${HAND_EDITED_FRONTMATTER}Body`)

    const rewritten = replaceNoteMetadata(note, {
      ...note.metadata,
      "buddy-generated-title": "Notes: part 2",
    })

    expect(rewritten).toContain('\r\nbuddy-generated-title: "Notes: part 2"\r\n')
    expect(parseNoteSource(rewritten)?.metadata["buddy-generated-title"]).toBe("Notes: part 2")
  })

  describe("when the stamp cannot be edited in place", () => {
    const MIXED_BODY = "Body\nstray LF\r\nLast line\r\n"

    test.each([
      {
        name: "a changed value spans several lines",
        frontmatter: [
          "# kept by another tool",
          "type: buddy-note",
          "buddy-id: 01K00000000000000000000000",
          "buddy-notebook-id: notebook-test # moved once",
          "notebook: Research",
          'alias: "plain text"',
          "nick: 'single'",
          "buddy-generated-title: Old title",
        ],
        change: (metadata: BuddyNoteMetadata) => {
          const { "buddy-generated-title": _, ...rest } = metadata
          return { ...rest, notebook: "Line one\nLine two" }
        },
        expected: [
          "# kept by another tool",
          "type: buddy-note",
          "buddy-id: 01K00000000000000000000000",
          "buddy-notebook-id: notebook-test # moved once",
          "notebook: |-",
          "  Line one",
          "  Line two",
          'alias: "plain text"',
          "nick: 'single'",
        ],
      },
      {
        name: "the changed value is an alias",
        frontmatter: [
          "type: buddy-note",
          "buddy-id: 01K00000000000000000000000",
          "buddy-notebook-id: notebook-test",
          "shared: &shared Research",
          "notebook: *shared",
        ],
        change: (metadata: BuddyNoteMetadata) => ({ ...metadata, notebook: "Archive" }),
        expected: [
          "type: buddy-note",
          "buddy-id: 01K00000000000000000000000",
          "buddy-notebook-id: notebook-test",
          "shared: &shared Research",
          "notebook: Archive",
        ],
      },
    ])(
      "keeps the byte-order mark, CRLF, authored YAML and exact body bytes when $name",
      ({ frontmatter, change, expected }) => {
        const note = parsedNote(crlfNote(frontmatter, MIXED_BODY))
        const metadata = change(note.metadata)

        const rewritten = replaceNoteMetadata(note, metadata)

        expect(rewritten).toBe(crlfNote(expected, MIXED_BODY))
        expect(parseNoteSource(rewritten)).toEqual({ content: MIXED_BODY, metadata })
        const withNewBody = replaceNoteMetadata(note, metadata, "Edited\nbody\r\n")
        expect(withNewBody).toBe(crlfNote(expected, "Edited\nbody\r\n"))
      },
    )

    test("writes an LF note without a byte-order mark exactly as a fresh render would", () => {
      const note = parsedNote(renderNoteSource("Body\nLast line\n", METADATA))
      const metadata = { ...note.metadata, notebook: "Line one\nLine two" }

      expect(replaceNoteMetadata(note, metadata)).toBe(
        [
          "---",
          "type: buddy-note",
          "buddy-id: 01K00000000000000000000000",
          "buddy-notebook-id: notebook-test",
          "notebook: |-",
          "  Line one",
          "  Line two",
          "---",
          "Body",
          "Last line",
          "",
        ].join("\n"),
      )
    })
  })
})

describe("Notes body appends", () => {
  const ENTRY = "*09:30*\n\nWhy\nthis matters"

  test.each([
    {
      name: "a CRLF note behind a byte-order mark",
      source: `${HAND_EDITED_FRONTMATTER}Body\r\nLast line\r\n`,
      entry: ENTRY,
      expected: "Body\r\nLast line\r\n\r\n*09:30*\r\n\r\nWhy\r\nthis matters\r\n",
    },
    {
      name: "a CRLF note with one stray LF line",
      source: `${HAND_EDITED_FRONTMATTER}Body\nLast line\r\n`,
      entry: ENTRY,
      expected: "Body\nLast line\r\n\r\n*09:30*\r\n\r\nWhy\r\nthis matters\r\n",
    },
    {
      name: "a CRLF note and an entry that already has CRLF lines",
      source: `${HAND_EDITED_FRONTMATTER}Body\r\n`,
      entry: "*09:30*\r\n\r\nWhy\r\nthis matters",
      expected: "Body\r\n\r\n*09:30*\r\n\r\nWhy\r\nthis matters\r\n",
    },
    {
      name: "an LF note",
      source: renderNoteSource("Body\nLast line\n", METADATA),
      entry: ENTRY,
      expected: "Body\nLast line\n\n*09:30*\n\nWhy\nthis matters\n",
    },
    {
      name: "an LF note with one stray CRLF line",
      source: renderNoteSource("Pasted\r\nBody\nLast line\n", METADATA),
      entry: ENTRY,
      expected: "Pasted\r\nBody\nLast line\n\n*09:30*\n\nWhy\nthis matters\n",
    },
  ])("appends to $name in the line ending most of the note uses", ({ source, entry, expected }) => {
    expect(appendNoteBodyEntry(parsedNote(source), entry)).toBe(expected)
  })
})
